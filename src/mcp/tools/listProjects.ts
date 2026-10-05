import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../client";
import { apiToolResult } from "../result";

/** GET /v1/projects — paginated list of the user's own projects by default. */
export function registerListProjects(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List the authenticated user's OWN Michelangelo projects, newest first. Returns { data, next_cursor } — pass next_cursor as `cursor` to fetch the next page. By default only the user's own projects are returned; pass visibility:'all' to also include public/shared community projects.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of projects to return (1-100)."),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from a previous response's next_cursor."),
        visibility: z
          .enum(["mine", "all"])
          .default("mine")
          .describe(
            "'mine' (default): only the user's own projects. 'all': own projects plus public/shared community projects.",
          ),
      },
    },
    async ({ limit, cursor, visibility }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      if (visibility !== "mine") params.set("visibility", visibility);
      return apiToolResult(await api.call(`/v1/projects?${params}`));
    },
  );
}
