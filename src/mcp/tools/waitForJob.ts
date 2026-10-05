import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiClient } from "../client";
import { apiToolResult } from "../result";

const DEFAULT_MAX_WAIT_SECONDS = 50;
const MAX_WAIT_SECONDS_CAP = 600;
const INITIAL_POLL_MS = 5_000;
const MAX_POLL_MS = 30_000;
const POLL_BACKOFF_FACTOR = 1.5;
const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polling helper over GET /v1/jobs/{jobId}.
 * (Logica invariata da michelangelo-api/src/mcp/tools/waitForJob.ts)
 *
 * NOTA Worker standalone: ogni poll è ora una subrequest HTTPS reale verso
 * API_BASE_URL (nel monolite era `app.request()` in-process a costo zero).
 * Con backoff 5s→30s, un'attesa da 50s consuma ~4-5 subrequest: ampiamente
 * sotto il limite (1000/invocation). Per attese lunghe preferire chiamate
 * ripetute con `maxWaitSeconds` piccolo: il risultato `done:false` +
 * `next` dice all'agent di richiamare il tool. Il cap resta 600s ma una
 * singola request Worker non può vivere così a lungo (wall-time limit) —
 * il pattern client-side re-call è il modo supportato per build lunghe.
 */
export function registerWaitForJob(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "wait_for_job",
    {
      title: "Wait for job",
      description:
        "Poll a generation job until it finishes (status succeeded or failed) or `maxWaitSeconds` elapses. If the job is still running when the budget ends, the result has done:false with the current status — call again with the same jobId to keep waiting. A job with status failed is a normal outcome, not a tool error: read job.error for details.",
      inputSchema: {
        jobId: z.string().uuid().describe("UUID of the job."),
        maxWaitSeconds: z
          .number()
          .int()
          .min(1)
          .max(MAX_WAIT_SECONDS_CAP)
          .default(DEFAULT_MAX_WAIT_SECONDS)
          .describe(
            `Maximum seconds to wait before returning the current status (1-${MAX_WAIT_SECONDS_CAP}, default ${DEFAULT_MAX_WAIT_SECONDS}).`,
          ),
      },
    },
    async ({ jobId, maxWaitSeconds }): Promise<CallToolResult> => {
      const deadline = Date.now() + maxWaitSeconds * 1000;
      let interval = INITIAL_POLL_MS;

      for (;;) {
        const res = await api.call(`/v1/jobs/${jobId}`);
        if (!res.ok) return apiToolResult(res);

        const job = (await res.json()) as Record<string, unknown>;
        const status = typeof job.status === "string" ? job.status : "unknown";
        const remaining = deadline - Date.now();

        if (TERMINAL_STATUSES.has(status) || remaining <= 0) {
          const done = TERMINAL_STATUSES.has(status);
          const payload: Record<string, unknown> = { done, status, job };
          if (!done) {
            payload.next = `Job is still ${status}. Call wait_for_job again with jobId "${jobId}" to continue waiting.`;
          }
          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
          };
        }

        await sleep(Math.min(interval, remaining));
        interval = Math.min(interval * POLL_BACKOFF_FACTOR, MAX_POLL_MS);
      }
    },
  );
}
