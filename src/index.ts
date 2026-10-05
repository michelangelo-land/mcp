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
 * - GET  /.well-known/oauth-protected-resource → discovery RFC 9728:
 *          dichiara qual è la resource (/mcp di QUESTO worker) e quale
 *          authorization server la protegge (l'API Wrapper).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/health", (c) => c.json({ ok: true, service: "michelangelo-mcp" }));

// RFC 9728 — protected-resource metadata. `resource` è l'/mcp di questo
// Worker (derivato dall'origin della request: funziona su workers.dev oggi
// e sul dominio custom domani); l'authorization server resta l'API Wrapper.
app.get("/.well-known/oauth-protected-resource", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [c.env.API_BASE_URL],
    scopes_supported: ["email"],
    bearer_methods_supported: ["header"],
  });
});

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
