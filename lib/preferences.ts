import { readErrorResponse as readError } from "./http-error";

export const PREFERENCES_MAX_LEN = 2000;

/** Load the member's saved instructions ("" when none). Throws when the
 * backend is unreachable or the caller is a visitor — callers fall back
 * to the device-local copy. */
export async function loadPreferences(): Promise<string> {
  const res = await fetch("/api/preferences", { cache: "no-store" });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as { custom_instructions?: unknown };
  return typeof data.custom_instructions === "string"
    ? data.custom_instructions.slice(0, PREFERENCES_MAX_LEN)
    : "";
}

/** Save (upsert) the member's instructions. */
export async function savePreferences(custom_instructions: string): Promise<void> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ custom_instructions }),
  });
  if (!res.ok) throw await readError(res);
}
