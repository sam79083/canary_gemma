import type {
  DownloadFile,
  DownloadState,
  FileEntry,
  QuotaInfo,
  SearchResult,
} from "./types";
import { parseJsonResponse as json } from "./http-error";

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

/** Server fallback for binary downloads (images). */
export async function readFileBinary(p: string): Promise<Blob> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(p)}&raw=1`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.blob();
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

/** Fetch a public page as plain text for summarization (SSRF-guarded server-side). */
export async function fetchPage(
  url: string,
): Promise<{ title: string; text: string; url: string }> {
  const res = await fetch("/api/fetch-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await json<{
    title?: string;
    text?: string;
    url?: string;
    error?: string;
  }>(res);
  if (!res.ok || !data.text)
    throw new Error(data.error || `HTTP ${res.status}`);
  return { title: data.title ?? "", text: data.text, url: data.url ?? url };
}

/** List server temp files (workspace NOT connected case) for browser download. */
export async function listDownloads(): Promise<{ files: DownloadFile[]; ttlMs: number }> {
  try {
    const res = await fetch("/api/downloads", { cache: "no-store" });
    if (!res.ok) return { files: [], ttlMs: 0 };
    const data = await json<{ entries?: DownloadFile[]; ttlMs?: number }>(res);
    return {
      files: (data.entries ?? []).filter((f) => f.kind === "file"),
      ttlMs: data.ttlMs ?? 0,
    };
  } catch {
    return { files: [], ttlMs: 0 };
  }
}

/** Browser URL that downloads a server temp file as an attachment. */
export function downloadHref(name: string): string {
  const bytes = new TextEncoder().encode(name);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const encoded = btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `/api/download/${encoded}`;
}

/** Trigger a browser download via /api/download/[base64url]. */
export function triggerDownload(name: string): void {
  const url = downloadHref(name);
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", name);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
