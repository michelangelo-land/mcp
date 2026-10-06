/**
 * ApiClient — the only way the MCP server reaches the Michelangelo API.
 *
 * Every tool call is an HTTPS `fetch()` to API_BASE_URL with the user's
 * Bearer in passthrough, so it still goes through the `/v1` middleware
 * chain (JWT validation via JWKS, PostgREST as the user with RLS, prompt
 * evaluation, rate limiting). The MCP layer remains a true client of the
 * public contract, never a shortcut.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    if (init.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    return fetch(url, { ...init, headers });
  }
}
