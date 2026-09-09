// Ollama-compatible local model adapter.
//
// Implements the same LanguageModelSession shape the app already uses for
// Gemma (promptStreaming / prompt / append / destroy), so Chat and FileEditor
// work unchanged whichever provider is active. Any Ollama-compatible server
// works (Ollama itself, or anything serving /api/tags + /api/chat).
//
// NOTE: browsers block cross-origin requests unless the server allows them.
// For Ollama, start it with e.g. OLLAMA_ORIGINS="*" (or the app's origin).

import type { LanguageModelSession, PromptImage } from "./prompt-api.d";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/**
 * Same philosophy as the cloud adapter: bound what gets re-sent every turn
 * (Ollama re-reads it all, on CPU when VRAM spills) and cap the KV cache.
 * 30 exchanges cover any single task; distant marathon chatter is trimmed.
 */
export const OLLAMA_HISTORY_TAIL = 30;
export const OLLAMA_NUM_CTX = 16384;

interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** List model names from GET {url}/api/tags. Throws with a short reason. */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const base = baseUrl.replace(/\/+$/, "");
  let data: unknown;
  try {
    data = await fetchJson(`${base}/api/tags`);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error("timeout");
    throw new Error(e instanceof TypeError ? "unreachable" : String(e));
  }
  const models = (data as { models?: { name?: string }[] }).models ?? [];
  return models.map((m) => m.name ?? "").filter(Boolean);
}

export class OllamaSession implements LanguageModelSession {
  private base: string;
  private model: string;
  private history: ChatMsg[] = [];
  private destroyed = false;

  constructor(baseUrl: string, model: string, system?: string) {
    this.base = baseUrl.replace(/\/+$/, "");
    this.model = model;
    if (system) this.history.push({ role: "system", content: system });
  }

  /** Restore "User: …" / "Assistant: …" lines (the app's history format). */
  async append(text: string): Promise<void> {
    const m = text.match(/^(User|Assistant):\s*([\s\S]*)$/);
    if (m) {
      this.history.push({
        role: m[1] === "User" ? "user" : "assistant",
        content: m[2].trim(),
      });
    } else {
      this.history.push({ role: "user", content: text });
    }
  }

  async prompt(prompt: string): Promise<string> {
    let full = "";
    for await (const chunk of this.stream([{ role: "user", content: prompt }])) full += chunk;
    return full;
  }

  async *promptStreaming(prompt: string): AsyncIterable<string> {
    yield* this.stream([{ role: "user", content: prompt }]);
  }

  async *promptWithImages(prompt: string, images: PromptImage[]): AsyncIterable<string> {
    yield* this.stream([
      {
        role: "user",
        content: prompt,
        images: images.map((i) => i.data),
      },
    ]);
  }

  private tail(): ChatMsg[] {
    return this.history.length > OLLAMA_HISTORY_TAIL
      ? this.history.slice(-OLLAMA_HISTORY_TAIL)
      : this.history;
  }

  private async *stream(extra: ChatMsg[]): AsyncIterable<string> {
    if (this.destroyed) throw new Error("Session destroyed");
    const messages: ChatMsg[] = [...this.tail(), ...extra];
    const res = await fetch(`${this.base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: { num_ctx: OLLAMA_NUM_CTX },
      }),
    });
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
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const lineTrim = line.trim();
          if (!lineTrim) continue;
          try {
            const obj = JSON.parse(lineTrim) as {
              message?: { content?: string };
              done?: boolean;
              error?: string;
            };
            if (obj.error) throw new Error(obj.error);
            const piece = obj.message?.content ?? "";
            if (piece) {
              full += piece;
              yield piece;
            }
            if (obj.done) break;
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    // History keeps text only — base64 would explode future requests.
    for (const m of extra) this.history.push({ role: m.role, content: m.content });
    this.history.push({ role: "assistant", content: full });
  }

  /** Overwrite the most recent assistant entry with the displayed
   * (sanitized) answer — see GeminiSession.rewriteLastModelText. */
  rewriteLastModelText(text: string): void {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === "assistant") {
        this.history[i] = { role: "assistant", content: text };
        return;
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.history = [];
  }
}
