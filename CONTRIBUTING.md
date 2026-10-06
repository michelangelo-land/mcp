# Contributing

## Background

This worker is the canonical home of the Michelangelo MCP server. It was
originally embedded in the Michelangelo API service, where the MCP code has
since been removed — there is no sibling copy left to keep in sync.

## Workflow

```bash
cp .dev.vars.example .dev.vars   # never commit .dev.vars
npm install
npm run type-check
npm run dev
```

Run the smoke test before pushing (needs a Supabase JWT):

```bash
MCP_URL=http://localhost:8787 TOKEN=<supabase-jwt> node scripts/smoke-mcp.mjs
```
