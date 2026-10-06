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
 * (Logic unchanged from michelangelo-api/src/mcp/tools/waitForJob.ts)
 *
 * Standalone-worker NOTE: every poll is now a real HTTPS subrequest to
 * API_BASE_URL (in the monolith it was a zero-cost in-process `app.request()`).
 * With 5s→30s backoff, a 50s wait costs ~4-5 subrequests: well under the
 * limit (1000/invocation). For long waits, prefer repeated calls with a
 * small `maxWaitSeconds`: the `done:false` + `next` result tells the agent
 * to call the tool again. The cap stays 600s but a single worker request
 * cannot live that long (wall-time limit) — the client-side re-call pattern
 * is the supported way for long builds.
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
