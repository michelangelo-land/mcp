# michelangelo-mcp

Michelangelo's standalone MCP server — Cloudflare Worker (Hono + Streamable HTTP, stateless).

Extracted from `michelangelo-api/src/mcp/`. The server exposes the same 6 tools and stays a **true client of the public contract**
(`michelangelo-api/openapi/v1.yaml`): every tool calls `API_BASE_URL/v1/*`
with the user's Bearer in passthrough, so JWT→JWKS, RLS, prompt
evaluation, and rate limiting keep applying API-side.

## Tools (1:1 replica)

| Tool | Maps to |
|---|---|
| `whoami` | `GET /v1/whoami` |
| `list_projects` | `GET /v1/projects?limit&cursor&visibility` |
| `get_project` | `GET /v1/projects/{projectId}` |
| `create_job` | `POST /v1/jobs` (`type: prompt`) |
| `get_job_status` | `GET /v1/jobs/{jobId}` |
| `wait_for_job` | polls `GET /v1/jobs/{jobId}` with 5s→30s backoff, `done:false` + re-call |

## Differences from the monolith

1. **`src/mcp/client.ts`** — previously a wrapper over in-process `app.request()`
   (zero network); now `fetch(API_BASE_URL + path)` with Bearer passthrough.
2. **`src/middleware/auth.ts`** — trimmed copy of `api/src/middleware/auth.ts`:
   only `SUPABASE_URL` + `API_BASE_URL`; the 401 advertises the same-origin
   protected-resource document served by this same worker.
3. **`src/index.ts`** — only `/` (MCP at the root) + `/health`, no `/v1`, `/auth`,
   `/oauth` routes. `GET /` from a browser (no Bearer, `Accept: text/html`)
   shows a landing HTML page; MCP clients use `POST /` with a Bearer (401
   without a token).
4. **`wait_for_job`** — every poll is now a real subrequest (~4-5 per 50s,
   well under the 1000 limit). For long builds, re-call with a small
   `maxWaitSeconds` (the `done:false` pattern).

## Development

```bash
cp .dev.vars.example .dev.vars   # never commit .dev.vars
npm install
npm run type-check
npm run dev                      # wrangler dev → http://localhost:8787
```

Smoke test against an instance (local dev by default):

```bash
MCP_URL=http://localhost:8787 TOKEN=<supabase-jwt> node scripts/smoke-mcp.mjs
```

## Deploy

```bash
npm run deploy   # → michelangelo-mcp.<account>.workers.dev
```

Production runs at `https://mcp.michelangelo.land` (custom domain attached in
the Cloudflare dashboard).

No discovery changes are needed per domain:
`/.well-known/oauth-protected-resource` and the 401 `WWW-Authenticate` are
same-origin and follow the domain on their own. Just keep `API_BASE_URL`
pointed at production.

## Syncing with the monolith

Keep these files aligned with `michelangelo-api/src/mcp/`:

- `src/mcp/server.ts`, `src/mcp/result.ts`, `src/mcp/tools/*.ts`
- `src/middleware/auth.ts` ↔ `api/src/middleware/auth.ts` (`createAuth`/`mcpAuth`)

The only intentionally divergent file is `src/mcp/client.ts` (remote fetch vs
in-process `app.request()`).
