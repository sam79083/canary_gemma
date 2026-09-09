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
} from "@/lib/api";
import type { LanguageModelSession } from "@/lib/prompt-api.d";
import type { BusyKind } from "@/hooks/useLanguageModel";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import type { ChatMessage, ReviewFn } from "@/lib/types";
import { replySuffix, type Lang, type TFn } from "@/lib/i18n";
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
  pushMessage: (role: ChatMessage["role"], content: string) => void;
  persistChat: () => void;
  workspace: WorkspaceApi;
  onFilesChanged: () => void;
  onOpenFile: (path: string) => void;
  reviewChange: ReviewFn;
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
  t,
  lang,
}: Props) {
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [quota, setQuota] = useState(t("chQuotaCheck"));
  const [quotaLow, setQuotaLow] = useState(false);
  const [agentMode, setAgentMode] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replyIn = replySuffix(lang);

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
      return full;
    } catch (streamErr) {
      console.warn("[agent] promptStreaming failed, trying prompt():", streamErr);
      full = (await session.prompt(prompt)) ?? "";
      onChunk(full);
      return full;
    }
  }

  const handleSend = useCallback(async () => {
    if (!sessionRef.current || busyRef.current) return;
    const prompt = input.trim();
    if (!prompt) return;
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
        if (stripToolCalls(full).trim()) {
          pushMessage("assistant", stripToolCalls(full).trim());
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
            // Trust step: show the change, apply only on Keep.
            let oldText = "";
            try {
              oldText = await readOp(rel);
            } catch {
              oldText = "";
            }
            const approved = await reviewChange({
              kind: "write",
              path: rel,
              oldText,
              newText: tc.content,
            });
            if (!approved)
              return { ok: false, detail: t("rvDeclined"), mutated: false };
            await writeOp(rel, tc.content);
            onFilesChanged();
            return {
              ok: true,
              detail: `Wrote ${rel} (${tc.content.length} chars). Verified.`,
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
            const approved = await reviewChange({
              kind: "delete",
              path: rel,
              oldText: "",
              newText: "",
            });
            if (!approved)
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
        // No folder yet — still answer, but tell the model to ask for it.
        const full = await runModelTurn(
          `The user hasn't chosen a folder yet (there's a folder-picker button in the sidebar). ` +
            `Explain briefly that creating/reading/updating/deleting files needs them to pick a folder first, then answer their question if possible without files.\n\n${buildUserTurn(prompt)}${replyIn}`,
          setStreamText,
        );
        const clean = stripToolCalls(full).trim();
        if (clean) pushMessage("assistant", clean);
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
          finalAnswer = stripToolCalls(raw).trim() || t("chDidntGet");
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
  }, [sessionRef, busyRef, input, setInput, pushMessage, persistChat, setModelStatus, agentMode, workspace, reviewChange, t, lang]);

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

  const handleSearch = useCallback(async () => {
    if (!sessionRef.current || busyRef.current) return;
    const prompt = input.trim();
    if (!prompt) return;
    busyRef.current = "chat";
    setStreaming(true);
    setInput("");
    pushMessage("user", prompt);
    pushMessage("assistant", `${t("chLooking")} "${prompt}"…`);
    setStreamText("");
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
        pushMessage("assistant", full);
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

  const disabled = !modelReady || streaming;

  return (
    <>
      <div className="messages" id="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="avatar">{m.role === "user" ? "U" : "G"}</div>
            <div className="content">{m.content}</div>
          </div>
        ))}
        {streamText !== null ? (
          <div className="message assistant">
            <div className="avatar">G</div>
            <div className="content" id="streaming-content">
              {streamText || (
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
        {modelReady && !streaming ? (
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
          <textarea
            id="prompt-input"
            ref={inputRef}
            placeholder={agentMode ? t("chPhAgent") : t("chPhPlain")}
            rows={1}
            disabled={!modelReady || streaming}
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
            disabled={disabled}
            title={t("chLooking")}
          >
            {streaming ? "⏳" : "🔍"}
          </button>
          <button className="send-btn" onClick={() => void handleSend()} disabled={disabled || !input.trim()}>
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
          <button className="quota-refresh" onClick={() => void loadQuota()} title="Refresh quota">
            ↻
          </button>
        </div>
      </div>
    </>
  );
}
