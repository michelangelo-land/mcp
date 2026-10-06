import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * JWT auth middleware.
 *
 * - Minimal env: SUPABASE_URL for JWKS validation (+ API_BASE_URL as the
 *   tool backend, AUTH_BASE_URL as the advertised authorization server).
 * - `mcpAuth` derives the protected-resource document URL from the request
 *   origin (same-origin) instead of hardcoding it: it survives domain
 *   changes with no env to maintain.
 */

export interface AuthUser {
  id: string;
  clientId: string | null;
  scopes: string[];
  /** Raw bearer token — forwarded to /v1 so RLS/prompt/rate-limit apply to the user. */
  token: string;
}

export interface Env {
  SUPABASE_URL: string;
  API_BASE_URL: string;
  AUTH_BASE_URL: string;
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
 * JWT auth for / (root) — 401 with `WWW-Authenticate: Bearer resource_metadata=…`
 * (MCP spec 2025-06-18 / RFC 9728) so clients discover the OAuth flow.
 * The metadata document URL is same-origin (served by this same worker
 * in `src/index.ts`), so it survives domain changes with no env.
 */
export const mcpAuth = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (c, next) => {
  const unauthorized = (body: { code: string; message: string }) => {
    const origin = new URL(c.req.url).origin;
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
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
