import type { ChatMessage, SessionInfo } from "./types";

export interface DbSessionRow {
  id: string;
  title: string;
  updated_at: string;
}

const MAX_MESSAGES = 200;
const MAX_CONTENT = 20000;

/** Keep only plain user/assistant text turns (images/files are live-view only). */
export function sanitizeDbMessages(messages: unknown): {
  role: "user" | "assistant";
  content: string;
}[] {
  if (!Array.isArray(messages)) return [];
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages.slice(0, MAX_MESSAGES)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.slice(0, MAX_CONTENT) });
  }
  return out;
}

/** Map a DB row onto the SessionInfo shape the chat UI already renders. */
export function dbRowToSessionInfo(r: DbSessionRow): SessionInfo {
  const ts = Date.parse(r.updated_at);
  const title = typeof r.title === "string" && r.title.trim() ? r.title : r.id;
  return {
    filename: r.id,
    title,
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
  };
}

async function readError(res: Response): Promise<Error> {
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

export async function listDbSessions(): Promise<SessionInfo[]> {
  const res = await fetch("/api/db-sessions", { cache: "no-store" });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as { sessions?: DbSessionRow[] };
  const rows = Array.isArray(data.sessions) ? data.sessions : [];
  return rows
    .filter((r) => r && typeof r.id === "string")
    .map(dbRowToSessionInfo)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function loadDbSession(id: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/db-sessions/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as { messages?: unknown };
  const clean = sanitizeDbMessages(data.messages);
  if (clean.length === 0) throw new Error("not-found");
  return clean;
}

/** Upsert one conversation; resolves with the session id. */
export async function saveDbSession(
  id: string | null,
  title: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch("/api/db-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title, messages }),
  });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as { id?: unknown };
  if (typeof data.id !== "string" || !data.id) throw new Error("db-error");
  return data.id;
}

export async function deleteDbSession(id: string): Promise<void> {
  const res = await fetch(`/api/db-sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) throw await readError(res);
}

export async function deleteAllDbSessions(): Promise<void> {
  const res = await fetch("/api/db-sessions", { method: "DELETE" });
  if (!res.ok) throw await readError(res);
}
