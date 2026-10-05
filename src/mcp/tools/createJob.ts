import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../client";
import { apiToolResult } from "../result";

/** POST /v1/jobs — start an async AI generation job on an existing project. */
export function registerCreateJob(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "create_job",
    {
      title: "Create generation job",
      description:
        "Start an asynchronous AI code generation on an EXISTING Michelangelo project (project creation via API is not supported yet — ask the user for a project id or discover one with list_projects). The prompt is evaluated server-side before the job is accepted: prompts that cannot produce a meaningful app are rejected with `invalid_prompt`, and usage above quota returns `rate_limited`. Returns 202 with the queued job; use wait_for_job to await completion.",
      inputSchema: {
        projectId: z
          .number()
          .int()
          .positive()
          .describe("Numeric id of the project to modify."),
        prompt: z
          .string()
          .min(1)
          .describe(
            "Natural-language description of the app change to build.",
          ),
        model: z
          .enum(["light", "full"])
          .optional()
          .describe(
            "Vendor-neutral generation tier. `light`: faster and cheaper, for simple changes. `full`: deepest reasoning, for complex builds. Optional — server-side prompt evaluation assigns the final tier.",
          ),
      },
    },
    async ({ projectId, prompt, model }) => {
      const res = await api.call("/v1/jobs", {
        method: "POST",
        body: JSON.stringify({
          type: "prompt",
          project_id: projectId,
          input: { prompt, ...(model ? { model } : {}) },
        }),
      });
      return apiToolResult(res);
    },
  );
}
