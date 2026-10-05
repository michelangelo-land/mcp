import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "./client";
import { registerWhoami } from "./tools/whoami";
import { registerListProjects } from "./tools/listProjects";
import { registerGetProject } from "./tools/getProject";
import { registerCreateJob } from "./tools/createJob";
import { registerGetJobStatus } from "./tools/getJobStatus";
import { registerWaitForJob } from "./tools/waitForJob";

/**
 * Builds the Michelangelo MCP server for a single request (stateless mode:
 * one server + transport per HTTP request — Workers hold no cross-request
 * state). Tools are pure clients of the public `/v1` contract, authenticated
 * as the end user through the injected ApiClient.
 * (Invariato da michelangelo-api/src/mcp/server.ts)
 */
export function createMcpServer(api: ApiClient): McpServer {
  const server = new McpServer(
    { name: "michelangelo", version: "1.0.0" },
    {
      instructions:
        "Michelangelo turns natural-language prompts into mobile app code. " +
        "Use list_projects to discover the user's projects, create_job to " +
        "start an asynchronous AI generation on an existing project, and " +
        "wait_for_job to block until it finishes. Project creation via API " +
        "is not supported yet.",
    },
  );

  registerWhoami(server, api);
  registerListProjects(server, api);
  registerGetProject(server, api);
  registerCreateJob(server, api);
  registerGetJobStatus(server, api);
  registerWaitForJob(server, api);

  return server;
}
