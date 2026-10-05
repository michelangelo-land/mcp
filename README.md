# michelangelo-mcp

Standalone MCP server di Michelangelo — Cloudflare Worker (Hono + Streamable HTTP, stateless).

Estratto da `michelangelo-api/src/mcp/` (monolite in `~/Desktop/api`).
Il server espone gli stessi 6 tool e resta un **vero client del contratto pubblico**
(`michelangelo-api/openapi/v1.yaml`): ogni tool chiama `API_BASE_URL/v1/*`
con il Bearer dell'utente in passthrough, quindi JWT→JWKS, RLS, prompt
evaluation e rate limit continuano ad applicarsi lato API.

## Tool (replica 1:1)

| Tool | Mappa su |
|---|---|
| `whoami` | `GET /v1/whoami` |
| `list_projects` | `GET /v1/projects?limit&cursor&visibility` |
| `get_project` | `GET /v1/projects/{projectId}` |
| `create_job` | `POST /v1/jobs` (`type: prompt`) |
| `get_job_status` | `GET /v1/jobs/{jobId}` |
| `wait_for_job` | poll `GET /v1/jobs/{jobId}` con backoff 5s→30s, `done:false` + re-call |

## Differenze rispetto al monolite

1. **`src/mcp/client.ts`** — prima wrapper su `app.request()` in-process (zero
   rete); ora `fetch(API_BASE_URL + path)` con passthrough del Bearer.
2. **`src/middleware/auth.ts`** — copia ridotta di `api/src/middleware/auth.ts`:
   solo `SUPABASE_URL` + `API_BASE_URL`; il 401 annuncia il protected-resource
   document same-origin servito da questo stesso Worker.
3. **`src/index.ts`** — solo `/mcp` + `/health`, nessuna route `/v1`, `/auth`,
   `/oauth`, `/.well-known`.
4. **`wait_for_job`** — ogni poll è ora una subrequest reale (~4-5 per 50s,
   ok sotto il limite 1000). Per build lunghe usare re-call con
   `maxWaitSeconds` piccolo (pattern `done:false`).

## Sviluppo

```bash
cp .dev.vars.example .dev.vars   # mai committare .dev.vars
npm install
npm run type-check
npm run dev                      # wrangler dev → http://localhost:8787
```

Smoke test contro un'istanza (di default il dev locale):

```bash
MCP_URL=http://localhost:8787/mcp TOKEN=<supabase-jwt> node scripts/smoke-mcp.mjs
```

## Deploy

```bash
npm run deploy   # → michelangelo-mcp.<account>.workers.dev
```

Poi (quando pronto il DNS):

1. Aggiungere la route `mcp.michelangelo.land` in `wrangler.toml`.
2. Nessun cambio discovery: `/.well-known/oauth-protected-resource` e il
   `WWW-Authenticate` dei 401 sono same-origin e seguono il dominio da soli.
3. Allineare `API_BASE_URL` a produzione.

## Sincronizzazione col monolite

File da tenere allineati con `~/Desktop/api/src/mcp/`:

- `src/mcp/server.ts`, `src/mcp/result.ts`, `src/mcp/tools/*.ts`
- `src/middleware/auth.ts` ↔ `api/src/middleware/auth.ts` (`createAuth`/`mcpAuth`)

L'unico file volutamente divergente è `src/mcp/client.ts` (fetch remoto vs
`app.request()` in-process)
