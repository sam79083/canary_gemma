"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  deletePath as serverDeletePath,
  downloadHref,
  fetchPage,
  fetchQuota,
  listFiles as serverListFiles,
  makeDir as serverMakeDir,
  readFile as serverReadFile,
  readFileBinary as serverReadBinary,
  triggerDownload,
  webSearch,
  writeFile as serverWriteFile,
  writeFileBinary as serverWriteFileBinary,
} from "@/lib/api";
import {
  createMkdirEntry,
  createWriteEntry,
  snapshotForDelete,
  type UndoInput,
} from "@/lib/undo";
import type { LanguageModelSession, PromptImage } from "@/lib/prompt-api.d";
import type { BusyKind, Provider } from "@/hooks/useLanguageModel";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { ChatMessage, ReviewFn } from "@/lib/types";
import { type Lang, LANGS, type TFn } from "@/lib/i18n";
import { TRIAL_GEMINI_LIMIT, TRIAL_HF_LIMIT } from "@/lib/trial-limits";
import { estimateTokens, getDrawsToday, recordDraw, recordUsage } from "@/lib/usage";
import { renderMarkdown } from "@/lib/markdown";
import { sanitizeAnswer } from "@/lib/sanitize";
import { generateHFImage, HF_DRAW_LABEL } from "@/lib/cloud-model";
import Tip from "@/components/Tip";
import MouseOrb from "@/components/MouseOrb";
import { motion } from "motion/react";
import {
  AGENT_MAX_STEPS,
  buildAgentPreamble,
  buildToolResultTurn,
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
  pushMessage: (role: ChatMessage["role"], content: string, image?: ChatMessage["image"], files?: ChatMessage["files"]) => void;
  /** Drop the trailing assistant message (for answer regen). */
  removeLastAssistant: () => void;
  /** Delete one message bubble (chat context menu). */
  deleteMessage: (idx: number) => void;
  /** Save one message bubble as a file (chat context menu). */
  saveMessageAsFile: (idx: number) => void;
  /** Fired with the number of files written in a turn (celebrations). */
  onFilesCreated?: (n: number) => void;
  persistChat: () => void;
  workspace: WorkspaceApi;
  onFilesChanged: () => void;
  onOpenFile: (path: string) => void;
  reviewChange: ReviewFn;
  /** Backup-before-write: every mutation records its old state for Undo. */
  recordUndo: (e: UndoInput) => void;
  /** Number of undoable changes (0 = hide the Undo button). */
  undoCount: number;
  /** Display name of the most recent change, if any. */
  undoLabel: string | null;
  /** Undo the most recent change. */
  onUndo: () => void;
  provider: Provider;
  /** Native multimodal session for built-in Gemma photo turns (null = N/A). */
  ensureVision: () => Promise<LanguageModelSession | null>;
  /** Model id for usage tracking (e.g. gemma-4-26b-a4b-it). Empty = don't track. */
  usageModel: string;
  /** HF token for HD drawing. Empty = members use the server key. */
  hfKey?: string;
  /** Opt-in style line appended on direct-answer turns only ("" = none).
   * Never sent on agent tool-loop turns, where it could corrupt format. */
  personalityLine?: string;
  /** Called when a trial budget runs out (open the key guide for them). */
  onTrialOver?: () => void;
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
  if (/trial-over/i.test(raw)) return t("trOver", { n: TRIAL_GEMINI_LIMIT });
  const name = path ? shortName(path) : "";
  if (/not found|no such|does not exist|ENOENT|NotFound/i.test(raw))
    return t("chErrNotFound", { name });
  if (/permission|denied|not allowed|SecurityError|AbortError/i.test(raw))
    return t("chErrPerm", { name });
  if (/binary/i.test(raw)) return t("chErrBinary", { name });
  if (/server-bad-key/i.test(raw)) return t("stServerBadKey");
  if (/bad-key/i.test(raw)) return t("stCloudBadKey");
  if (/bad-model/i.test(raw)) return t("stCloudBadModel");
  if (/no-server-key/i.test(raw)) return t("stCloudNeedKey");
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
  removeLastAssistant,
  deleteMessage,
  saveMessageAsFile,
  onFilesCreated,
  persistChat,
  workspace,
  onFilesChanged,
  onOpenFile,
  reviewChange,
  recordUndo,
  undoCount,
  undoLabel,
  onUndo,
  provider,
  ensureVision,
  usageModel,
  hfKey = "",
  personalityLine = "",
  onTrialOver,
  t,
  lang,
}: Props) {
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [quota, setQuota] = useState(t("chQuotaCheck"));
  const [quotaLow, setQuotaLow] = useState(false);
  const [agentMode, setAgentMode] = useState(true);
  const [tokens, setTokens] = useState(0);
  const [draws, setDraws] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Chat bubble context menu (right-click). */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);
  /** Assistant bubble showing raw markdown instead of rendered HTML. */
  const [rawIdx, setRawIdx] = useState<number | null>(null);
  const [photos, setPhotos] = useState<{ name: string; mime: string; data: string }[]>([]);
  const [speechOK, setSpeechOK] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRec | null>(null);
  const recogBase = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prompts are the user's bare text — no per-turn instruction blocks.
  // (Appended checklists get echoed back as deliberation.)

  // Fresh chat → fresh token count.
  useEffect(() => {
    if (messages.length === 0) setTokens(0);
  }, [messages.length]);

  useEffect(() => {
    try {
      setDraws(getDrawsToday());
    } catch {
      // storage unavailable
    }
  }, []);

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

  /** Plain-text copy with ✓ feedback (chat context menu). */
  const copyText = useCallback(async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do
    }
  }, []);

  /** Right-click on a bubble: open the context menu for that message. */
  const onBubbleMenu = useCallback(
    (e: React.MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const bubble = el?.closest?.(".message[data-idx]") as HTMLElement | null;
      if (!bubble) return;
      const idx = Number(bubble.getAttribute("data-idx"));
      if (!Number.isInteger(idx) || !messages[idx]) return;
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({
        x: Math.min(e.clientX, window.innerWidth - 200),
        y: Math.min(e.clientY, window.innerHeight - 260),
        idx,
      });
    },
    [messages],
  );

  // Close the bubble menu on any outside click.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [ctxMenu]);

  /** Code-fence copy buttons are injected HTML — catch clicks by delegation. */
  const onCodeCopy = useCallback((e: React.MouseEvent) => {    const el = e.target as HTMLElement | null;
    const btn = el?.closest?.("button.md-copy") as HTMLButtonElement | null;
    if (!btn) return;
    e.preventDefault();
    const code =
      btn.closest(".md-codeblock")?.querySelector("code")?.innerText ?? "";
    if (!code.trim()) return;
    const done = () => {
      const orig = btn.getAttribute("data-copy") || "";
      btn.textContent = "✓";
      setTimeout(() => {
        if (document.contains(btn)) btn.textContent = orig;
      }, 1500);
    };
    try {
      const clip = (
        navigator as Navigator & {
          clipboard?: { writeText(s: string): Promise<void> };
        }
      ).clipboard;
      if (clip?.writeText) {
        void clip.writeText(code).then(done, () => {});
        return;
      }
    } catch {
      // fall through to the legacy path
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    } catch {
      // clipboard unavailable — leave the button as-is
    }
  }, []);

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
        // No folder: text files go to the server temp (uploads/),
        // downloadable from the ⬇️ Downloads panel.
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
          // Backup-before-write: an upload may overwrite an existing file.
          let oldText: string | null = null;
          let existed = false;
          try {
            oldText = workspace.connected
              ? await workspace.readFile(rel)
              : await serverReadFile(rel);
            existed = true;
          } catch {
            existed = false;
            oldText = null;
          }
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
          try {
            recordUndo(createWriteEntry(rel, oldText, existed));
          } catch {
            // recording must never break the upload itself
          }
          onFilesChanged();
          pushMessage("assistant", t("upUploaded", { name: rel }));
          onOpenFile(rel);
        } catch {
          pushMessage("assistant", t("upFailed"));
        }
      }
      persistChat();
      inputRef.current?.focus();
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

  /**
   * Return focus to the prompt box for continuous convo.
   * NOTE: finally-blocks call this right after setStreaming(false), but the
   * textarea is still disabled until React commits — a sync .focus() on a
   * disabled element is a no-op and focus is lost to <body>. So defer past
   * the re-enable and retry while disabled.
   */
  const focusInput = useCallback(() => {
    const attempt = (tries: number) => {
      const el = inputRef.current;
      if (!el) return;
      // Don't pull focus out of an open modal (review / editor / viewer /
      // onboarding) — the modal owns focus until it closes.
      if (
        document.getElementById("review-overlay") ||
        document.getElementById("editor-overlay") ||
        document.getElementById("onboard-overlay") ||
        document.getElementById("image-viewer")
      ) {
        return;
      }
      if (el.disabled) {
        if (tries > 0) setTimeout(() => attempt(tries - 1), 30);
        return;
      }
      try {
        el.focus({ preventScroll: true } as FocusOptions);
      } catch {
        el.focus();
      }
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(() => attempt(10), 0));
    } else {
      setTimeout(() => attempt(10), 0);
    }
  }, []);

  // Autofocus on mount so the first message needs no click.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Refocus when a response/search/draw finishes (streaming -> false),
  // unless the user deliberately moved into another field or modal.
  // This covers the disabled-button focus loss (Send becomes disabled after
  // click, focus lands on <body>) without stealing intentional focus.
  useEffect(() => {
    if (streaming) return;
    const ae = document.activeElement as HTMLElement | null;
    if (!ae || ae === document.body) {
      focusInput();
      return;
    }
    if (ae.tagName === "BUTTON") {
      if (
        !ae.closest?.(".review-overlay") &&
        !ae.closest?.(".editor-overlay")
      ) {
        focusInput();
      }
    }
  }, [streaming, focusInput]);

  /**
   * Display-only stream cleanup: the RAW text stays intact for tool parsing
   * and history — viewers never see thinking, checklists, or toolcall JSON,
   * not even mid-stream. Empty result shows the typing dots.
   */
  function showStream(full: string): void {
    if (!full) {
      setStreamText("");
      return;
    }
    setStreamText(sanitizeAnswer(stripToolCalls(full)));
  }

  const onTrialOverRef = useRef(onTrialOver);
  onTrialOverRef.current = onTrialOver;

  /** Trial budget spent: message handled by callers, guide opened here. */
  function noteTrialOver(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    if (/trial-over/i.test(msg)) {
      try {
        onTrialOverRef.current?.();
      } catch {
        // guide is best-effort
      }
      return true;
    }
    return false;
  }

  async function runModelTurn(prompt: string): Promise<string> {
    const session = sessionRef.current;
    if (!session) throw new Error("Model session not ready");
    resetUsage();
    let full = "";
    try {
      const stream = session.promptStreaming(prompt);
      for await (const chunk of stream) {
        full += chunk;
        showStream(full);
      }
    } catch (streamErr) {
      console.warn("[agent] promptStreaming failed, trying prompt():", streamErr);
      full = (await session.prompt(prompt)) ?? "";
      showStream(full);
    }
    collectUsage(prompt, full);
    return full;
  }

  /** Clear last turn's usage so a turn that reports nothing can't
   * re-record stale numbers (double counting). Best-effort. */
  function resetUsage(): void {
    try {
      const s = sessionRef.current as unknown as Record<string, unknown> | null;
      if (s && typeof s === "object" && "lastUsage" in s) {
        (s as { lastUsage: unknown }).lastUsage = null;
      }
    } catch {
      // usage tracking is best-effort
    }
  }

  function collectUsage(promptText: string, replyText: string): void {
    // Cloud sessions report token usage — accumulate for the meter and
    // record for the usage tracker. When a turn reports nothing (some
    // models omit usage metadata), fall back to a local estimate so the
    // meter reflects real activity instead of staying at zero.
    try {
      const s = sessionRef.current as unknown as {
        lastUsage?: { total?: number };
      } | null;
      const u = s?.lastUsage;
      if (u && typeof u.total === "number" && u.total > 0) {
        setTokens((prev) => prev + (u.total as number));
        if (usageModel) recordUsage(usageModel, u.total as number);
        return;
      }
      if (usageModel && (promptText || replyText)) {
        const est = estimateTokens(promptText) + estimateTokens(replyText);
        if (est > 0) {
          setTokens((prev) => prev + est);
          recordUsage(usageModel, est);
        }
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

  const handleSend = useCallback(async (override?: string) => {
    if (busyRef.current) return;
    const prompt = (override ?? input).trim();
    if (!prompt) return;
    // No AI session (e.g. phones without built-in AI): explain, don't die silently.
    if (!sessionRef.current) {
      setInput("");
      pushMessage("user", prompt);
      pushMessage("assistant", t("chNeedAi"));
      persistChat();
      focusInput();
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
        resetUsage();
        try {
          let full = "";
          const stream = session.promptWithImages(prompt + personalityLine, imgs);
          for await (const chunk of stream) {
            full += chunk;
            setStreamText(full);
          }
          collectUsage(prompt, full);
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
          noteTrialOver(e);
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
                { type: "text", value: prompt + personalityLine },
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
          noteTrialOver(e);
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
      focusInput();
      return;
    }
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", prompt);

    // Link mode: fetch up to 2 public pages in the prompt so the model
    // answers from their content (failure just falls back to no context).
    const urls = [
      ...new Set(
        (prompt.match(/https?:\/\/[^\s)>\]"']+/gi) ?? []).map((u) =>
          u.replace(/[.,;:!?]+$/, ""),
        ),
      ),
    ].slice(0, 2);
    let pageCtx = "";
    if (urls.length > 0) {
      setStreamText(t("chReading"));
      const parts: string[] = [];
      for (const u of urls) {
        try {
          const p = await fetchPage(u);
          parts.push(
            `--- Page: ${p.title || p.url}\nURL: ${p.url}\n${p.text}\n--- End page ---`,
          );
        } catch {
          pushMessage("assistant", t("chPageFail"));
        }
      }
      if (parts.length > 0) {
        const langName =
          LANGS.find((l) => l.code === lang)?.modelName ?? "Korean";
        pageCtx =
          `\n\n--- Fetched page content (use this to answer; cite the URL) ---\n` +
          `${parts.join("\n\n")}\n--- End fetched content ---\n` +
          `IMPORTANT: Reply in ${langName} regardless of the page language.\n\n`;
      }
    }

    // Plain chat path — agent toggle off.
    if (!agentMode) {
      setStreamText("");
      let full = "";
      try {
        full = await runModelTurn(pageCtx + prompt + personalityLine);
        const clean = sanitizeAnswer(stripToolCalls(full).trim());
        if (clean) {
          rememberClean(clean);
          pushMessage("assistant", clean);
          persistChat();
        }
      } catch (e) {
        noteTrialOver(e);
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
    // Workspace connected -> user's folder. Otherwise -> server temp
    // (uploads/), shown in the ⬇️ Downloads panel for browser download.
    const useWorkspaceFiles = workspace.connected;

    // Without a workspace every path is jailed under uploads/ so the
    // model can never touch project files and everything stays
    // downloadable via /api/download.
    const jail = (p: string): string => {
      if (useWorkspaceFiles) return p;
      const c0 = cleanRelPath(p);
      const clean = c0 === "uploads" ? "" : c0.replace(/^uploads\//, "");
      return clean ? `uploads/${clean}` : "uploads";
    };

    const listOp = (p: string) =>
      useWorkspaceFiles ? workspace.list(p) : serverListFiles(p ? jail(p) : "uploads");
    const readOp = (p: string) =>
      useWorkspaceFiles ? workspace.readFile(p) : serverReadFile(p);
    const writeOp = (p: string, c: string) =>
      useWorkspaceFiles ? workspace.writeFile(p, c) : serverWriteFile(p, c);
    const mkdirOp = (p: string) =>
      useWorkspaceFiles ? workspace.makeDir(p) : serverMakeDir(p);
    const deleteOp = (p: string) =>
      useWorkspaceFiles ? workspace.deletePath(p) : serverDeletePath(p);
    const readBinaryOp = (p: string): Promise<Blob> =>
      useWorkspaceFiles ? workspace.readBinary(p) : serverReadBinary(p);

    // First free numbered sibling: report.md -> report-2.md, report-3.md…
    const uniquePath = async (baseRel: string): Promise<string> => {
      const slash = baseRel.lastIndexOf("/");
      const dir = slash >= 0 ? baseRel.slice(0, slash) : "";
      const file = slash >= 0 ? baseRel.slice(slash + 1) : baseRel;
      const dot = file.lastIndexOf(".");
      const stem = dot > 0 ? file.slice(0, dot) : file;
      const ext = dot > 0 ? file.slice(dot) : "";
      for (let n = 2; n < 1000; n++) {
        const cand = (dir ? `${dir}/` : "") + `${stem}-${n}${ext}`;
        try {
          await readOp(cand);
        } catch {
          return cand; // missing — free to use
        }
      }
      return (dir ? `${dir}/` : "") + `${stem}-${Date.now()}${ext}`;
    };

    async function executeTool(tc: ToolCall): Promise<{ ok: boolean; detail: string; mutated: boolean; openPath?: string }> {
      const rawRel = cleanRelPath(tc.path);
      // Jail server-temp mode under uploads/ (workspace mode untouched).
      const rel = tc.name === "listFiles" ? rawRel : jail(rawRel);
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
            // Backup-before-write: capture the old state FIRST so a bad
            // model output can always be reverted via Undo.
            let oldText: string | null = null;
            let existed = false;
            try {
              oldText = await readOp(rel);
              existed = true;
            } catch {
              existed = false;
              oldText = null;
            }
            const verdict = await reviewChange({
              kind: "write",
              path: rel,
              oldText: oldText ?? "",
              newText: tc.content,
            });
            if (!verdict.ok) {
              // Revision request: send it back so the model regenerates
              // instead of ending the turn.
              if (verdict.feedback) {
                return {
                  ok: false,
                  detail: `User wants changes (nothing saved yet): ${verdict.feedback} — call writeFile for "${rel}" again with content revised accordingly.`,
                  mutated: false,
                };
              }
              // Drop means "leave everything as it was": say so precisely —
              // a dropped rewrite keeps the existing file, a dropped new
              // file creates nothing.
              return {
                ok: false,
                detail: existed ? t("rvKeptExisting") : t("rvDeclined"),
                mutated: false,
              };
            }
            const finalText = verdict.text;
            const targetRel = verdict.saveAsNew ? await uniquePath(rel) : rel;
            await writeOp(targetRel, finalText);
            try {
              recordUndo(createWriteEntry(targetRel, targetRel === rel ? oldText : null, targetRel === rel && existed));
            } catch {
              // recording must never break the write itself
            }
            // Verify the bytes actually stuck — a silent bad write is
            // worse than an explicit retry.
            try {
              const back = await readOp(targetRel);
              if (back !== finalText) {
                onFilesChanged();
                return { ok: false, detail: t("chErrSomething"), mutated: true, openPath: targetRel };
              }
            } catch {
              // re-read failed (permissions/race) — write itself succeeded
            }
            onFilesChanged();
            return {
              ok: true,
              detail: `Wrote ${targetRel} (${finalText.length} chars). Verified.`,
              mutated: true,
              openPath: targetRel,
            };
          }
          case "makeDir": {
            await mkdirOp(rel);
            try {
              recordUndo(createMkdirEntry(rel));
            } catch {
              // recording must never break the op itself
            }
            onFilesChanged();
            return { ok: true, detail: `Created "${shortName(rel)}".`, mutated: true };
          }
          case "deletePath": {
            // Review modal first (not a bare confirm()), then snapshot the
            // old bytes BEFORE deleting so Undo can restore them.
            const verdict = await reviewChange({
              kind: "delete",
              path: rel,
              oldText: "",
              newText: "",
            });
            if (!verdict.ok)
              return { ok: false, detail: t("chKept", { name: shortName(rel) }), mutated: false };
            let backup = null;
            try {
              backup = await snapshotForDelete(
                { list: listOp, read: readOp, readBinary: readBinaryOp },
                rel,
              );
            } catch {
              backup = null;
            }
            await deleteOp(rel);
            if (backup) {
              try {
                recordUndo(backup);
              } catch {
                // recording must never break the op itself
              }
            }
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
    try {
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

      // Capable cloud/local models mirror long instructions back as
      // "thinking" — they get the short preamble; only tiny on-device
      // Gemma needs the explicit one.
      const verbosePreamble = provider !== "cloud" && provider !== "ollama";
      // Per-chat work folder (workspace mode): keeps each conversation's
      // files separate under downloads/<slug>/. Temp mode stays flat in
      // uploads/ so the Downloads panel keeps listing everything.
      const chatSlug = (() => {
        const first = messages.find((m) => m.role === "user");
        const raw = (typeof first?.content === "string" ? first.content : "")
          .toLowerCase()
          .replace(/[^a-z0-9가-힣]+/gu, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 30);
        return raw || "chat";
      })();
      const deliverHint = useWorkspaceFiles
        ? `When the user asks for a file deliverable (e.g. "make me an md file"), save it under "downloads/${chatSlug}/" (e.g. "downloads/${chatSlug}/report.md") — one folder per conversation, parent folders are created automatically.`
        : `No workspace folder is connected: temp mode. When the user asks for a file deliverable (e.g. "make me an md file"), save it under uploads/ (e.g. "uploads/report.md") — it appears in their ⬇️ Downloads panel for browser download. Never write outside uploads/.`;
      let nextPrompt = `${buildAgentPreamble(rootListing, verbosePreamble)}\n${deliverHint}\n${pageCtx}\n${prompt}`;
      let finalAnswer: string | null = null;
      const writtenPaths: string[] = [];

      for (let step = 0; step < AGENT_MAX_STEPS; step++) {
        setModelStatus(step === 0 ? t("stThinking") : t("stWorking", { n: step + 1 }), true);
        const raw = await runModelTurn(nextPrompt);
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
              `Reply again with EXACTLY ONE valid block and nothing else (shape illustration only — use the path from the user's request, never this example path):\n` +
              `\`\`\`toolcall\n{"name": "readFile", "path": "relative/path.txt"}\n\`\`\`\n` +
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
        if (result.ok && tc.name === "writeFile" && result.openPath)
          writtenPaths.push(result.openPath);

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
      const writtenFiles = [...new Set(writtenPaths)].map((p) => ({
        name: shortName(p),
        path: p,
      }));
      // Temp mode: clickable download links right in the answer body
      // (the route serves them as attachments).
      let delivered = finalAnswer;
      if (!useWorkspaceFiles && writtenFiles.length > 0) {
        const safe = (s: string) => s.replace(/[\[\]()]/g, "_");
        delivered +=
          "\n\n" +
          writtenFiles.map((f) => `- [⬇️ ${safe(f.name)}](${downloadHref(f.name)})`).join("\n");
      }
      pushMessage(
        "assistant",
        delivered,
        undefined,
        writtenFiles.length > 0 ? writtenFiles : undefined,
      );
      if (writtenFiles.length > 0) {
        try {
          onFilesCreated?.(writtenFiles.length);
        } catch {
          // celebrations must never break the turn
        }
      }
      // Never auto-open the editor — the user opens files by clicking
      // (FileTree / Downloads panel). Just refresh the listings.
      onFilesChanged();
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
  }, [sessionRef, busyRef, input, messages, setInput, pushMessage, persistChat, setModelStatus, agentMode, workspace, reviewChange, provider, ensureVision, t, lang]);

  /** Drop the last assistant answer and re-ask the last user text (text only). */
  const handleRegen = useCallback(() => {
    if (busyRef.current || streaming || !modelReady) return;
    if (messages.length === 0 || messages[messages.length - 1].role !== "assistant")
      return;
    const prevUser = [...messages].reverse().find((m) => m.role === "user");
    if (!prevUser || prevUser.image) return;
    const text = prevUser.content.trim();
    if (!text) return;
    removeLastAssistant();
    void handleSend(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming, modelReady, handleSend, removeLastAssistant]);

  const STARTERS = [
    { label: t("chSt1L"), prompt: t("chSt1P") },
    { label: t("chSt2L"), prompt: t("chSt2P") },
    { label: t("chSt3L"), prompt: t("chSt3P") },
  ];

  const TASKS: { label: string; prompt: string; cursorBack?: number }[] = [
    { label: t("tk1L"), prompt: t("tk1P") },
    { label: t("tk2L"), prompt: t("tk2P") },
    { label: t("tk3L"), prompt: t("tk3P") },
    { label: t("tk4L"), prompt: t("tk4P"), cursorBack: 11 },
  ];

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? "").split(",").slice(1).join(","));
      r.onerror = () => reject(new Error("encode"));
      r.readAsDataURL(blob);
    });
  }

  /** Generate → save → post. HD only (server trial key, else your own). */
  const runDraw = useCallback(async (
    promptText: string,
    userLabel: string,
  ): Promise<void> => {
    if (busyRef.current) return;
    // No early key gate: generateHFImage() tries the server trial key
    // first (/api/hf-draw) and only needs the user's own key as fallback
    // (501 no-server-key) or after the trial budget is spent.
    // (Members bypass the trial via cookie, so this covers them too.)
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", `${userLabel} ${promptText}`);
    const started = Date.now();
    setStreamText(t("cfDrawing", { n: 0 }));
    const tick = setInterval(() => {
      setStreamText(t("cfDrawing", { n: Math.round((Date.now() - started) / 1000) }));
    }, 1000);
    try {
      const blob = (await generateHFImage(hfKey, promptText)).blob;
      await savePicture(blob, promptText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "no-space") pushMessage("assistant", t("cfNoSpace"));
      else if (msg === "hf-bad-key") pushMessage("assistant", t("cfHFBad"));
      else if (msg === "hf-limited") pushMessage("assistant", t("cfHFLimited"));
      else if (msg === "trial-over") {
        noteTrialOver(e);
        pushMessage("assistant", t("trOver", { n: TRIAL_HF_LIMIT }));
      }
      else if (msg === "hf-no-key") pushMessage("assistant", t("cfHFNoKey"));
      else if (msg === "hf-no-model") pushMessage("assistant", t("cfHFNoModel"));
      else if (msg === "no-image" || msg === "empty-image") pushMessage("assistant", t("chDidntGet"));
      else if (msg.startsWith("HTTP"))
        pushMessage("assistant", t("cfCloudFail", { msg }));
      else {
        noteTrialOver(e);
        pushMessage("assistant", friendlyError(t, e));
      }
    } finally {
      clearInterval(tick);
      busyRef.current = null;
      setStreaming(false);
      setStreamText(null);
      focusInput();
      persistChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setInput, pushMessage, persistChat, hfKey, workspace, onFilesChanged, t]);

  /** Text prompt → HD picture (server trial, else your HF key) → chat + workspace. */
  const handleDraw = useCallback(async () => {
    // Users often type the 🎨 themselves and then press the button too.
    const prompt = input.replace(/^[🎨✨📷🖼️\s]+/u, "").trim();
    if (!prompt) {
      pushMessage("assistant", t("cfNoPrompt"));
      inputRef.current?.focus();
      return;
    }
    await runDraw(prompt, "🖼️");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, pushMessage, runDraw, t]);

  /** Re-roll the same prompt (new seed each time). */
  const handleReroll = useCallback(async (img: NonNullable<ChatMessage["image"]>) => {
    if (busyRef.current || !img.prompt) return;
    await runDraw(img.prompt, "🖼️");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runDraw]);

  async function savePicture(
    blob: Blob,
    prompt: string,
  ): Promise<void> {
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
    try {
      // Timestamped names are unique — undo is simply deleting the file.
      recordUndo(createWriteEntry(rel, null, false));
    } catch {
      // recording must never break the save itself
    }
    try {
      setDraws(recordDraw());
    } catch {
      // tracking unavailable — picture still saved
    }
    pushMessage(
      "assistant",
      t("cfSaved", { name: rel }) + (temp ? "\n" + t("cfTemp") : ""),
      {
        name,
        rel,
        url: URL.createObjectURL(blob),
        prompt,
        engine: "hf",
      },
    );
    persistChat();
  }

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
        noteTrialOver(e);
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
        personalityLine;
      resetUsage();
      const stream = sessionRef.current.promptStreaming(fullPrompt);
      for await (const chunk of stream) {
        full += chunk;
        setStreamText(full);
      }
      collectUsage(fullPrompt, full);
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
      <MouseOrb active={messages.length === 0 && !streaming} />
      <div
        className="messages"
        id="messages"
        onClick={onCodeCopy}
        onContextMenu={onBubbleMenu}
      >
        {messages.map((m, i) => (
          <motion.div
            key={i}
            className={`message ${m.role}`}
            data-idx={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="avatar">{m.role === "user" ? "U" : "G"}</div>
            {m.role === "assistant" ? (
              rawIdx === i ? (
                <pre className="content" style={{ fontSize: 12 }}>{m.content}</pre>
              ) : (
              <div
                className="content md"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content, t("mdCopy")) }}
              />
              )
            ) : (
              <div className="content">{m.content}</div>
            )}
            {m.image ? (
              <>
                <img src={m.image.url} alt={m.image.name} className="msg-img" />
                {m.image.prompt ? (
                  <button
                    className="task-chip"
                    style={{ marginTop: 4, alignSelf: "flex-start" }}
                    title={t("cfReroll")}
                    disabled={streaming}
                    onClick={() => void handleReroll(m.image as NonNullable<ChatMessage["image"]>)}
                  >
                    🎲 {t("cfReroll")}
                  </button>
                ) : null}
              </>
            ) : null}
            {m.files && m.files.length > 0 ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {m.files.map((f) => (
                  <span key={f.path} className="task-chip" title={f.path}>
                    📄 {f.name.length > 24 ? f.name.slice(0, 24) + "…" : f.name}{" "}
                    {!workspace.connected ? (
                      <button
                        className="quota-refresh"
                        title={t("dlTitle")}
                        onClick={() => triggerDownload(f.name)}
                      >
                        ⬇
                      </button>
                    ) : null}{" "}
                    <button
                      className="quota-refresh"
                      title={t("trEdit")}
                      onClick={() => onOpenFile(f.path)}
                    >
                      ✏️
                    </button>
                  </span>
                ))}
              </div>
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
            {m.role === "assistant" && i === messages.length - 1 ? (
              <button
                className="msg-share"
                title={t("chRegen")}
                disabled={streaming || !modelReady}
                onClick={() => handleRegen()}
              >
                ↻
              </button>
            ) : null}
          </motion.div>
        ))}
        {ctxMenu && messages[ctxMenu.idx] ? (
          <div
            id="chat-context-menu"
            style={{
              position: "fixed",
              left: ctxMenu.x,
              top: ctxMenu.y,
              background: "var(--model-bar-bg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 0",
              zIndex: 1000,
              minWidth: 180,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {(
              [
                {
                  label: copiedIdx === ctxMenu.idx ? "✓" : `📋 ${t("ctxCopy")}`,
                  run: () => void copyText(messages[ctxMenu.idx].content, ctxMenu.idx),
                },
                ...(messages[ctxMenu.idx].role === "assistant"
                  ? [
                      {
                        label: rawIdx === ctxMenu.idx ? `🖥 ${t("ctxRendered")}` : `👁 ${t("ctxRaw")}`,
                        run: () =>
                          setRawIdx((v) => (v === ctxMenu.idx ? null : ctxMenu.idx)),
                      },
                      {
                        label: `💾 ${t("ctxSaveFile")}`,
                        run: () => saveMessageAsFile(ctxMenu.idx),
                      },
                      {
                        label: `⤴ ${t("shShare")}`,
                        run: () => void shareMsg(messages[ctxMenu.idx].content, ctxMenu.idx),
                      },
                      ...(ctxMenu.idx === messages.length - 1
                        ? [
                            {
                              label: `↻ ${t("chRegen")}`,
                              run: () => handleRegen(),
                            },
                          ]
                        : []),
                    ]
                  : [
                      {
                        label: `✏️ ${t("ctxEditAgain")}`,
                        run: () => {
                          setInput(messages[ctxMenu.idx].content);
                          inputRef.current?.focus();
                        },
                      },
                      {
                        label: `💾 ${t("ctxSaveFile")}`,
                        run: () => saveMessageAsFile(ctxMenu.idx),
                      },
                      {
                        label: `🗑️ ${t("ctxDelete")}`,
                        run: () => {
                          setRawIdx((v) => (v === ctxMenu.idx ? null : v));
                          deleteMessage(ctxMenu.idx);
                        },
                      },
                    ]),
              ] as { label: string; run: () => void }[]
            ).map((item) => (
              <div
                key={item.label}
                onClick={() => {
                  setCtxMenu(null);
                  item.run();
                }}
                onMouseOver={(e) => ((e.target as HTMLElement).style.background = "var(--border)")}
                onMouseOut={(e) => ((e.target as HTMLElement).style.background = "transparent")}
                style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
              >
                {item.label}
              </div>
            ))}
          </div>
        ) : null}
        {streamText !== null ? (
          <motion.div
            className="message assistant"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="avatar">G</div>
            <div className="content md" id="streaming-content">
              {streamText ? (
                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText, t("mdCopy")) }} />
              ) : (
                <span className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              )}
            </div>
          </motion.div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div
        className="input-area"
        onDragOver={(e) => {
          e.preventDefault();
          if (!streaming) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!streaming && e.dataTransfer?.files?.length)
            void handleFiles(e.dataTransfer.files);
        }}
        style={dragOver ? { outline: "2px dashed #2383e6", borderRadius: 8 } : undefined}
      >
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
                  // Put the caret inside the trailing "[…: ]" placeholder.
                  if (s.cursorBack) {
                    const back = s.cursorBack;
                    setTimeout(() => {
                      const el = inputRef.current;
                      if (el) {
                        const pos = Math.max(0, el.value.length - back);
                        try {
                          el.setSelectionRange(pos, pos);
                        } catch {
                          // ignore
                        }
                      }
                    }, 0);
                  }
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
          <Tip label={t("upAttach")}>
            <button
              className="send-btn secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title={t("upAttach")}
            >
              📎
            </button>
          </Tip>
          {speechOK ? (
            <Tip label={listening ? t("vcStop") : t("vcMic")}>
              <button
                className="send-btn secondary"
                onClick={() => toggleVoice()}
                disabled={streaming && !listening}
                title={listening ? t("vcStop") : t("vcMic")}
                style={listening ? { background: "#c62828" } : undefined}
              >
                {listening ? "⏺" : "🎤"}
              </button>
            </Tip>
          ) : null}
          <textarea
            id="prompt-input"
            ref={inputRef}
            autoFocus
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
          <Tip label={t("chLooking")}>
            <button
              className="send-btn secondary"
              onClick={() => void handleSearch()}
              disabled={searchDisabled}
              title={t("chLooking")}
            >
            {streaming ? (
              "⏳"
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.7z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.5 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.5-2.7-.1.1C.5 8.9 0 10.4 0 12s.5 3.1 1.5 4.5l3.7-2.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.9l3.7 2.8c1-2.9 3.7-5 6.8-5z"
                />
              </svg>
            )}
          </button>
          </Tip>
          <Tip label={t("cfHFDraw")}>
            <button
              className="send-btn secondary"
              onClick={() => void handleDraw()}
              disabled={streaming || !input.trim()}
              title={t("cfHFDraw")}
            >
              🖼️
            </button>
          </Tip>
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
          {undoCount > 0 ? (
            <button
              className="task-chip"
              onClick={() => onUndo()}
              disabled={streaming}
              title={undoLabel ?? t("udUndo")}
              style={{ marginLeft: "auto" }}
            >
              {undoLabel ? t("udUndoFile", { name: undoLabel }) : t("udUndo")} ({undoCount})
            </button>
          ) : null}
        </div>
        <div className={`quota-box input-quota${quotaLow ? " low" : ""}`} title="SerpAPI searches remaining this month">
          <span id="quota-text">{quota}</span>
          {provider === "cloud" && tokens > 0 ? (
            <span className="token-meter">{t("tkTokens", { n: fmtTokens(tokens) })}</span>
          ) : null}
          <span className="token-meter">{t("usDrawEngine", { m: HF_DRAW_LABEL, n: draws })}</span>
          <button className="quota-refresh" onClick={() => void loadQuota()} title="Refresh quota">
            ↻
          </button>
        </div>
      </div>
    </>
  );
}
