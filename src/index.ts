import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpAuth, type AppVariables, type Env } from "./middleware/auth";
import { ApiClient } from "./mcp/client";
import { createMcpServer } from "./mcp/server";

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Landing page for browsers: `GET /` without a Bearer token and with
 * `Accept: text/html` serves this page (200, no auth). MCP clients send
 * `Accept: application/json, text/event-stream` and go through the
 * authenticated flow (401 without a token, per the MCP spec / RFC 9728).
 */
const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Michelangelo MCP</title>
<style>
:root { color-scheme: light dark; }
body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem 1rem; }
main { max-width: 640px; margin: 0 auto; }
h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
p.muted { color: gray; margin-top: 0; }
code, pre { background: rgba(127,127,127,.12); border-radius: 6px; }
code { padding: 0.15em 0.4em; }
pre { padding: 1rem; overflow-x: auto; }
ul { padding-left: 1.25rem; }
</style>
</head>
<body>
<main>
<h1>Michelangelo MCP</h1>
<p class="muted">MCP server (Streamable HTTP) — endpoint at the root.</p>
<p>MCP endpoint: <code>POST <span id="endpoint"></span></code> with header
<code>Authorization: Bearer &lt;supabase-jwt&gt;</code>.</p>
<ul>
<li><a href="/health">/health</a> — liveness, no auth</li>
<li><a href="/.well-known/oauth-protected-resource">/.well-known/oauth-protected-resource</a> — RFC 9728 discovery</li>
</ul>
<pre id="example"></pre>
</main>
<script>
document.getElementById("endpoint").textContent = location.origin;
document.getElementById("example").textContent =
  "# MCP client example (Streamable HTTP)\\n" +
  "curl -X POST " + location.origin + " \\\\\\n" +
  '  -H "Content-Type: application/json" \\\\\\n' +
  '  -H "Accept: application/json, text/event-stream" \\\\\\n' +
  '  -H "Authorization: Bearer <supabase-jwt>" \\\\\\n' +
  '  -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\'';
</script>
</body>
</html>`;

/**
 * michelangelo-mcp — standalone MCP server (Streamable HTTP, stateless).
 *
 * Extracted from michelangelo-api/src/index.ts (the `/mcp` block).
 * The ONLY architectural difference: tools no longer call `/v1` via
 * in-process `app.request()`, but via HTTPS `fetch()` to API_BASE_URL with
 * the user's Bearer token in passthrough. They remain true clients of the
 * public contract (openapi/v1.yaml): JWT→JWKS, RLS, prompt evaluation and
 * rate limiting still apply API-side.
 *
 * Layout:
 * - POST /       → MCP server (one McpServer + transport per request, auth)
 * - GET  /       → landing HTML for browsers (no token + Accept
 *                   text/html); with a Bearer it stays an MCP endpoint (SSE stream)
 * - GET  /health → liveness, no auth
 * - GET  /.well-known/oauth-protected-resource → RFC 9728 discovery:
 *          declares which resource this worker protects (/ of THIS worker)
 *          and which authorization server protects it (the API wrapper).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/health", (c) => c.json({ ok: true, service: "michelangelo-mcp" }));

// RFC 9728 — protected-resource metadata. `resource` is the root of this
// worker (derived from the request origin: works on workers.dev today and
// on the mcp.michelangelo.land custom domain); the authorization server
// remains the API wrapper.
app.get("/.well-known/oauth-protected-resource", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    resource: origin,
    authorization_servers: [c.env.API_BASE_URL],
    scopes_supported: ["email"],
    bearer_methods_supported: ["header"],
  });
});

// Shared MCP handler: validates the Bearer via mcpAuth and forwards to /v1
// with the user's token in passthrough.
const handleMcp = async (c: AppContext) => {
  const user = c.get("user");
  const api = new ApiClient(c.env.API_BASE_URL, user.token);
  const server = createMcpServer(api);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return await transport.handleRequest(c.req.raw);
};

// MCP at the root (mcp.michelangelo.land, no /mcp suffix): auth applies
// only to "/" so /health and /.well-known stay public. OPTIONS without
// auth so browser CORS preflights are not broken.
app.options("/", cors(), (c) => c.newResponse(null, 204));
app.post("/", cors(), mcpAuth, handleMcp);
app.put("/", cors(), mcpAuth, handleMcp);
app.patch("/", cors(), mcpAuth, handleMcp);
app.delete("/", cors(), mcpAuth, handleMcp);
app.get(
  "/",
  cors(),
  async (c, next) => {
    const hasAuth = c.req.header("Authorization") != null;
    const accept = c.req.header("Accept") ?? "";
    // Browser navigation: no token + HTML page expected → landing.
    // MCP clients (Accept: application/json, text/event-stream) and curl
    // (Accept: */*) fall through to mcpAuth and get 401 without a token.
    if (!hasAuth && accept.includes("text/html")) {
      return c.html(LANDING_HTML);
    }
    await next();
  },
  mcpAuth,
  handleMcp,
);

export default app;
