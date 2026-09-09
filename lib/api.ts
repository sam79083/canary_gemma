import type {
  ChatMessage,
  FileEntry,
  QuotaInfo,
  SearchResult,
  SessionInfo,
} from "./types";

async function json<T>(res: Response): Promise<T> {
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

export async function listFiles(p: string): Promise<FileEntry[]> {
  const res = await fetch(`/api/files?path=${encodeURIComponent(p)}`);
  const data = await json<{ entries?: FileEntry[]; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.entries ?? [];
}

export async function readFile(p: string): Promise<string> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(p)}`);
  const data = await json<{ content?: string; error?: string }>(res);
  if (!res.ok || data.content === undefined)
    throw new Error(data.error || `HTTP ${res.status}`);
  return data.content;
}

export async function writeFile(p: string, content: string): Promise<void> {
  const res = await fetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: p, content }),
  });
  const data = await json<{ success?: boolean; error?: string }>(res);
  if (!res.ok || data.success === false)
    throw new Error(data.error || `HTTP ${res.status}`);
}

/** Server fallback for binary data (base64-encoded PNG etc.). */
export async function writeFileBinary(p: string, base64: string): Promise<void> {
  const res = await fetch("/api/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: p, contentBase64: base64 }),
  });
  const data = await json<{ success?: boolean; error?: string }>(res);
  if (!res.ok || data.success === false)
    throw new Error(data.error || `HTTP ${res.status}`);
}

export async function makeDir(p: string): Promise<void> {
  const res = await fetch("/api/mkdir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: p }),
  });
  const data = await json<{ success?: boolean; error?: string }>(res);
  if (!res.ok || data.success === false)
    throw new Error(data.error || `HTTP ${res.status}`);
}

export async function deletePath(p: string): Promise<void> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(p)}`, {
    method: "DELETE",
  });
  const data = await json<{ success?: boolean; error?: string }>(res);
  if (!res.ok || data.success === false)
    throw new Error(data.error || `HTTP ${res.status}`);
}

export async function saveSession(
  title: string,
  messages: ChatMessage[],
): Promise<void> {
  await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, messages, timestamp: Date.now() }),
  });
}

export async function listSessions(): Promise<SessionInfo[]> {
  const res = await fetch("/api/sessions");
  const data = await json<{ sessions?: SessionInfo[] }>(res);
  return data.sessions ?? [];
}

export async function loadSession(filename: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/session/${encodeURIComponent(filename)}`);
  const data = await json<{ messages?: ChatMessage[] }>(res);
  return data.messages ?? [];
}

export async function webSearch(
  q: string,
): Promise<{ results: SearchResult[]; error: string | null }> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await json<{ results?: SearchResult[]; error?: string }>(res);
  if (!res.ok) return { results: [], error: data.error || `HTTP ${res.status}` };
  return { results: data.results ?? [], error: data.error ?? null };
}

export async function fetchQuota(): Promise<QuotaInfo> {
  const res = await fetch("/api/quota");
  return json<QuotaInfo>(res);
}
