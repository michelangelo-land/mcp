/**
 * Smoke test per michelangelo-mcp (standalone).
 * Uso: MCP_URL=http://localhost:8787 TOKEN=<jwt> node scripts/smoke-mcp.mjs
 * Verifica: initialize → tools/list (6 tool attesi) → tools/call whoami.
 */
const MCP_URL = process.env.MCP_URL ?? "http://localhost:8787";
const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("Set TOKEN=<supabase-jwt> (stesso token che usi su /v1/whoami)");
  process.exit(1);
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
};

const rpc = async (method, params, id) => {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const body = await res.json();
  assert(res.ok, `${method} HTTP ${res.status}: ${JSON.stringify(body)}`);
  if (body.error) throw new Error(`${method} error: ${JSON.stringify(body.error)}`);
  return body.result;
};

const origin = new URL(MCP_URL).origin;
const prRes = await fetch(`${origin}/.well-known/oauth-protected-resource`);
const pr = await prRes.json();
assert(prRes.ok, `protected-resource HTTP ${prRes.status}`);
assert(
  pr.resource === origin,
  `resource inattesa: ${pr.resource}`,
);
console.log(`discovery: resource=${pr.resource}`);

const init = await rpc(  "initialize",
  {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-mcp", version: "0.1.0" },
  },
  1,
);
assert(init.serverInfo?.name === "michelangelo", `serverInfo: ${JSON.stringify(init.serverInfo)}`);
console.log(`server: ${init.serverInfo.name} ${init.serverInfo.version}`);

const list = await rpc("tools/list", {}, 2);
const names = list.tools.map((t) => t.name).sort();
assert(
  JSON.stringify(names) ===
    JSON.stringify(["create_job", "get_job_status", "get_project", "list_projects", "wait_for_job", "whoami"]),
  `tool inattesi: ${names.join(", ")}`,
);
console.log(`tools: ${names.join(", ")}`);

const who = await rpc("tools/call", { name: "whoami", arguments: {} }, 3);
assert(who.structuredContent?.user_id, `whoami senza user_id: ${JSON.stringify(who).slice(0, 200)}`);
console.log(`whoami user_id: ${who.structuredContent.user_id}`);

console.log("SMOKE PASSED");
