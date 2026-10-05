import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpAuth, type AppVariables, type Env } from "./middleware/auth";
import { ApiClient } from "./mcp/client";
import { createMcpServer } from "./mcp/server";

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Landing page per i browser: `GET /` senza Bearer e con `Accept: text/html`
 * mostra questa pagina (200, senza auth). I client MCP inviano
 * `Accept: application/json, text/event-stream` e passano dal flusso
 * autenticato (401 senza token, come da spec MCP / RFC 9728).
 */
const LANDING_HTML = `<!doctype html>
<html lang="it">
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
<p class="muted">Server MCP (Streamable HTTP) — endpoint in root.</p>
<p>Endpoint MCP: <code>POST <span id="endpoint"></span></code> con header
<code>Authorization: Bearer &lt;jwt-supabase&gt;</code>.</p>
<ul>
<li><a href="/health">/health</a> — liveness, senza auth</li>
<li><a href="/.well-known/oauth-protected-resource">/.well-known/oauth-protected-resource</a> — discovery RFC 9728</li>
</ul>
<pre id="example"></pre>
</main>
<script>
document.getElementById("endpoint").textContent = location.origin;
document.getElementById("example").textContent =
  "# Esempio client MCP (Streamable HTTP)\\n" +
  "curl -X POST " + location.origin + " \\\\\\n" +
  '  -H "Content-Type: application/json" \\\\\\n' +
  '  -H "Accept: application/json, text/event-stream" \\\\\\n' +
  '  -H "Authorization: Bearer <jwt-supabase>" \\\\\\n' +
  '  -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\'';
</script>
</body>
</html>`;

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
 * - POST /       → MCP server (uno McpServer + transport per request, auth)
 * - GET  /       → landing HTML per i browser (senza token + Accept
 *                   text/html); con Bearer resta endpoint MCP (stream SSE)
 * - GET  /health → liveness, senza auth
 * - GET  /.well-known/oauth-protected-resource → discovery RFC 9728:
 *          dichiara qual è la resource (/ di QUESTO worker) e quale
 *          authorization server la protegge (l'API Wrapper).
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/health", (c) => c.json({ ok: true, service: "michelangelo-mcp" }));

// RFC 9728 — protected-resource metadata. `resource` è la root di questo
// Worker (derivato dall'origin della request: funziona su workers.dev oggi
// e sul dominio custom mcp.michelangelo.land domani); l'authorization server
// resta l'API Wrapper.
app.get("/.well-known/oauth-protected-resource", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    resource: origin,
    authorization_servers: [c.env.API_BASE_URL],
    scopes_supported: ["email"],
    bearer_methods_supported: ["header"],
  });
});

// Handler MCP condiviso: valida il Bearer via mcpAuth e inoltra a /v1 con
// il token dell'utente in passthrough.
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

// MCP in root (mcp.michelangelo.land, senza suffisso /mcp): auth applicata
// solo a "/" così /health e /.well-known restano pubblici. OPTIONS senza
// auth per non rompere il preflight CORS dei browser.
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
    // Navigazione browser: nessun token + pagina HTML attesa → landing.
    // I client MCP (Accept: application/json, text/event-stream) e curl
    // (Accept: */*) proseguono verso mcpAuth e prendono 401 senza token.
    if (!hasAuth && accept.includes("text/html")) {
      return c.html(LANDING_HTML);
    }
    await next();
  },
  mcpAuth,
  handleMcp,
);

export default app;
