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

import type { LanguageModelSession } from "./prompt-api.d";

export const DEFAULT_GEMINI_MODEL = "gemma-4-26b-a4b-it";
export const FALLBACK_GEMINI_MODEL = "gemma-4-31b-it";
export const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";

interface Part {
  text: string;
}

interface Content {
  role: "user" | "model";
  parts: Part[];
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (res.status === 400 || res.status === 403) throw new Error("bad-key");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
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

  constructor(apiKey: string, model: string) {
    this.key = apiKey;
    this.model = model;
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
        body: JSON.stringify({
          contents: [...this.history, { role: "user", parts: [{ text: prompt }] }],
        }),
      },
      60000,
    );
    const text = extractText(data);
    this.history.push({ role: "user", parts: [{ text: prompt }] });
    this.history.push({ role: "model", parts: [{ text }] });
    return text;
  }

  async *promptStreaming(prompt: string): AsyncIterable<string> {
    if (this.destroyed) throw new Error("Session destroyed");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [...this.history, { role: "user", parts: [{ text: prompt }] }],
        }),
      },
    );
    if (res.status === 400 || res.status === 403) throw new Error("bad-key");
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          for (const line of ev.split("\n")) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (!payload) continue;
            try {
              const piece = extractText(JSON.parse(payload));
              if (piece) {
                full += piece;
                yield piece;
              }
            } catch {
              // Incomplete JSON across chunks — the remainder stays in buf.
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    this.history.push({ role: "user", parts: [{ text: prompt }] });
    this.history.push({ role: "model", parts: [{ text: full }] });
  }

  destroy(): void {
    this.destroyed = true;
    this.history = [];
  }
}
