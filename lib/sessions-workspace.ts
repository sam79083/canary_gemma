import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { ChatMessage, SessionInfo } from "./types";

// Sessions live inside the user's picked folder, so history is real files
// on disk — not browser localStorage, not the Render server.
export const SESSIONS_ROOT = ".canary/sessions";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 7);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}_${rand}`;
}

function validFilename(name: string): boolean {
  return /^[\w\-. ]+\.json$/.test(name) && !name.includes("..");
}

function pathFor(filename: string): string {
  return `${SESSIONS_ROOT}/${filename}`;
}

/**
 * Save (upsert) one conversation as a real file in the workspace folder.
 * Returns the filename so callers can overwrite the same file next time.
 */
export async function saveWorkspaceSession(
  ws: WorkspaceApi,
  title: string,
  messages: ChatMessage[],
  existingFilename?: string | null,
): Promise<string> {
  const filename =
    existingFilename && validFilename(existingFilename)
      ? existingFilename
      : `session_${stamp()}.json`;
  await ws.makeDir(SESSIONS_ROOT);
  const payload = {
    title: title || "New conversation",
    messages,
    timestamp: Date.now(),
  };
  await ws.writeFile(pathFor(filename), JSON.stringify(payload, null, 2));
  return filename;
}

export async function listWorkspaceSessions(
  ws: WorkspaceApi,
): Promise<SessionInfo[]> {
  let entries;
  try {
    entries = await ws.list(SESSIONS_ROOT);
  } catch {
    // Folder doesn't exist yet — no sessions.
    return [];
  }
  const sessions: SessionInfo[] = [];
  for (const e of entries) {
    if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
    try {
      const raw = await ws.readFile(pathFor(e.name));
      const data = JSON.parse(raw) as {
        title?: string;
        timestamp?: number;
      };
      sessions.push({
        filename: e.name,
        title:
          typeof data.title === "string" && data.title ? data.title : e.name,
        timestamp: typeof data.timestamp === "number" ? data.timestamp : 0,
      });
    } catch {
      sessions.push({ filename: e.name, title: e.name, timestamp: 0 });
    }
  }
  sessions.sort((a, b) => b.timestamp - a.timestamp);
  return sessions;
}

export async function loadWorkspaceSession(
  ws: WorkspaceApi,
  filename: string,
): Promise<ChatMessage[]> {
  if (!validFilename(filename)) throw new Error("Not found");
  const raw = await ws.readFile(pathFor(filename));
  const data = JSON.parse(raw) as { messages?: ChatMessage[] };
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function deleteWorkspaceSession(
  ws: WorkspaceApi,
  filename: string,
): Promise<void> {
  if (!validFilename(filename)) throw new Error("Not found");
  await ws.deletePath(pathFor(filename));
}
