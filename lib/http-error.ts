/**
 * Shared fetch error/JSON helpers (canonical copies).
 *
 * Constraint: modules loaded by plain `node --test` (sessions-local,
 * db-sessions, …) must stay runtime-import-free — only `import type` —
 * because node cannot resolve extensionless relative imports. So
 * `db-sessions.ts` keeps a small local mirror of readErrorResponse
 * (marked there); everything else delegates here.
 */

/** Parse JSON, upgrading syntax failures to an explanatory Error. */
export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      text.trimStart().startsWith("<")
        ? `Backend returned HTML, not JSON (HTTP ${res.status})`
        : `Bad JSON from backend (HTTP ${res.status})`,
    );
  }
}

/** Turn a non-OK response into an Error carrying the server message. */
export async function readErrorResponse(res: Response): Promise<Error> {
  let code = `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error) code = data.error;
  } catch {
    // keep the HTTP fallback
  }
  const err = new Error(code);
  (err as { status?: number }).status = res.status;
  return err;
}
