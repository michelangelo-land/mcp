# Michelangelo Land MCP

Standalone MCP server for Michelangelo — Cloudflare Worker (Hono + Streamable HTTP, stateless).

It exposes 6 tools and is a **thin client of the public Michelangelo API**:
every tool calls `API_BASE_URL/v1/*` with the user's Bearer token in
passthrough, so authentication (JWT→JWKS), row-level security, prompt
evaluation, and rate limiting all apply API-side.

## Tools

| Tool | Maps to |
|---|---|
| `whoami` | `GET /v1/whoami` |
| `list_projects` | `GET /v1/projects?limit&cursor&visibility` |
| `get_project` | `GET /v1/projects/{projectId}` |
| `create_job` | `POST /v1/jobs` (`type: prompt`) |
| `get_job_status` | `GET /v1/jobs/{jobId}` |
| `wait_for_job` | polls `GET /v1/jobs/{jobId}` with 5s→30s backoff, `done:false` + re-call |

## How it works

- **No secrets.** The worker holds no credentials of its own: the user's
  Bearer is validated against the public JWKS and forwarded to the API.
  Only two public variables are configured (`API_BASE_URL`, `SUPABASE_URL`).
- **MCP at the root.** `POST /` is the MCP endpoint (Bearer required, 401
  without one). `GET /` from a browser (no Bearer, `Accept: text/html`)
  shows a landing page; `GET /health` is a public liveness check.
- **Self-hosted discovery.** `/.well-known/oauth-protected-resource`
  (RFC 9728) and the 401 `WWW-Authenticate` header are same-origin, so they
  follow the domain with no per-domain configuration.
- **Long builds.** `wait_for_job` polls with backoff (~4-5 subrequests per
  50s). For long builds, re-call with a small `maxWaitSeconds`: a
  `done:false` result carries the current status and tells the agent to call
  the tool again.

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
the Cloudflare dashboard). Just keep `API_BASE_URL` pointed at production —
discovery follows the domain on its own.
