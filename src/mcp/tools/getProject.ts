import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../client";
import { apiToolResult } from "../result";

/** GET /v1/projects/{projectId} — a single project. */
export function registerGetProject(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Get a single Michelangelo project by its numeric id. Use list_projects to discover ids.",
      inputSchema: {
        projectId: z
          .number()
          .int()
          .positive()
          .describe("Numeric id of the project."),
      },
    },
    async ({ projectId }) =>
      apiToolResult(await api.call(`/v1/projects/${projectId}`)),
  );
}
