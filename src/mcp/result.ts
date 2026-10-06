import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Maps an API (`/v1`) HTTP response to an MCP tool result.
 *
 * - 2xx → JSON body both as pretty-printed text content and as
 *   `structuredContent` (wrapped in `{ data: ... }` when it is not an object).
 * - non-2xx → `isError: true` carrying the API error contract
 *   (`{ code, message }`) so the calling agent can read the exact failure.
 */
export async function apiToolResult(res: Response): Promise<CallToolResult> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON — keep the raw text as the body.
  }

  if (!res.ok) {
    const err = body as { code?: string; message?: string } | null;
    const detail =
      err !== null && typeof err === "object" && typeof err.message === "string"
        ? `${err.code ?? "error"}: ${err.message}`
        : text.slice(0, 500);
    return {
      isError: true,
      content: [{ type: "text", text: `API error ${res.status} — ${detail}` }],
    };
  }

  const structuredContent =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : { data: body };

  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    structuredContent,
  };
}
