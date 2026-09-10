"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  deletePath as serverDeletePath,
  fetchQuota,
  listFiles as serverListFiles,
  makeDir as serverMakeDir,
  readFile as serverReadFile,
  webSearch,
  writeFile as serverWriteFile,
  writeFileBinary as serverWriteFileBinary,
} from "@/lib/api";
import type { LanguageModelSession, PromptImage } from "@/lib/prompt-api.d";
import type { BusyKind, Provider } from "@/hooks/useLanguageModel";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { ChatMessage, ReviewFn } from "@/lib/types";
import { replySuffix, type Lang, type TFn } from "@/lib/i18n";
import { recordUsage } from "@/lib/usage";
import { renderMarkdown } from "@/lib/markdown";
import { sanitizeAnswer } from "@/lib/sanitize";
import { GEMINI_IMAGE_MODEL, generateGeminiImage } from "@/lib/cloud-model";
import {
  AGENT_MAX_STEPS,
  buildAgentPreamble,
  buildToolResultTurn,
  buildUserTurn,
  parseToolCall,
  stripToolCalls,
  type ToolCall,
} from "@/lib/agent";

interface Props {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sessionRef: RefObject<LanguageModelSession | null>;
  busyRef: RefObject<BusyKind>;
  modelReady: boolean;
  setModelStatus: (s: string, online: boolean) => void;
  pushMessage: (role: ChatMessage["role"], content: string, image?: ChatMessage["image"]) => void;
  persistChat: () => void;
  workspace: WorkspaceApi;
  onFilesChanged: () => void;
  onOpenFile: (path: string) => void;
  reviewChange: ReviewFn;
  provider: Provider;
  /** Native multimodal session for built-in Gemma photo turns (null = N/A). */
  ensureVision: () => Promise<LanguageModelSession | null>;
  /** Model id for usage tracking (e.g. gemma-4-26b-a4b-it). Empty = don't track. */
  usageModel: string;
  /** Same-PC ComfyUI wiring (local drawing). */
  comfyUrl?: string;
  comfyModel?: string;
  /** Cloud-draw key (Gemini image model, any device). Empty = local only. */
  geminiKey?: string;
  t: TFn;
  lang: Lang;
}

function cleanRelPath(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\0/g, "");
}

/** Short display name: "notes/todo.txt" -> "todo.txt". */
function shortName(rel: string): string {
  const parts = rel.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : rel;
}

/** Turn a raw technical error into something a non-technical user can act on. */
function friendlyError(t: TFn, e: unknown, path?: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  const name = path ? shortName(path) : "";
  if (/not found|no such|does not exist|ENOENT|NotFound/i.test(raw))
    return t("chErrNotFound", { name });
  if (/permission|denied|not allowed|SecurityError|AbortError/i.test(raw))
    return t("chErrPerm", { name });
  if (/binary/i.test(raw)) return t("chErrBinary", { name });
  if (/bad-key/i.test(raw)) return t("stCloudBadKey");
  if (/quota|limit|429/i.test(raw)) return t("chErrQuota");
  if (name) return t("chErrGeneric", { name });
  return t("chErrSomething");
}

/** Plain-language progress line for each file step (shown in chat). */
function friendlyStep(t: TFn, tc: ToolCall, ok: boolean, detail: string): string {
  const path = cleanRelPath(tc.path);
  const name = shortName(path);
  const snippet = detail.length > 400 ? detail.slice(0, 400) + "…" : detail;
  if (ok) {
    switch (tc.name) {
      case "listFiles":
        return t("chMsgLooked", { p: path || "✓", detail: snippet });
      case "readFile":
        return t("chMsgOpened", { name, detail: snippet });
      case "writeFile":
        return t("chMsgSaved", { name });
      case "makeDir":
        return t("chMsgMkdir", { name });
      case "deletePath":
        return t("chMsgDeleted", { name });
    }
  }
  return t("chMsgFail", { detail: snippet });
}

function isUnsafePath(p: string): boolean {
  if (!p) return true;
  if (p === "." || p.startsWith("../") || p.includes("/../") || p.endsWith("/.."))
    return true;
  if (p.startsWith("/") || /^[a-zA-Z]:\//.test(p)) return true;
  return false;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechCtor = new () => SpeechRec;

function speechLang(lang: Lang): string {
  switch (lang) {
    case "ko": return "ko-KR";
    case "en": return "en-US";
    case "ja": return "ja-JP";
    case "zh": return "zh-CN";
    case "es": return "es-ES";
    case "fr": return "fr-FR";
    case "de": return "de-DE";
    case "pt": return "pt-BR";
    case "vi": return "vi-VN";
    case "id": return "id-ID";
  }
}

export default function Chat({
  messages,
  input,
  setInput,
  sessionRef,
  busyRef,
  modelReady,
  setModelStatus,
  pushMessage,
  persistChat,
  workspace,
  onFilesChanged,
  onOpenFile,
  reviewChange,
  provider,
  ensureVision,
  usageModel,
  comfyUrl = "",
  comfyModel = "",
  geminiKey = "",
  t,
  lang,
}: Props) {
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [quota, setQuota] = useState(t("chQuotaCheck"));
  const [quotaLow, setQuotaLow] = useState(false);
  const [agentMode, setAgentMode] = useState(true);
  const [tokens, setTokens] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [photos, setPhotos] = useState<{ name: string; mime: string; data: string }[]>([]);
  const [speechOK, setSpeechOK] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRec | null>(null);
  const recogBase = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyIn = replySuffix(lang);

  // Fresh chat → fresh token count.
  useEffect(() => {
    if (messages.length === 0) setTokens(0);
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    // Mount-gated: window sniffing during render would hydrate-mismatch.
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    setSpeechOK(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        // already stopped
      }
      recogRef.current = null;
    };
  }, []);

  const toggleVoice = useCallback(() => {
    if (recogRef.current) {
      try {
        recogRef.current.stop();
      } catch {
        // ignore
      }
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor || streaming) return;
    const rec = new Ctor();
    rec.lang = speechLang(lang);
    rec.interimResults = true;
    rec.continuous = false;
    recogBase.current = input;
    rec.onresult = (ev) => {
      let text = recogBase.current;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const alt = ev.results[i]?.[0];
        if (!alt) continue;
        text += (text && !text.endsWith(" ") ? " " : "") + alt.transcript;
      }
      setInput(text);
    };
    rec.onend = () => {
      recogRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    };
    recogRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recogRef.current = null;
      setListening(false);
    }
  }, [input, setInput, lang, streaming]);

  function fmtTokens(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
  }

  const shareMsg = useCallback(
    async (text: string, idx: number) => {
      try {
        const nav = navigator as Navigator & {
          share?: (d: { text: string }) => Promise<void>;
        };
        if (typeof nav.share === "function") {
          await nav.share({ text });
          return;
        }
        throw new Error("no-share");
      } catch {
        try {
          await navigator.clipboard.writeText(text);
          setCopiedIdx(idx);
          if (copyTimer.current) clearTimeout(copyTimer.current);
          copyTimer.current = setTimeout(() => setCopiedIdx(null), 2000);
        } catch {
          // clipboard unavailable — nothing more we can do
        }
      }
    },
    [],
  );

  const MAX_UPLOAD = 500 * 1024;
  const MAX_PHOTO = 4 * 1024 * 1024;
  const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  /**
   * Phone photos are 3–12MB; image tokens scale with pixels. Downscale to
   * max 1024px JPEG before sending — same understanding, ~10x fewer tokens.
   */
  function downscalePhoto(f: File, maxDim = 1024, quality = 0.82): Promise<{ mime: string; data: string }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no-2d");
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          const out = canvas.toDataURL("image/jpeg", quality);
          const data = out.split(",").slice(1).join(",");
          if (!data) throw new Error("encode");
          resolve({ mime: "image/jpeg", data });
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode"));
      };
      img.src = url;
    });
  }

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const f of Array.from(files).slice(0, 5)) {
        // Photos go straight to the model (downscaled), not the workspace.
        // Match by MIME or extension — some phones report an empty MIME type.
        const looksLikePhoto =
          PHOTO_MIMES.includes(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
        if (looksLikePhoto) {
          if (f.size > MAX_PHOTO) {
            pushMessage("assistant", t("imgTooBig", { name: f.name }));
            continue;
          }
          try {
            const small = await downscalePhoto(f);
            setPhotos((prev) =>
              prev.length >= 3
                ? prev
                : [...prev, { name: f.name || "photo", ...small }],
            );
            pushMessage("assistant", t("imgAttached", { name: f.name || "photo" }));
          } catch {
            pushMessage("assistant", t("upBinary", { name: f.name }));
          }
          continue;
        }
        if (workspace.supported && !workspace.connected) {
          pushMessage("assistant", t("upNoSpace"));
          return;
        }
        const safeName =
          f.name.replace(/[\\/]/g, "_").replace(/^\.+/, "").slice(0, 100) ||
          "upload.txt";
        if (f.size > MAX_UPLOAD) {
          pushMessage("assistant", t("upTooBig", { name: f.name }));
          continue;
        }
        let text: string;
        try {
          text = await f.text();
        } catch {
          pushMessage("assistant", t("upBinary", { name: f.name }));
          continue;
        }
        if (text.includes("\0")) {
          pushMessage("assistant", t("upBinary", { name: f.name }));
          continue;
        }
        const rel = `uploads/${safeName}`;
        try {
          if (workspace.connected) {
            try {
              await workspace.makeDir("uploads");
            } catch {
              // exists already
            }
            await workspace.writeFile(rel, text);
          } else {
            await serverWriteFile(rel, text);
          }
          onFilesChanged();
          pushMessage("assistant", t("upUploaded", { name: rel }));
          onOpenFile(rel);
        } catch {
          pushMessage("assistant", t("upFailed"));
        }
      }
      persistChat();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, pushMessage, persistChat, onFilesChanged, onOpenFile, t],
  );

  const loadQuota = useCallback(async () => {
    try {
      const data = await fetchQuota();
      if (data.error) throw new Error(data.error);
      const left = data.total_searches_left ?? data.plan_searches_left;
      setQuota(
        `🔍 ${left} / ${data.searches_per_month} searches left (${data.plan_name || "plan"}, renews ${data.plan_renewal_date || "?"})`,
      );
      setQuotaLow(typeof left === "number" && left < 25);
    } catch (e) {
      setQuota("🔍 Quota unavailable");
      console.warn("[quota] failed:", e);
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

  const focusInput = () => inputRef.current?.focus();

  async function runModelTurn(prompt: string, onChunk: (full: string) => void): Promise<string> {
    const session = sessionRef.current;
    if (!session) throw new Error("Model session not ready");
    let full = "";
    try {
      const stream = session.promptStreaming(prompt);
      for await (const chunk of stream) {
        full += chunk;
        onChunk(full);
      }
    } catch (streamErr) {
      console.warn("[agent] promptStreaming failed, trying prompt():", streamErr);
      full = (await session.prompt(prompt)) ?? "";
      onChunk(full);
    }
    collectUsage();
    return full;
  }

  function collectUsage(): void {
    // Cloud sessions report token usage — accumulate for the meter and
    // record for the usage tracker.
    try {
      const s = sessionRef.current as unknown as {
        lastUsage?: { total?: number };
      } | null;
      const u = s?.lastUsage;
      if (u && typeof u.total === "number" && u.total > 0) {
        setTokens((prev) => prev + (u.total as number));
        if (usageModel) recordUsage(usageModel, u.total as number);
      }
    } catch {
      // usage unavailable (e.g. on-device) — meter stays hidden
    }
  }

  /** Store the displayed (sanitized) answer in adapter history so the next
   * turn doesn't re-read leaked reasoning as an example. No-op for sessions
   * without history rewriting (built-in Gemma). */
  function rememberClean(clean: string): void {
    try {
      sessionRef.current?.rewriteLastModelText?.(clean);
    } catch {
      // history rewrite is optional — answer already delivered
    }
  }

  const handleSend = useCallback(async () => {
    if (busyRef.current) return;
    const prompt = input.trim();
    if (!prompt) return;
    // No AI session (e.g. phones without built-in AI): explain, don't die silently.
    if (!sessionRef.current) {
      setInput("");
      pushMessage("user", prompt);
      pushMessage("assistant", t("chNeedAi"));
      persistChat();
      return;
    }

    // Photo turn: vision-capable sessions only, bypasses the file-agent loop.
    if (photos.length > 0) {
      const session = sessionRef.current;
      const imgs: PromptImage[] = photos.map((p) => ({ mime: p.mime, data: p.data }));
      const names = photos.map((p) => p.name).join(", ");
      setPhotos([]);
      if (session?.promptWithImages) {
        busyRef.current = "chat";
        setStreaming(true);
        setInput("");
        pushMessage("user", `${prompt}\n\n📷 ${names}`);
        setStreamText("");
        try {
          let full = "";
          const stream = session.promptWithImages(prompt + replyIn, imgs);
          for await (const chunk of stream) {
            full += chunk;
            setStreamText(full);
          }
          collectUsage();
          const photoClean = sanitizeAnswer(stripToolCalls(full).trim());
          if (photoClean) {
            try {
              session.rewriteLastModelText?.(photoClean);
            } catch {
              // history rewrite is optional
            }
            pushMessage("assistant", photoClean);
            persistChat();
          }
        } catch (e) {
          pushMessage("assistant", friendlyError(t, e));
        } finally {
          busyRef.current = null;
          setStreaming(false);
          setStreamText(null);
          focusInput();
          setModelStatus(t("stReadyOk"), true);
          persistChat();
        }
        return;
      }
      // Built-in Gemma: dedicated multimodal session via the Prompt API.
      if (provider === "gemma" && session) {
        busyRef.current = "chat";
        setStreaming(true);
        setInput("");
        pushMessage("user", `${prompt}\n\n📷 ${names}`);
        setStreamText("");
        try {
          const vs = await ensureVision();
          if (!vs) {
            pushMessage("assistant", t("imgUnsupported"));
            return;
          }
          const blobs = await Promise.all(
            imgs.map(async (im) =>
              (await fetch(`data:${im.mime};base64,${im.data}`)).blob(),
            ),
          );
          let full = "";
          const stream = vs.promptStreaming([
            {
              role: "user",
              content: [
                { type: "text", value: prompt + replyIn },
                ...blobs.map((b) => ({ type: "image" as const, value: b })),
              ],
            },
          ]);
          for await (const chunk of stream) {
            full += chunk;
            setStreamText(full);
          }
          const photoClean = sanitizeAnswer(stripToolCalls(full).trim());
          if (photoClean) {
            pushMessage("assistant", photoClean);
            try {
              await vs.append(`User: ${prompt}\n[photos attached: ${names}]\n`);
              await vs.append(`Assistant: ${photoClean}\n`);
            } catch {
              // history note optional — answer already delivered
            }
            persistChat();
          }
        } catch (e) {
          pushMessage("assistant", friendlyError(t, e));
        } finally {
          busyRef.current = null;
          setStreaming(false);
          setStreamText(null);
          focusInput();
          setModelStatus(t("stReadyOk"), true);
          persistChat();
        }
        return;
      }
      setInput("");
      pushMessage("user", prompt);
      pushMessage("assistant", t("imgUnsupported"));
      persistChat();
      return;
    }
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", prompt);

    // Plain chat path — agent toggle off.
    if (!agentMode) {
      setStreamText("");
      let full = "";
      try {
        full = await runModelTurn(prompt + replyIn, setStreamText);
        const clean = sanitizeAnswer(stripToolCalls(full).trim());
        if (clean) {
          rememberClean(clean);
          pushMessage("assistant", clean);
          persistChat();
        }
      } catch (e) {
        pushMessage("assistant", friendlyError(t, e));
      } finally {
        busyRef.current = null;
        setStreaming(false);
        setStreamText(null);
        focusInput();
        persistChat();
      }
      return;
    }

    // --- Agentic path: chat + workspace CRUD in one loop ---
    const useWorkspaceFiles = workspace.connected;
    const serverFallback = !workspace.supported;
    const canTouchFiles = useWorkspaceFiles || serverFallback;

    const listOp = (p: string) =>
      useWorkspaceFiles ? workspace.list(p) : serverListFiles(p);
    const readOp = (p: string) =>
      useWorkspaceFiles ? workspace.readFile(p) : serverReadFile(p);
    const writeOp = (p: string, c: string) =>
      useWorkspaceFiles ? workspace.writeFile(p, c) : serverWriteFile(p, c);
    const mkdirOp = (p: string) =>
      useWorkspaceFiles ? workspace.makeDir(p) : serverMakeDir(p);
    const deleteOp = (p: string) =>
      useWorkspaceFiles ? workspace.deletePath(p) : serverDeletePath(p);

    async function executeTool(tc: ToolCall): Promise<{ ok: boolean; detail: string; mutated: boolean; openPath?: string }> {
      const rel = cleanRelPath(tc.path);
      if (tc.name === "listFiles") {
        try {
          const entries = await listOp(rel);
          const shown = entries.slice(0, 80);
          const detail =
            entries.length === 0
              ? `(empty) ${rel || "(root)"}`
              : shown
                  .map((e) => `${e.kind === "directory" ? "📁 " : "📄 "}${e.name}${e.kind === "directory" ? "/" : ""}`)
                  .join("\n") + (entries.length > shown.length ? `\n… (${entries.length - shown.length} more)` : "");
          return { ok: true, detail, mutated: false };
        } catch (e) {
          return { ok: false, detail: friendlyError(t, e, rel || undefined), mutated: false };
        }
      }
      if (isUnsafePath(rel))
        return { ok: false, detail: t("chErrSomething"), mutated: false };
      try {
        switch (tc.name) {
          case "readFile": {
            const text = await readOp(rel);
            const detail = text.length === 0 ? "(empty file)" : `--- ${rel} (${text.length} chars) ---\n${text}`;
            return { ok: true, detail, mutated: false, openPath: rel };
          }
          case "writeFile": {
            if (tc.content === undefined)
              return { ok: false, detail: t("chErrSomething"), mutated: false };
            // Trust step: show the change (editable), apply only on Keep.
            let oldText = "";
            try {
              oldText = await readOp(rel);
            } catch {
              oldText = "";
            }
            const verdict = await reviewChange({
              kind: "write",
              path: rel,
              oldText,
              newText: tc.content,
            });
            if (!verdict.ok)
              return { ok: false, detail: t("rvDeclined"), mutated: false };
            const finalText = verdict.text;
            await writeOp(rel, finalText);
            onFilesChanged();
            return {
              ok: true,
              detail: `Wrote ${rel} (${finalText.length} chars). Verified.`,
              mutated: true,
              openPath: rel,
            };
          }
          case "makeDir": {
            await mkdirOp(rel);
            onFilesChanged();
            return { ok: true, detail: `Created "${shortName(rel)}".`, mutated: true };
          }
          case "deletePath": {
            // Deleting can't be undone — review modal, not a bare confirm().
            const verdict = await reviewChange({
              kind: "delete",
              path: rel,
              oldText: "",
              newText: "",
            });
            if (!verdict.ok)
              return { ok: false, detail: t("chKept", { name: shortName(rel) }), mutated: false };
            await deleteOp(rel);
            onFilesChanged();
            return { ok: true, detail: `Deleted "${shortName(rel)}".`, mutated: true };
          }
        }
      } catch (e) {
        return { ok: false, detail: friendlyError(t, e, rel), mutated: false };
      }
      return { ok: false, detail: t("chErrSomething"), mutated: false };
    }

    setStreamText("");
    let lastTouched: string | null = null;
    try {
      if (!canTouchFiles) {
        // No folder: answer normally. Mention the folder ONLY if the user
        // actually asked for a file operation — never nag on plain questions
        // (phones can never pick a folder at all).
        const full = await runModelTurn(
          `No folder is connected, so you cannot read, write, list, or delete files. ` +
            `If and only if the user asks about files or folders, say in one short sentence that they can pick a folder with the sidebar button or attach a file with 📎. ` +
            `Otherwise just answer the question directly.\n\n${buildUserTurn(prompt)}${replyIn}`,
          setStreamText,
        );
        const clean = sanitizeAnswer(stripToolCalls(full).trim());
        if (clean) {
          rememberClean(clean);
          pushMessage("assistant", clean);
        }
        return;
      }

      // Ground the model with a top-level listing (best effort).
      let rootListing: string | null = null;
      try {
        const entries = await listOp("");
        rootListing =
          entries.length === 0
            ? "(empty workspace)"
            : entries
                .slice(0, 60)
                .map((e) => `- ${e.name}${e.kind === "directory" ? "/" : ""}`)
                .join("\n");
      } catch {
        rootListing = "(could not list workspace)";
      }

      let nextPrompt = `${buildAgentPreamble(rootListing)}\n\n${buildUserTurn(prompt)}${replyIn}`;
      let finalAnswer: string | null = null;

      for (let step = 0; step < AGENT_MAX_STEPS; step++) {
        setModelStatus(step === 0 ? t("stThinking") : t("stWorking", { n: step + 1 }), true);
        const raw = await runModelTurn(nextPrompt, setStreamText);
        const tc = parseToolCall(raw);

        if (!tc) {
          // Model attempted a toolcall but JSON was malformed — give it one
          // retry with a format reminder instead of ending as a final answer.
          const lower = raw.toLowerCase();
          if (
            (lower.includes("toolcall") || lower.includes("<tool")) &&
            step < AGENT_MAX_STEPS - 1
          ) {
            nextPrompt =
              `Your last reply tried to call a tool but the JSON was invalid and nothing ran. ` +
              `Reply again with EXACTLY ONE valid block and nothing else:\n` +
              `\`\`\`toolcall\n{"name": "readFile", "path": "notes/a.txt"}\n\`\`\`\n` +
              `Valid names: listFiles, readFile, writeFile, makeDir, deletePath. ` +
              `For writeFile, "content" must be a JSON string with \\n for newlines.`;
            setStreamText("");
            continue;
          }
          finalAnswer = sanitizeAnswer(stripToolCalls(raw).trim()) || t("chDidntGet");
          rememberClean(finalAnswer);
          break;
        }

        const stepName = cleanRelPath(tc.path) || tc.path || "";
        const liveText =
          tc.name === "listFiles"
            ? t("chLiveLook", { p: stepName || "✓" })
            : tc.name === "readFile"
              ? t("chLiveOpen", { name: shortName(stepName) })
              : tc.name === "writeFile"
                ? t("chLiveSave", { name: shortName(stepName) })
                : tc.name === "makeDir"
                  ? t("chLiveMkdir", { name: shortName(stepName) })
                  : t("chLiveDel", { name: shortName(stepName) });
        setStreamText(liveText);

        const result = await executeTool(tc);
        if (result.openPath && (tc.name === "writeFile" || tc.name === "readFile"))
          lastTouched = result.openPath;

        // Plain-language progress line in chat (UI only, not model history).
        pushMessage("assistant", friendlyStep(t, tc, result.ok, result.detail));

        nextPrompt = buildToolResultTurn(
          { ...tc, path: cleanRelPath(tc.path) },
          result.ok,
          result.detail,
        );
        setStreamText("");
      }

      if (finalAnswer === null) {
        finalAnswer = t("chAllDone");
      }
      pushMessage("assistant", finalAnswer);
      if (lastTouched) {
        onOpenFile(lastTouched);
        onFilesChanged();
      }
    } catch (e) {
      pushMessage("assistant", friendlyError(t, e));
    } finally {
      busyRef.current = null;
      setStreaming(false);
      setStreamText(null);
      focusInput();
      setModelStatus(t("stReadyOk"), true);
      persistChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRef, busyRef, input, setInput, pushMessage, persistChat, setModelStatus, agentMode, workspace, reviewChange, provider, ensureVision, t, lang]);

  const STARTERS = [
    { label: t("chSt1L"), prompt: t("chSt1P") },
    { label: t("chSt2L"), prompt: t("chSt2P") },
    { label: t("chSt3L"), prompt: t("chSt3P") },
  ];

  const TASKS = [
    { label: t("tk1L"), prompt: t("tk1P") },
    { label: t("tk2L"), prompt: t("tk2P") },
    { label: t("tk3L"), prompt: t("tk3P") },
  ];

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? "").split(",").slice(1).join(","));
      r.onerror = () => reject(new Error("encode"));
      r.readAsDataURL(blob);
    });
  }

  /** Text prompt → picture → chat + workspace. Cloud draw only. */
  const handleDraw = useCallback(async () => {
    if (busyRef.current) return;
    const prompt = input.trim();
    if (!prompt) {
      pushMessage("assistant", t("cfNoPrompt"));
      inputRef.current?.focus();
      return;
    }
    if (provider !== "cloud" || !geminiKey) {
      pushMessage(
        "assistant",
        provider !== "cloud" ? t("cfNeedCloud") : t("stCloudNeedKey"),
      );
      return;
    }
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", `🎨 ${prompt}`);
    const started = Date.now();
    setStreamText(t("cfDrawing", { n: 0 }));
    const tick = setInterval(() => {
      setStreamText(t("cfDrawing", { n: Math.round((Date.now() - started) / 1000) }));
    }, 1000);
    try {
      const gen = await generateGeminiImage(geminiKey, prompt);
      const blob = gen.blob;
      if (gen.usage && gen.usage.total > 0) {
        setTokens((prev) => prev + (gen.usage as { total: number }).total);
        recordUsage(GEMINI_IMAGE_MODEL, (gen.usage as { total: number }).total);
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      const name = `gen-${stamp}.png`;
      const rel = `uploads/${name}`;
      let temp = false;
      if (workspace.connected) {
        try {
          await workspace.makeDir("uploads");
        } catch {
          // exists already
        }
        await workspace.writeBinary(rel, blob);
      } else {
        // No folder (yet): save server-side so the picture is never lost,
        // and nudge to pick a folder instead of blocking.
        await serverWriteFileBinary(rel, await blobToBase64(blob));
        temp = workspace.supported;
      }
      onFilesChanged();
      pushMessage("assistant", t("cfSaved", { name: rel }) + (temp ? "\n" + t("cfTemp") : ""), {
        name,
        rel,
        url: URL.createObjectURL(blob),
      });
      persistChat();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "no-space") pushMessage("assistant", t("cfNoSpace"));
      else if (msg === "bad-key") pushMessage("assistant", t("stCloudBadKey"));
      else if (msg === "no-image") pushMessage("assistant", t("chDidntGet"));
      else if (msg === "unreachable" || msg === "timeout" || msg.startsWith("HTTP"))
        pushMessage("assistant", t("cfFail"));
      else pushMessage("assistant", friendlyError(t, e));
    } finally {
      clearInterval(tick);
      busyRef.current = null;
      setStreaming(false);
      setStreamText(null);
      focusInput();
      persistChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, setInput, pushMessage, persistChat, geminiKey, provider, workspace, onFilesChanged, t]);

  const handleSearch = useCallback(async () => {
    if (busyRef.current) return;
    const prompt = input.trim();
    if (!prompt) return;
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", prompt);
    pushMessage("assistant", `${t("chLooking")} "${prompt}"…`);
    setStreamText("");
    // No AI session (e.g. phones): show raw results, skip the AI summary.
    if (!sessionRef.current) {
      try {
        const { results, error } = await webSearch(prompt);
        if (error || results.length === 0) {
          pushMessage("assistant", t("chSearchFail"));
        } else {
          pushMessage(
            "assistant",
            `${t("chSearchFound", { n: results.length })}\n${results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`).join("\n\n")}\n\n${t("chNoAiNote")}`,
          );
        }
        persistChat();
      } catch (e) {
        pushMessage("assistant", friendlyError(t, e));
      } finally {
        busyRef.current = null;
        setStreaming(false);
        setStreamText(null);
        focusInput();
        persistChat();
        void loadQuota();
      }
      return;
    }
    let full = "";
    try {
      setModelStatus(t("stLookingUp"), true);
      const { results, error } = await webSearch(prompt);
      if (error || results.length === 0) {
        pushMessage("assistant", t("chSearchFail"));
      } else {
        pushMessage(
          "assistant",
          `${t("chSearchFound", { n: results.length })}\n${results.map((r, i) => `${i + 1}. ${r.title} — ${r.url}`).join("\n")}`,
        );
      }
      let context = "";
      if (results.length > 0) {
        context = "\n\n--- Web Search Results (fresh from Google, use these to answer) ---\n";
        for (const r of results)
          context += `\n[${r.source}] ${r.title}: ${r.snippet}\nSource: ${r.url}\n`;
        context += "--- End Search Results ---\n\n";
      }
      const fullPrompt =
        context +
        `User question: ${prompt}\n\n` +
        (results.length > 0
          ? "Instructions: Answer using the Web Search Results above. Do NOT claim you lack real-time access when results are provided. Cite sources by URL. If the results contain the answer (e.g. weather), state it directly."
          : "Instructions: No search results were available. Answer from your own knowledge and say that live search failed.") +
        replyIn;
      const stream = sessionRef.current.promptStreaming(fullPrompt);
      for await (const chunk of stream) {
        full += chunk;
        setStreamText(full);
      }
      if (full.trim()) {
        const clean = sanitizeAnswer(full) || t("chDidntGet");
        rememberClean(clean);
        pushMessage("assistant", clean);
        persistChat();
      }
    } catch (e) {
      pushMessage("assistant", friendlyError(t, e));
    } finally {
      busyRef.current = null;
      setStreaming(false);
      setStreamText(null);
      focusInput();
      setModelStatus(t("stReadyOk"), true);
      persistChat();
      void loadQuota();
    }
  }, [sessionRef, busyRef, input, setInput, pushMessage, persistChat, setModelStatus, loadQuota, t, lang]);

  const sendDisabled = !modelReady || streaming || !input.trim();
  const searchDisabled = streaming || !input.trim();

  return (
    <>
      <div className="messages" id="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="avatar">{m.role === "user" ? "U" : "G"}</div>
            {m.role === "assistant" ? (
              <div
                className="content md"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
              />
            ) : (
              <div className="content">{m.content}</div>
            )}
            {m.image ? (
              <img src={m.image.url} alt={m.image.name} className="msg-img" />
            ) : null}
            {m.role === "assistant" ? (
              <button
                className="msg-share"
                title={t("shShare")}
                onClick={() => void shareMsg(m.content, i)}
              >
                {copiedIdx === i ? "✓" : "⤴"}
              </button>
            ) : null}
          </div>
        ))}
        {streamText !== null ? (
          <div className="message assistant">
            <div className="avatar">G</div>
            <div className="content md" id="streaming-content">
              {streamText ? (
                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }} />
              ) : (
                <span className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              )}
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="input-area">
        {photos.length > 0 ? (
          <div className="task-row">
            {photos.map((p) => (
              <span key={p.name + p.data.length} className="task-chip" title={p.name}>
                <img
                  src={`data:${p.mime};base64,${p.data}`}
                  alt={p.name}
                  style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 6, verticalAlign: "middle" }}
                />{" "}
                {p.name.length > 18 ? p.name.slice(0, 18) + "…" : p.name}{" "}
                <button
                  className="quota-refresh"
                  title="✕"
                  onClick={() => setPhotos((prev) => prev.filter((x) => x !== p))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {!streaming ? (
          <div className="task-row">
            {TASKS.map((s) => (
              <button
                key={s.label}
                className="task-chip"
                onClick={() => {
                  setInput(s.prompt);
                  inputRef.current?.focus();
                }}
                title={s.prompt}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
        {messages.length === 0 && modelReady && !streaming ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {STARTERS.map((s) => (
              <button
                key={s.label}
                className="send-btn secondary"
                style={{ width: "auto", borderRadius: 16, padding: "6px 12px", fontSize: 12, height: "auto" }}
                onClick={() => {
                  setInput(s.prompt);
                  inputRef.current?.focus();
                }}
                title={s.prompt}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="input-container">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.json,.js,.jsx,.ts,.tsx,.py,.html,.htm,.css,.csv,.log,.xml,.yaml,.yml,.ini,.cfg,.toml,.png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,text/*"
            style={{ display: "none" }}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            className="send-btn secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            title={t("upAttach")}
          >
            📎
          </button>
          {speechOK ? (
            <button
              className="send-btn secondary"
              onClick={() => toggleVoice()}
              disabled={streaming && !listening}
              title={listening ? t("vcStop") : t("vcMic")}
              style={listening ? { background: "#c62828" } : undefined}
            >
              {listening ? "⏺" : "🎤"}
            </button>
          ) : null}
          <textarea
            id="prompt-input"
            ref={inputRef}
            placeholder={
              listening
                ? t("vcListening")
                : modelReady
                  ? agentMode
                    ? t("chPhAgent")
                    : t("chPhPlain")
                  : t("chSearchOnlyPh")
            }
            rows={1}
            disabled={streaming}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            className="send-btn secondary"
            onClick={() => void handleSearch()}
            disabled={searchDisabled}
            title={t("chLooking")}
          >
            {streaming ? "⏳" : "🔍"}
          </button>
          <button
            className="send-btn secondary"
            onClick={() => void handleDraw()}
            disabled={streaming || (provider === "cloud" ? !geminiKey : !comfyModel)}
            title={t("cfDraw")}
          >
            🎨
          </button>
          <button className="send-btn" onClick={() => void handleSend()} disabled={sendDisabled}>
            {streaming ? "●" : "➤"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <label
            title={t("chAgentHint")}
            style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={agentMode}
              onChange={(e) => setAgentMode(e.target.checked)}
              disabled={streaming}
            />
            {t("chAgentLabel")}
          </label>
          {!workspace.connected && workspace.supported ? (
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t("chAgentHint")}</span>
          ) : null}
        </div>
        <div className={`quota-box input-quota${quotaLow ? " low" : ""}`} title="SerpAPI searches remaining this month">
          <span id="quota-text">{quota}</span>
          {provider === "cloud" && tokens > 0 ? (
            <span className="token-meter">{t("tkTokens", { n: fmtTokens(tokens) })}</span>
          ) : null}
          <button className="quota-refresh" onClick={() => void loadQuota()} title="Refresh quota">
            ↻
          </button>
        </div>
      </div>
    </>
  );
}
