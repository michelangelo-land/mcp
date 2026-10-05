import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Auth middleware — copia mirata di michelangelo-api/src/middleware/auth.ts.
 *
 * Differenze rispetto all'originale:
 * - Env ridotto: solo SUPABASE_URL (+ MCP_RESOURCE_METADATA_URL per il 401).
 * - `mcpAuth` legge l'URL del protected-resource document da env invece di
 *   averlo hardcoded (il nuovo Worker può vivere su un host diverso da
 *   api.michelangelo.land).
 */

export interface AuthUser {
  id: string;
  clientId: string | null;
  scopes: string[];
  /** Raw bearer token — inoltrato a /v1 così RLS/prompt/rate-limit applicano all'utente. */
  token: string;
}

export interface Env {
  SUPABASE_URL: string;
  API_BASE_URL: string;
  MCP_RESOURCE_METADATA_URL: string;
}

export interface AppVariables {
  user: AuthUser;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(supabaseUrl: string) {
  let jwks = jwksCache.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
    jwksCache.set(supabaseUrl, jwks);
  }
  return jwks;
}

/**
 * JWT auth per /mcp — 401 con `WWW-Authenticate: Bearer resource_metadata=…`
 * (MCP spec 2025-06-18 / RFC 9728) così i client scoprono il flusso OAuth.
 */
export const mcpAuth = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const unauthorized = (body: { code: string; message: string }) => {
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${c.env.MCP_RESOURCE_METADATA_URL}"`,
    );
    return c.json(body, 401);
  };

  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return unauthorized({
      code: "missing_token",
      message: "Authorization: Bearer <jwt> required",
    });
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(c.env.SUPABASE_URL));
    if (!payload.sub) throw new Error("missing sub");

    c.set("user", {
      id: payload.sub,
      clientId: (payload.client_id as string | undefined) ?? null,
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
      token,
    });
    return await next();
  } catch {
    return unauthorized({
      code: "invalid_token",
      message: "Token expired or invalid",
    });
  }
});
