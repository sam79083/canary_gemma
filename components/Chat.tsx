"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  deletePath as serverDeletePath,
  downloadHref,
  fetchPage,
  listFiles as serverListFiles,
  makeDir as serverMakeDir,
  readFile as serverReadFile,
  readFileBinary as serverReadBinary,
  webSearch,
  writeFile as serverWriteFile,
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
import { estimateTokens, recordUsage } from "@/lib/usage";
import { sanitizeAnswer } from "@/lib/sanitize";
import MouseOrb from "@/components/MouseOrb";
import MessageList from "@/components/chat/MessageList";
import CanvasPanel, { hasLongFence } from "@/components/chat/CanvasPanel"; // 🧪 PROTOTYPE (exp/canvas)
import Composer from "@/components/chat/Composer";
import PlanCard, { type PlanVerdict } from "@/components/chat/PlanCard";
import {
  cleanRelPath,
  errorHint,
  friendlyError,
  friendlyStep,
  isUnsafePath,
  shortName,
} from "@/components/chat/chat-text";
import { useVoiceInput } from "@/components/chat/useVoiceInput";
import { useClipboard } from "@/components/chat/useClipboard";
import { useQuota } from "@/components/chat/useQuota";
import { useFocusInput } from "@/components/chat/useFocusInput";
import { useAttachments } from "@/components/chat/useAttachments";
import { useImageDraw } from "@/components/chat/useImageDraw";
import {
  AGENT_MAX_STEPS,
  buildAgentPreamble,
  buildPlanPrompt,
  buildToolResultTurn,
  formatPlan,
  parsePlan,
  parseToolCall,
  stripToolCalls,
  type Plan,
  type ToolCall,
} from "@/lib/agent";
import { customInstructionsPrompt } from "@/lib/personalities";

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
  /** Raw user guidelines (ChatGPT-style custom instructions). Applied to
   * the agent's first turn and plan requests; direct turns get the
   * formatted block via personalityLine instead. */
  guidelines?: string;
  /** Called when a trial budget runs out (open the key guide for them). */
  onTrialOver?: () => void;
  /** Open the help dialog. */
  onHelp: () => void;
  /** Cloud-draw key (Gemini image model, any device). Empty = local only. */
  geminiKey?: string;
  t: TFn;
  lang: Lang;
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
  onHelp,
  guidelines = "",
  t,
  lang,
}: Props) {
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState(true);
  const [planMode, setPlanMode] = useState(false);
  const [tokens, setTokens] = useState(0);
  /** Approved plan text consumed once by the next agent turn. */
  const planContextRef = useRef<string | null>(null);
  /**
   * True while a plan flow is delegating to handleSend. Without this,
   * the re-entered handleSend would see planMode still on and draft
   * another plan — approve-looping forever.
   */
  const planFlowActiveRef = useRef(false);
  /** Plan awaiting user approval (null = no modal). */
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const planResolveRef = useRef<((v: PlanVerdict) => void) | null>(null);
  /** Assistant bubble showing raw markdown instead of rendered HTML. */
  const [rawIdx, setRawIdx] = useState<number | null>(null);
  /** 🧪 PROTOTYPE (exp/canvas): message open in the canvas side panel. */
  const [canvasIdx, setCanvasIdx] = useState<number | null>(null);
  /** 🧪 PROTOTYPE (exp/canvas): open canvas with built-in samples. */
  const [canvasDemo, setCanvasDemo] = useState(false);
  /** 🧪 PROTOTYPE (exp/canvas): message count already considered for auto-open. */
  const canvasAutoRef = useRef(0);
  // 🧪 PROTOTYPE (exp/canvas): auto-open like Claude — a fresh assistant
  // message with a long fenced block opens the canvas on its own.
  useEffect(() => {
    if (streaming || canvasIdx !== null || canvasDemo) return;
    if (canvasAutoRef.current === messages.length) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !hasLongFence(last.content)) {
      canvasAutoRef.current = messages.length;
      return;
    }
    canvasAutoRef.current = messages.length;
    setCanvasIdx(messages.length - 1);
  }, [messages, streaming, canvasIdx, canvasDemo]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Cooperative stop: checked at every stream chunk / agent step. The
   * model APIs take no AbortSignal, so turns poll this flag instead. */
  const stopRef = useRef(false);
  const requestStop = useCallback(() => {
    stopRef.current = true;
  }, []);
  /** Failed turn with a Retry action (send/agent/search). */
  const [turnError, setTurnError] = useState<{
    message: string;
    hint: string | null;
    retry: () => void;
  } | null>(null);
  const clearError = useCallback(() => setTurnError(null), []);
  // Prompts are the user's bare text — no per-turn instruction blocks.
  // (Appended checklists get echoed back as deliberation.)

  const { speechOK, listening, toggleVoice } = useVoiceInput({
    input,
    setInput,
    lang,
    streaming,
  });
  const { copiedIdx, shareMsg, copyText } = useClipboard();
  const { quota, quotaLow, renewal, loadQuota } = useQuota(t);
  const focusInput = useFocusInput({ inputRef, streaming });

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

  const { photos, setPhotos, handleFiles } = useAttachments({
    workspace,
    pushMessage,
    persistChat,
    onFilesChanged,
    onOpenFile,
    recordUndo,
    focus: focusInput,
    clearError,
    t,
  });
  const { draws, handleDraw, handleReroll } = useImageDraw({
    busyRef,
    input,
    setInput,
    setStreaming,
    setStreamText,
    pushMessage,
    persistChat,
    hfKey,
    workspace,
    onFilesChanged,
    recordUndo,
    focus: focusInput,
    clearError,
    noteTrialOver,
    t,
  });

  // Fresh chat → fresh token count.
  useEffect(() => {
    if (messages.length === 0) setTokens(0);
  }, [messages.length]);

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

  async function runModelTurn(prompt: string, silent = false): Promise<string> {
    const session = sessionRef.current;
    if (!session) throw new Error("Model session not ready");
    resetUsage();
    let full = "";
    try {
      const stream = session.promptStreaming(prompt);
      for await (const chunk of stream) {
        if (stopRef.current) break;
        full += chunk;
        if (!silent) showStream(full);
      }
    } catch (streamErr) {
      console.warn("[agent] promptStreaming failed, trying prompt():", streamErr);
      full = (await session.prompt(prompt)) ?? "";
      if (!silent) showStream(full);
    }
    collectUsage(prompt, full);
    return full;
  }

  /** Resolve the open plan-approval modal (PlanCard buttons call this). */
  function settlePlan(verdict: PlanVerdict): void {
    setPendingPlan(null);
    planResolveRef.current?.(verdict);
    planResolveRef.current = null;
  }

  function requestPlanApproval(plan: Plan): Promise<PlanVerdict> {
    return new Promise((resolve) => {
      planResolveRef.current = resolve;
      setPendingPlan(plan);
    });
  }

  /**
   * Plan mode: draft a step plan, wait for user approval, then run the
   * normal agent flow (approved plan prepended) or run plan-free.
   * The user message is pushed by handleSend on approve/bare so a
   * cancelled plan leaves no orphan turn behind.
   */
  async function runPlanFlow(prompt: string): Promise<void> {
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    try {
      setModelStatus(t("plPlanning"), true);
      setStreamText(t("plPlanning"));
      let rootListing: string | null = null;
      try {
        const entries = workspace.connected
          ? await workspace.list("")
          : await serverListFiles("uploads");
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
      const raw = await runModelTurn(
        buildPlanPrompt(rootListing, customInstructionsPrompt(guidelines)) +
          `\nUser request: ${prompt}`,
        true,
      );
      setStreamText(null);
      if (stopRef.current) {
        pushMessage("user", prompt);
        pushMessage("assistant", t("chStopped"));
        persistChat();
        return;
      }
      const plan = parsePlan(raw);
      if (!plan) {
        pushMessage("user", prompt);
        pushMessage("assistant", t("plEmpty"));
        persistChat();
        return;
      }
      const verdict = await requestPlanApproval(plan);
      if (verdict === "cancel") {
        pushMessage("user", prompt);
        pushMessage("assistant", t("plCancelled"));
        persistChat();
        return;
      }
      // Release the planning turn: handleSend guards on busyRef and
      // runs the full flow itself.
      busyRef.current = null;
      setStreaming(false);
      planFlowActiveRef.current = true;
      try {
        if (verdict === "approved") {
          planContextRef.current = formatPlan(plan);
          // Post the plan as a persistent todo-style checklist — the
          // modal vanishes, this stays as the turn's record.
          pushMessage("user", prompt);
          pushMessage(
            "assistant",
            `📋 ${plan.goal}\n` +
              plan.steps
                .map((s) => `☐ ${s.action}${s.path ? ` — ${s.path}` : ""}`)
                .join("\n"),
          );
          await handleSend(prompt, { skipUserMessage: true });
        } else {
          await handleSend(prompt);
        }
      } finally {
        planFlowActiveRef.current = false;
      }
    } catch (e) {
      if (noteTrialOver(e)) {
        pushMessage("assistant", friendlyError(t, e));
      } else {
        setTurnError({
          message: friendlyError(t, e),
          hint: errorHint(t, e, renewal),
          retry: () => {
            void handleSend(prompt);
          },
        });
      }
    } finally {
      busyRef.current = null;
      setStreaming(false);
      setStreamText(null);
      focusInput();
      setModelStatus(t("stReadyOk"), true);
      persistChat();
    }
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

  const handleSend = useCallback(
    async (override?: string, opts?: { skipUserMessage?: boolean }) => {
    if (busyRef.current) return;
    const prompt = (override ?? input).trim();
    if (!prompt) return;
    stopRef.current = false;
    clearError();
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
            if (stopRef.current) break;
            full += chunk;
            setStreamText(full);
          }
          collectUsage(prompt, full);
          const photoClean = sanitizeAnswer(stripToolCalls(full).trim());
          if (stopRef.current) {
            if (photoClean) pushMessage("assistant", photoClean);
            pushMessage("assistant", t("chStopped"));
            persistChat();
          } else if (photoClean) {
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
            if (stopRef.current) break;
            full += chunk;
            setStreamText(full);
          }
          const photoClean = sanitizeAnswer(stripToolCalls(full).trim());
          if (stopRef.current) {
            if (photoClean) pushMessage("assistant", photoClean);
            pushMessage("assistant", t("chStopped"));
            persistChat();
          } else if (photoClean) {
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
    // Plan mode: draft + approve first, then run the normal flow.
    // (Photo turns above already returned; plans cover text/file tasks.)
    // planFlowActiveRef skips this on the delegated re-entry — otherwise
    // approving a plan would draft another plan, forever.
    if (planMode && sessionRef.current && !planFlowActiveRef.current) {
      await runPlanFlow(prompt);
      return;
    }
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    // Plan flow pushes the user turn itself (together with the checklist),
    // so the delegated re-entry must not duplicate it.
    if (!opts?.skipUserMessage) pushMessage("user", prompt);

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
        if (stopRef.current) {
          if (clean) pushMessage("assistant", clean);
          pushMessage("assistant", t("chStopped"));
          persistChat();
        } else if (clean) {
          rememberClean(clean);
          pushMessage("assistant", clean);
          persistChat();
        }
      } catch (e) {
        if (noteTrialOver(e)) {
          pushMessage("assistant", friendlyError(t, e));
        } else {
          setTurnError({
            message: friendlyError(t, e),
            hint: errorHint(t, e, renewal),
            retry: () => {
              void handleSend(prompt);
            },
          });
        }
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

    async function executeTool(tc: ToolCall): Promise<{ ok: boolean; detail: string; mutated: boolean; openPath?: string; declined?: boolean; retry?: boolean }> {
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
                  // Not a failure: the model was asked to regenerate, so
                  // stay silent (like declines) instead of posting ✗ —
                  // the closing review card is the feedback.
                  retry: true,
                };
              }
              // Drop means "leave everything as it was": say so precisely —
              // a dropped rewrite keeps the existing file, a dropped new
              // file creates nothing.
              return {
                ok: false,
                detail: existed ? t("rvKeptExisting") : t("rvDeclined"),
                mutated: false,
                declined: true,
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
              return { ok: false, detail: t("chKept", { name: shortName(rel) }), mutated: false, declined: true };
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
      // One-shot extras for the first agent turn only: an approved plan
      // (consumed here so a retry starts clean) and the user's standing
      // guidelines. Style lines stay out — they'd corrupt toolcall format.
      const approvedPlan = planContextRef.current;
      planContextRef.current = null;
      const guideBlock = customInstructionsPrompt(guidelines);
      let nextPrompt =
        (approvedPlan
          ? `Approved plan — follow its steps in order:\n${approvedPlan}\n\n`
          : "") +
        `${buildAgentPreamble(rootListing, verbosePreamble)}\n${deliverHint}\n${guideBlock}\n${pageCtx}\n${prompt}`;
      let finalAnswer: string | null = null;
      const writtenPaths: string[] = [];

      for (let step = 0; step < AGENT_MAX_STEPS; step++) {
        if (stopRef.current) break;
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

        // A user decline — or a revision request the model is about to
        // regenerate for — is not a failure: no ✗ line (the closing
        // review card is the feedback), and for declines the model is
        // told not to retry or "undo" around it.
        if (!(result.ok === false && (result.declined || result.retry)))
          pushMessage("assistant", friendlyStep(t, tc, result.ok, result.detail));

        nextPrompt = buildToolResultTurn(
          { ...tc, path: cleanRelPath(tc.path) },
          result.ok,
          result.detail,
          result.declined === true,
          result.retry === true,
        );
        setStreamText("");
      }

      if (finalAnswer === null) {
        finalAnswer = stopRef.current ? t("chStopped") : t("chAllDone");
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
      if (noteTrialOver(e)) {
        pushMessage("assistant", friendlyError(t, e));
      } else {
        setTurnError({
          message: friendlyError(t, e),
          hint: errorHint(t, e, renewal),
          retry: () => {
            void handleSend(prompt);
          },
        });
      }
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

  const handleSearch = useCallback(async (override?: string) => {
    if (busyRef.current) return;
    const prompt = (override ?? input).trim();
    if (!prompt) return;
    stopRef.current = false;
    clearError();
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
          setTurnError({
            message: t("chSearchFail"),
            hint: error ? errorHint(t, error, renewal) : null,
            retry: () => {
              void handleSearch(prompt);
            },
          });
        } else {
          pushMessage(
            "assistant",
            `${t("chSearchFound", { n: results.length })}\n${results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.url}`).join("\n\n")}\n\n${t("chNoAiNote")}`,
          );
        }
        persistChat();
      } catch (e) {
        if (noteTrialOver(e)) {
          pushMessage("assistant", friendlyError(t, e));
        } else {
          setTurnError({
            message: friendlyError(t, e),
            hint: errorHint(t, e, renewal),
            retry: () => {
              void handleSearch(prompt);
            },
          });
        }
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
        if (stopRef.current) break;
        full += chunk;
        setStreamText(full);
      }
      collectUsage(fullPrompt, full);
      if (stopRef.current) {
        if (full.trim()) pushMessage("assistant", sanitizeAnswer(full));
        pushMessage("assistant", t("chStopped"));
        persistChat();
      } else if (full.trim()) {
        const clean = sanitizeAnswer(full) || t("chDidntGet");
        rememberClean(clean);
        pushMessage("assistant", clean);
        persistChat();
      }
    } catch (e) {
      if (noteTrialOver(e)) {
        pushMessage("assistant", friendlyError(t, e));
      } else {
        setTurnError({
          message: friendlyError(t, e),
          hint: errorHint(t, e, renewal),
          retry: () => {
            void handleSearch(prompt);
          },
        });
      }
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

  return (
    <>
      <MouseOrb active={messages.length === 0 && !streaming} />
      <MessageList
        messages={messages}
        streamText={streamText}
        rawIdx={rawIdx}
        setRawIdx={setRawIdx}
        copiedIdx={copiedIdx}
        streaming={streaming}
        modelReady={modelReady}
        workspaceConnected={workspace.connected}
        t={t}
        shareMsg={shareMsg}
        copyText={copyText}
        handleReroll={handleReroll}
        handleRegen={handleRegen}
        deleteMessage={deleteMessage}
        saveMessageAsFile={saveMessageAsFile}
        setInput={setInput}
        inputRef={inputRef}
        onOpenFile={onOpenFile}
        onOpenCanvas={(idx) => {
          setCanvasIdx(idx); // 🧪 PROTOTYPE (exp/canvas)
          setCanvasDemo(false);
        }}
      />
      {/* 🧪 PROTOTYPE (exp/canvas) */}
      <button
        type="button"
        title="Open canvas demo (prototype)"
        onClick={() => {
          setCanvasIdx(null);
          setCanvasDemo(true);
        }}
        style={{
          position: "fixed",
          right: 16,
          bottom: 90,
          zIndex: 800,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          background: "var(--model-bar-bg)",
          fontSize: 20,
          cursor: "pointer",
        }}
      >
        🎨
      </button>
      {canvasDemo || (canvasIdx !== null && messages[canvasIdx]) ? (
        <CanvasPanel
          message={canvasIdx !== null && messages[canvasIdx] ? messages[canvasIdx] : null}
          onClose={() => {
            setCanvasIdx(null);
            setCanvasDemo(false);
            canvasAutoRef.current = messages.length;
          }}
        />
      ) : null}
      {pendingPlan ? (
        <PlanCard plan={pendingPlan} t={t} onSettle={settlePlan} />
      ) : null}
      {turnError ? (
        <div
          role="alert"
          style={{
            border: "1px solid #c62828",
            background: "rgba(198,40,40,0.08)",
            borderRadius: 8,
            padding: "8px 12px",
            margin: "8px 0",
            fontSize: 13,
          }}
        >
          <div>{turnError.message}</div>
          {turnError.hint ? (
            <div style={{ opacity: 0.8, marginTop: 4 }}>{turnError.hint}</div>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              className="send-btn secondary"
              style={{ width: "auto", padding: "4px 12px", height: "auto", fontSize: 12 }}
              onClick={() => {
                if (streaming) return;
                const retry = turnError.retry;
                setTurnError(null);
                retry();
              }}
            >
              {t("chRetry")}
            </button>
            <button
              className="send-btn secondary"
              style={{ width: "auto", padding: "4px 12px", height: "auto", fontSize: 12 }}
              onClick={() => setTurnError(null)}
            >
              {t("chDismiss")}
            </button>
          </div>
        </div>
      ) : null}
      <Composer
        input={input}
        setInput={setInput}
        streaming={streaming}
        modelReady={modelReady}
        inputRef={inputRef}
        photos={photos}
        setPhotos={setPhotos}
        speechOK={speechOK}
        listening={listening}
        toggleVoice={toggleVoice}
        agentMode={agentMode}
        setAgentMode={setAgentMode}
        quota={quota}
        quotaLow={quotaLow}
        loadQuota={loadQuota}
        provider={provider}
        tokens={tokens}
        draws={draws}
        emptyChat={messages.length === 0}
        undoCount={undoCount}
        undoLabel={undoLabel}
        onUndo={onUndo}
        workspaceConnected={workspace.connected}
        workspaceSupported={workspace.supported}
        t={t}
        handleFiles={handleFiles}
        handleSend={handleSend}
        handleSearch={handleSearch}
        handleDraw={handleDraw}
        onStop={requestStop}
        onRunPrompt={(p) => void handleSend(p)}
        onHelp={onHelp}
        planMode={planMode}
        setPlanMode={setPlanMode}
      />
    </>
  );
}
