"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { readFile as serverReadFile, writeFile as serverWriteFile } from "@/lib/api";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import { stripCodeFences, summarizeDiff } from "@/lib/diff";
import type { LanguageModelSession } from "@/lib/prompt-api.d";
import type { BusyKind } from "@/hooks/useLanguageModel";
import type { ChatMessage } from "@/lib/types";
import type { TFn } from "@/lib/i18n";

interface Props {
  path: string;
  onClose: () => void;
  onSaved: () => void;
  workspace: WorkspaceApi;
  sessionRef: RefObject<LanguageModelSession | null>;
  busyRef: RefObject<BusyKind>;
  pushMessage: (role: ChatMessage["role"], content: string) => void;
  appendInput: (text: string) => void;
  readInput: () => string;
  persistChat: () => void;
  t: TFn;
}

export default function FileEditor({
  path,
  onClose,
  onSaved,
  workspace,
  sessionRef,
  busyRef,
  pushMessage,
  appendInput,
  readInput,
  persistChat,
  t,
}: Props) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [status, setStatus] = useState(t("edLoading"));
  const [statusOk, setStatusOk] = useState(false);
  // Tracks whether the status line is a "freshly saved / no changes" notice,
  // so typing can clear it (language-independent — no string matching).
  const [freshNotice, setFreshNotice] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dirty = content !== original;
  const lines = content === "" ? 0 : content.split("\n").length;

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const localMode = workspace.supported;
  const readActive = useCallback(
    (p: string): Promise<string> =>
      localMode ? workspace.readFile(p) : serverReadFile(p),
    [localMode, workspace],
  );
  const writeActive = useCallback(
    (p: string, c: string): Promise<void> =>
      localMode ? workspace.writeFile(p, c) : serverWriteFile(p, c),
    [localMode, workspace],
  );

  // Load file on open
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setContent("");
      setOriginal("");
      setStatus(t("edLoading"));
      setStatusOk(false);
      setFreshNotice(false);
      try {
        const text = await readActive(path);
        if (cancelled) return;
        setContent(text);
        setOriginal(text);
        setStatus("");
      } catch (e) {
        if (cancelled) return;
        setStatus(t("edReadFail", { msg: e instanceof Error ? e.message : String(e) }));
      }
      textareaRef.current?.focus();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, readActive]);

  const save = useCallback(async (): Promise<boolean | "unchanged"> => {
    if (content === original) {
      setStatus(t("edNoChanges"));
      setStatusOk(false);
      setFreshNotice(true);
      showToast(t("edNoChangesToast"));
      console.log("[Save] no changes, skipping write");
      return "unchanged";
    }
    setStatus(t("edSaving"));
    setStatusOk(false);
    setFreshNotice(false);
    console.log("[Save]", localMode ? "local workspace" : "POST /api/file", path, content.length + " chars");
    try {
      await writeActive(path, content);
      try {
        const verify = await readActive(path);
        if (verify === content) {
          setOriginal(content);
          const where = localMode ? t("edWhereLocal") : t("edWhereDisk");
          const msg = t("edSaved", {
            path,
            lines,
            chars: content.length,
            where,
            time: new Date().toLocaleTimeString(),
          });
          setStatus(msg);
          setStatusOk(true);
          setFreshNotice(true);
          showToast(t("edAiSaved", { path }));
          onSaved();
          console.log("[Save] verified OK");
          return true;
        }
        setStatus(t("edVerifyMismatch"));
        showToast(t("edVerifyMismatchToast"), true);
        return false;
      } catch (ve) {
        setOriginal(content);
        setStatus(t("edVerifyReadFail", { time: new Date().toLocaleTimeString() }));
        setStatusOk(true);
        setFreshNotice(true);
        showToast(t("edAiSaved", { path }));
        onSaved();
        return true;
      }
    } catch (e) {
      console.error("[Save] failed:", e);
      const msg = t("edSaveFail", { msg: e instanceof Error ? e.message : String(e) });
      setStatus(msg);
      showToast(msg, true);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, original, path, lines, onSaved, showToast, readActive, writeActive, localMode, t]);

  const close = useCallback(() => {
    if (content !== original) {
      if (!confirm(t("edUnsavedConfirm"))) return;
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, original, onClose, t]);

  const sendToModel = useCallback(async () => {
    if (content !== original) await save();
    const header = `File: ${path}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    appendInput(header);
    onClose();
  }, [content, original, save, appendInput, onClose, path]);

  const aiEdit = useCallback(async () => {
    if (aiBusy) return;
    const instr = instruction.trim() || readInput().trim();
    console.log("[AI Edit] clicked", { path, aiBusy, hasSession: !!sessionRef.current });
    if (!instr) {
      setStatus(t("edNeedInstr"));
      return;
    }
    if (!sessionRef.current) {
      console.warn("[AI Edit] session is null — model not ready");
      setStatus(t("edNotReady"));
      return;
    }
    if (busyRef.current) {
      setStatus(t("edBusy"));
      return;
    }
    busyRef.current = "ai";
    setAiBusy(true);
    setFreshNotice(false);
    setStatus(t("edReading"));
    const backup = content;
    try {
      const aiPrompt =
        `You are an expert code editor. Rewrite the file exactly as instructed.\n\n` +
        `File path: ${path}\n\n<FILE>\n${content}\n</FILE>\n\n` +
        `Instruction: ${instr}\n\nRules:\n` +
        `- Return ONLY the complete updated file contents, nothing else.\n` +
        `- No explanations, no markdown fences, no commentary.\n` +
        `- Preserve everything unrelated to the instruction.`;
      let result = "";
      try {
        console.log("[AI Edit] calling session.promptStreaming…");
        const stream = sessionRef.current.promptStreaming(aiPrompt);
        for await (const chunk of stream) {
          result += chunk;
          setContent(stripCodeFences(result));
          setStatus(t("edWriting", { n: result.length }));
        }
        console.log("[AI Edit] stream done, total chars:", result.length);
      } catch (streamErr) {
        console.warn("[AI Edit] promptStreaming failed, trying session.prompt:", streamErr);
        setStatus(t("edStreamFail"));
        result = (await sessionRef.current.prompt(aiPrompt)) ?? "";
      }
      result = stripCodeFences(result);
      if (!result) {
        setStatus(t("edEmpty"));
        setContent(backup);
        return;
      }
      const diff = summarizeDiff(backup, result);
      setContent(result);
      setStatus(t("edApplied"));
      const saveOk = await (async () => {
        // inline save of the new content to keep verify logic in one place
        setStatus(t("edSaving"));
        try {
          await writeActive(path, result);
          const verify = await readActive(path);
          if (verify === result) {
            setOriginal(result);
            const where = localMode ? t("edWhereLocal") : t("edWhereDisk");
            const msg = t("edSaved", {
              path,
              lines: result.split("\n").length,
              chars: result.length,
              where,
              time: new Date().toLocaleTimeString(),
            });
            setStatus(msg);
            setStatusOk(true);
            setFreshNotice(true);
            onSaved();
            return true as const;
          }
          setStatus(t("edVerifyMismatch"));
          return false as const;
        } catch (e) {
          setStatus(t("edSaveFail", { msg: e instanceof Error ? e.message : String(e) }));
          return false as const;
        }
      })();
      pushMessage("user", `✨ AI Edit ${path}: ${instr}`);
      pushMessage(
        "assistant",
        t("edEdited", {
          path,
          o: diff.oldCount,
          n: diff.newCount,
          a: diff.added,
          r: diff.removed,
        }) +
          " " +
          (saveOk === true ? t("edSavedOk") : t("edSaveFailed")) +
          `\n\n${diff.preview}`,
      );
      persistChat();
      setInstruction("");
      showToast(saveOk === false ? t("edAiEditFailToast") : t("edAiSaved", { path }), saveOk === false);
    } catch (err) {
      console.error("[AI Edit] failed:", err);
      setStatus(t("edAiFail", { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      busyRef.current = null;
      setAiBusy(false);
    }
  }, [aiBusy, instruction, readInput, sessionRef, busyRef, content, path, onSaved, pushMessage, persistChat, showToast, readActive, writeActive, localMode, t]);

  // Ctrl+S / Esc (not while typing the AI instruction)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.id === "editor-instruction") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [save, close]);

  return (
    <div id="editor-overlay" className="editor-overlay">
      {toast ? (
        <div id="editor-toast" className={`editor-toast${toast.error ? " error" : ""}`}>
          {toast.msg}
        </div>
      ) : null}
      <div className="editor-container">
        <div className="editor-header">
          <div className="editor-title">
            <span>📄</span>
            <span id="editor-path">{path}</span>
            {dirty ? (
              <span id="editor-dirty" className="editor-dirty">{t("edUnsaved")}</span>
            ) : null}
          </div>
          <div className="editor-header-actions">
            <span id="editor-status" className={`editor-status${statusOk ? " success" : ""}`}>
              {status}
            </span>
            <button className="editor-btn" onClick={close} title={t("edCloseTitle")}>
              {t("edClose")}
            </button>
          </div>
        </div>
        <textarea
          id="editor-textarea"
          ref={textareaRef}
          spellCheck={false}
          placeholder={t("edFilePh")}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (freshNotice) {
              setStatus("");
              setStatusOk(false);
              setFreshNotice(false);
            }
          }}
        />
        <div className="editor-ai-bar">
          <input
            id="editor-instruction"
            type="text"
            placeholder={t("edAiPh")}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void aiEdit();
              }
              e.stopPropagation();
            }}
          />
          <button
            className="editor-btn ai"
            onClick={() => void aiEdit()}
            disabled={aiBusy}
            title={t("edAiTitle")}
          >
            {aiBusy ? t("edAiEditing") : t("edAiEdit")}
          </button>
        </div>
        <div className="editor-footer">
          <div className="editor-hint">
            {t("edHint", { lines, chars: content.length })}
          </div>
          <div className="editor-actions">
            <button className="editor-btn" onClick={close}>{t("edCancel")}</button>
            <button className="editor-btn primary" onClick={() => void save()}>{t("edSave")}</button>
            <button
              className="editor-btn accent"
              onClick={() => void sendToModel()}
              title={t("edSendTitle")}
            >
              {t("edSend")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
