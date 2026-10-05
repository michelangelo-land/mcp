/**
 * ApiClient — l'unico modo con cui l'MCP server raggiunge la Michelangelo API.
 *
 * ADATTATO da michelangelo-api/src/mcp/client.ts per il Worker standalone:
 * - prima: wrapper sottile su un fetcher iniettato (`app.request()`,
 *   in-process, zero hop di rete);
 * - ora: `fetch()` HTTPS verso API_BASE_URL con il Bearer utente in
 *   passthrough. Ogni tool call attraversa comunque la middleware chain di
 *   `/v1` (validazione JWT via JWKS, PostgREST come utente con RLS, prompt
 *   evaluation, rate limit). Il layer MCP resta un vero client del contratto
 *   pubblico (ADR 0001 / D5), mai una scorciatoia.
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
