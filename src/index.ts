import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpAuth, type AppVariables, type Env } from "./middleware/auth";
import { ApiClient } from "./mcp/client";
import { createMcpServer } from "./mcp/server";

/**
 * michelangelo-mcp — standalone MCP server (Streamable HTTP, stateless).
 *
 * Estratto da michelangelo-api/src/index.ts (blocco `/mcp`).
 * UNICA differenza architetturale: i tool non chiamano più `/v1` via
 * `app.request()` in-process, ma via `fetch()` HTTPS verso API_BASE_URL con
 * il Bearer dell'utente in passthrough. Restano quindi veri client del
 * contratto pubblico (openapi/v1.yaml): JWT→JWKS, RLS, prompt evaluation e
 * rate limit continuano ad applicarsi lato API.
 *
 * Layout:
 * - POST /mcp   → MCP server (uno McpServer + transport per request)
 * - GET  /health → liveness, senza auth
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/health", (c) => c.json({ ok: true, service: "michelangelo-mcp" }));

const mcp = new Hono<{ Bindings: Env; Variables: AppVariables }>()
  .use("*", cors())
  .use("*", mcpAuth)
  .all("/", async (c) => {
    const user = c.get("user");
    const api = new ApiClient(c.env.API_BASE_URL, user.token);
    const server = createMcpServer(api);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return await transport.handleRequest(c.req.raw);
  });

app.route("/mcp", mcp);

export default app;
