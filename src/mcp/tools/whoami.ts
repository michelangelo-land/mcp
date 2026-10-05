import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../client";
import { apiToolResult } from "../result";

/** GET /v1/whoami — identity behind the current OAuth token. */
export function registerWhoami(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Return the Michelangelo identity behind the current OAuth token: user id, OAuth client id, and granted scopes.",
    },
    async () => apiToolResult(await api.call("/v1/whoami")),
  );
}
