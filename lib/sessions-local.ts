import type { ChatMessage, SessionInfo } from "./types";

const INDEX_KEY = "canary-sessions-index-v1";
const ITEM_PREFIX = "canary-session-v1:";

interface StoredSession {
  title: string;
  messages: ChatMessage[];
  timestamp: number;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 7);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}_${rand}`;
}

function readIndex(): SessionInfo[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is SessionInfo =>
        typeof s?.filename === "string" &&
        s.filename.trim() !== "" &&
        typeof s?.title === "string" &&
        typeof s?.timestamp === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Never store or show a blank title: trim, cap, and fall back to a dated
 * label so every row in Manage chats stays identifiable. Exported for the
 * workspace backend, the page title helper, and tests.
 */
export function normalizeTitle(title: unknown, timestamp: number): string {
  const clean = (typeof title === "string" ? title : "").trim().slice(0, 80);
  if (clean) return clean;
  return `Chat ${new Date(timestamp).toLocaleString()}`;
}

/** Display fallback for entries that predate title normalization. */
export function displayTitle(s: { title: string; filename: string }): string {
  return s.title && s.title.trim() ? s.title : s.filename;
}

function writeIndex(sessions: SessionInfo[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error("Failed to write session index (storage full?):", e);
  }
}

/**
 * Browser-local chat sessions. Nothing touches the server, so Render stays
 * stateless. Upsert-based: callers keep one filename per conversation and
 * overwrite it on every reply instead of creating a file per message.
 */
export async function saveLocalSession(
  title: string,
  messages: ChatMessage[],
  existingFilename?: string | null,
): Promise<string> {
  const timestamp = Date.now();
  const filename =
    existingFilename && /^[\w\-. ]+\.json$/.test(existingFilename)
      ? existingFilename
      : `session_${stamp()}.json`;
  const payload: StoredSession = {
    title: normalizeTitle(title, timestamp),
    messages,
    timestamp,
  };
  try {
    localStorage.setItem(ITEM_PREFIX + filename, JSON.stringify(payload));
  } catch (e) {
    console.error("Failed to save session locally (storage full?):", e);
    throw e;
  }
  const index = readIndex().filter((s) => s.filename !== filename);
  index.unshift({ filename, title: payload.title, timestamp });
  // Cap at 100 sessions to bound localStorage usage (~5MB quota).
  const trimmed = index.slice(0, 100);
  const dropped = index.slice(100);
  for (const d of dropped) {
    try {
      localStorage.removeItem(ITEM_PREFIX + d.filename);
    } catch {
      // ignore
    }
  }
  writeIndex(trimmed);
  return filename;
}

export async function listLocalSessions(): Promise<SessionInfo[]> {
  const index = readIndex();
  index.sort((a, b) => b.timestamp - a.timestamp);
  // Self-heal: entries saved before title normalization (blank titles)
  // get a dated label once, so Manage chats never shows blank rows again.
  let repaired = false;
  for (const s of index) {
    const fixed = normalizeTitle(s.title, s.timestamp);
    if (fixed !== s.title) {
      s.title = fixed;
      repaired = true;
    }
  }
  if (repaired) writeIndex(index);
  return index;
}

export async function loadLocalSession(
  filename: string,
): Promise<ChatMessage[]> {
  if (!/^[\w\-. ]+\.json$/.test(filename) || filename.includes(".."))
    throw new Error("Not found");
  const raw = localStorage.getItem(ITEM_PREFIX + filename);
  if (!raw) throw new Error("Not found");
  const data = JSON.parse(raw) as Partial<StoredSession>;
  return Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [];
}

export async function deleteLocalSession(filename: string): Promise<void> {
  try {
    localStorage.removeItem(ITEM_PREFIX + filename);
  } catch {
    // ignore
  }
  writeIndex(readIndex().filter((s) => s.filename !== filename));
}

export async function renameLocalSession(filename: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 80);
  if (!clean) return;
  if (!/^[\w\-. ]+\.json$/.test(filename) || filename.includes("..")) return;
  try {
    const raw = localStorage.getItem(ITEM_PREFIX + filename);
    if (!raw) return;
    const data = JSON.parse(raw) as StoredSession;
    data.title = clean;
    localStorage.setItem(ITEM_PREFIX + filename, JSON.stringify(data));
  } catch {
    return;
  }
  writeIndex(
    readIndex().map((s) =>
      s.filename === filename ? { ...s, title: clean, timestamp: Date.now() } : s,
    ),
  );
}
