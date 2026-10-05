import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../client";
import { apiToolResult } from "../result";

/** GET /v1/jobs/{jobId} — point-in-time job status. */
export function registerGetJobStatus(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "get_job_status",
    {
      title: "Get job status",
      description:
        "Get the point-in-time status of a generation job (queued, running, succeeded, failed). Prefer wait_for_job when you want to block until completion.",
      inputSchema: {
        jobId: z.string().uuid().describe("UUID of the job."),
      },
    },
    async ({ jobId }) => apiToolResult(await api.call(`/v1/jobs/${jobId}`)),
  );
}
