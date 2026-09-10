// Google-hosted Gemma adapter (Gemini API).
//
// Same Gemma 4 family as the built-in model, but served from Google's
// servers — so it works on phones, where Chrome offers no Prompt API.
// The user's own free API key (aistudio.google.com/apikey) is kept in the
// browser's localStorage and requests go straight from the browser to
// Google: our server never sees the key.
//
// Implements the app's LanguageModelSession shape, so chat/file tools work
// unchanged whichever provider is active.

import type { LanguageModelSession, PromptImage } from "./prompt-api.d";

export const DEFAULT_GEMINI_MODEL = "gemma-4-26b-a4b-it";
export const FALLBACK_GEMINI_MODEL = "gemma-4-31b-it";
export const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";

/**
 * History tail kept per request. Long chats otherwise resend everything
 * every turn (an agent loop alone appends ~12 entries) — unbounded growth
 * that burns TPM for zero benefit. 30 entries cover any single task.
 */
export const HISTORY_TAIL = 30;

interface Part {
  text: string;
}

interface Content {
  role: "user" | "model";
  parts: Part[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retryable: throttles and transient upstream failures. Never auth errors. */
function retryable(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /HTTP (429|500|502|503|504)/.test(msg);
}

/** GET bytes with the same polite backoff (used by image paths). */
async function fetchBlobWithRetry(url: string, init: RequestInit, timeoutMs: number): Promise<Blob> {
  let last: unknown = new Error("unreachable");
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 401 || res.status === 403) throw new Error("hf-bad-key");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob || blob.size < 1024) throw new Error("empty-image");
      return blob;
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "hf-bad-key" || msg === "empty-image") throw e;
      if (!retryable(e) || attempt === 3) throw e;
      await sleep(2000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

/**
 * fetchJson with polite backoff: 2s → 4s → 8s on throttles/transients.
 * Auth and client errors fail immediately.
 */
async function fetchJson(url: string, init?: RequestInit, timeoutMs = 12000): Promise<unknown> {
  let last: unknown = new Error("unreachable");
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 400 || res.status === 403) throw new Error("bad-key");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (e) {
      last = e;
      if (!retryable(e) || attempt === 3) throw e;
      await sleep(2000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

/** List Gemma models available to this key (for the picker). */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const data = (await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    undefined,
    12000,
  )) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  const names = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter(Boolean);
  // Prefer Gemma models, but allow anything the key can use.
  const gemma = names.filter((n) => n.toLowerCase().includes("gemma"));
  return gemma.length > 0 ? gemma : names;
}

export interface TokenUsage {
  in: number;
  out: number;
  total: number;
}

function extractUsage(obj: unknown): TokenUsage | null {
  try {
    const u = (obj as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }).usageMetadata;
    if (!u) return null;
    return {
      in: u.promptTokenCount ?? 0,
      out: u.candidatesTokenCount ?? 0,
      total: u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0),
    };
  } catch {
    return null;
  }
}

function extractText(obj: unknown): string {
  try {
    const cands = (obj as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates ?? [];
    return cands
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
  } catch {
    return "";
  }
}

export class GeminiSession implements LanguageModelSession {
  private key: string;
  private model: string;
  private history: Content[] = [];
  private destroyed = false;
  /** Tokens used by the most recent request (null until first call). */
  lastUsage: TokenUsage | null = null;
  private system?: string;

  constructor(apiKey: string, model: string, system?: string) {
    this.key = apiKey;
    this.model = model;
    this.system = system;
  }

  private tail(): Content[] {
    return this.history.length > HISTORY_TAIL
      ? this.history.slice(-HISTORY_TAIL)
      : this.history;
  }

  private body(prompt: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = {
      contents: [...this.tail(), { role: "user", parts: [{ text: prompt }] }],
      // Cooler + capped: less rambling and thinking-out-loud, same smarts.
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };
    if (this.system) req.systemInstruction = { parts: [{ text: this.system }] };
    return JSON.stringify(req);
  }

  /** Restore "User: …" / "Assistant: …" lines (the app's history format). */
  async append(text: string): Promise<void> {
    const m = text.match(/^(User|Assistant):\s*([\s\S]*)$/);
    if (m) {
      this.history.push({
        role: m[1] === "User" ? "user" : "model",
        parts: [{ text: m[2].trim() }],
      });
    } else {
      this.history.push({ role: "user", parts: [{ text }] });
    }
  }

  async prompt(prompt: string): Promise<string> {
    const data = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.body(prompt),
      },
      60000,
    );
    const text = extractText(data);
    this.lastUsage = extractUsage(data);
    this.history.push({ role: "user", parts: [{ text: prompt }] });
    this.history.push({ role: "model", parts: [{ text }] });
    return text;
  }

  /** Overwrite the most recent model entry with the displayed (sanitized)
   * answer, so the next turn doesn't re-read leaked reasoning as an example.
   * No-op when history has no model entry yet. */
  rewriteLastModelText(text: string): void {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === "model") {
        this.history[i] = { role: "model", parts: [{ text }] };
        return;
      }
    }
  }

  async *promptStreaming(prompt: string): AsyncIterable<string> {
    yield* this.runStream(this.body(prompt), prompt);
  }

  async *promptWithImages(prompt: string, images: PromptImage[]): AsyncIterable<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [{ text: prompt }];
    for (const img of images) {
      parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = {
      contents: [...this.tail(), { role: "user", parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };
    if (this.system) req.systemInstruction = { parts: [{ text: this.system }] };
    yield* this.runStream(JSON.stringify(req), prompt);
  }

  private async *runStream(body: string, prompt: string): AsyncIterable<string> {
    if (this.destroyed) throw new Error("Session destroyed");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      },
    );
    if (res.status === 400 || res.status === 403) throw new Error("bad-key");
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    const eat = (chunk: string): void => {
      for (const line of chunk.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          // Incomplete JSON across chunks — caller keeps it buffered.
          throw new Error("partial");
        }
        const piece = extractText(parsed);
        if (piece) full += piece;
        const u = extractUsage(parsed);
        if (u) this.lastUsage = u;
      }
    };
    // Pieces are buffered per network chunk then yielded, so a \r\n split
    // inside one event can't silently drop text.
    const pieces: string[] = [];
    const eatEmit = (chunk: string): void => {
      const before = full.length;
      eat(chunk);
      if (full.length > before) pieces.push(full.slice(before));
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // Google sends \r\n — normalize or the event split never fires.
        buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          try {
            eatEmit(ev);
          } catch {
            // Partial tail (JSON split across chunks): consumed lines stay
            // consumed, only the incomplete last line waits for more data.
            const idx = ev.lastIndexOf("\n");
            buf = (idx >= 0 ? ev.slice(idx + 1) : ev) + "\n\n" + buf;
            break;
          }
        }
        for (const p of pieces.splice(0)) yield p;
      }
      // Flush any trailing event without a terminator.
      if (buf.trim()) {
        try {
          eatEmit(buf);
        } catch {
          // genuinely truncated tail — ignore
        }
        buf = "";
        for (const p of pieces.splice(0)) yield p;
      }
    } finally {
      reader.releaseLock();
    }
    if (!full) throw new Error("empty-stream");
    this.history.push({ role: "user", parts: [{ text: prompt }] });
    this.history.push({ role: "model", parts: [{ text: full }] });
  }

  destroy(): void {
    this.destroyed = true;
    this.history = [];
  }
}

export interface GeneratedImage {
  blob: Blob;
  mime: string;
  usage: TokenUsage | null;
}

/**
 * Trial chat through the server key (/api/gemini-chat): no user key needed.
 * Non-streaming server-side; yields the answer as one chunk. Throws
 * "trial-over" when the visitor budget is spent.
 */
export class TrialChatSession implements LanguageModelSession {
  private history: Content[] = [];
  private destroyed = false;

  async append(text: string): Promise<void> {
    const m = text.match(/^(User|Assistant):\s*([\s\S]*)$/);
    if (m) {
      this.history.push({
        role: m[1] === "User" ? "user" : "model",
        parts: [{ text: m[2].trim() }],
      });
    } else {
      this.history.push({ role: "user", parts: [{ text }] });
    }
  }

  async prompt(prompt: string): Promise<string> {
    let full = "";
    for await (const chunk of this.promptStreaming(prompt)) full += chunk;
    return full;
  }

  async *promptStreaming(prompt: string): AsyncIterable<string> {
    if (this.destroyed) throw new Error("Session destroyed");
    const contents = [...this.history, { role: "user", parts: [{ text: prompt }] }];
    // Keep the tail bounded like the keyed path (server bills per token).
    const slim = contents.length > HISTORY_TAIL ? contents.slice(-HISTORY_TAIL) : contents;
    const res = await fetch("/api/gemini-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: slim }),
    });
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data?.error || "trial-over");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { text?: string };
    const text = data.text ?? "";
    this.history.push({ role: "user", parts: [{ text: prompt }] });
    this.history.push({ role: "model", parts: [{ text }] });
    yield text;
  }

  destroy(): void {
    this.destroyed = true;
    this.history = [];
  }
}

/** Image model actually served by the hf-inference provider (verified in
 *  their provider→model mapping — the router has no provider-less route,
 *  and big names like FLUX/Qwen were dropped from this provider). */
export const HF_IMAGE_MODEL = "stabilityai/stable-diffusion-3-medium-diffusers";
/** Provider-pinned router path (this exact shape is what hf-inference serves). */
const HF_ROUTER = "https://router.huggingface.co/hf-inference/models";

export async function generateHFImage(
  token: string,
  prompt: string,
): Promise<GeneratedImage> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240000);
  try {
    // Preferred: server key (never exposed). A decided server answer
    // (anything but 501/no-key) is final; only 501 falls through.
    let useDirect = false;
    try {
      const res = await fetch("/api/hf-draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.slice(0, 1500) }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const blob = await res.blob();
        if (!blob || blob.size < 1024) throw new Error("empty-image");
        return { blob, mime: blob.type || "image/jpeg", usage: null };
      }
      if (res.status === 501) {
        useDirect = true;
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      const msg = e instanceof Error ? e.message : String(e);
      // Unreachable server (dev down? proxy hiccup) → try direct.
      if (!useDirect && /failed to fetch|load failed|networkerror/i.test(msg)) {
        useDirect = true;
      } else if (!useDirect) {
        throw e;
      }
    }
    // Fallback: user's own key, direct to HuggingFace (one polite
    // re-try on throttle, then the honest hf-limited message).
    if (!token) throw new Error("hf-no-key");
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(
        `https://router.huggingface.co/hf-inference/models/${HF_IMAGE_MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: prompt.slice(0, 1500) }),
          signal: ctrl.signal,
        },
      );
      if (res.status === 401 || res.status === 403) throw new Error("hf-bad-key");
      if (res.status === 429) {
        if (attempt === 0) {
          await sleep(4000);
          continue;
        }
        throw new Error("hf-limited");
      }
    if (!res.ok) {
      let detail = "";
      try {
        detail = ` ${(await res.text()).slice(0, 200)}`;
      } catch {
        // body unreadable — status only
      }
      throw new Error(`HTTP ${res.status}${detail}`);
    }
    const blob = await res.blob();
    if (!blob || blob.size < 1024) throw new Error("empty-image");
    return { blob, mime: blob.type || "image/jpeg", usage: null };
    }
    throw new Error("hf-limited");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Free keyless drawing via Pollinations (FLUX-class models), proxied
 * through our own server: browsers get 403 fetching it directly
 * (hotlink protection), server-to-server works. No account, any device.
 * Quality varies. Seed cache-busts so repeats differ.
 */
export const FREE_DRAW_ENGINE = "Pollinations · flux";
export async function generateFreeImage(prompt: string): Promise<GeneratedImage> {
  const seed = Math.floor(Math.random() * 1000000);
  const url =
    `/api/draw?prompt=${encodeURIComponent(prompt.slice(0, 1500))}` +
    `&seed=${seed}`;
  const blob = await fetchBlobWithRetry(url, {}, 180000);
  return { blob, mime: blob.type || "image/jpeg", usage: null };
}
