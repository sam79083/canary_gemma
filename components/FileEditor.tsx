"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { readFile as serverReadFile, writeFile as serverWriteFile } from "@/lib/api";
import type { WorkspaceApi } from "@/hooks/useWorkspace";
import { stripCodeFences, summarizeDiff } from "@/lib/diff";
import type { LanguageModelSession } from "@/lib/prompt-api.d";
import type { BusyKind } from "@/hooks/useLanguageModel";
import type { ChatMessage } from "@/lib/types";

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
}: Props) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [statusOk, setStatusOk] = useState(false);
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
      setStatus("Loading…");
      setStatusOk(false);
      try {
        const text = await readActive(path);
        if (cancelled) return;
        setContent(text);
        setOriginal(text);
        setStatus("");
      } catch (e) {
        if (cancelled) return;
        setStatus(`Failed to read file: ${e instanceof Error ? e.message : String(e)}`);
      }
      textareaRef.current?.focus();
    })();
    return () => {
      cancelled = true;
    };
  }, [path, readActive]);

  const save = useCallback(async (): Promise<boolean | "unchanged"> => {
    if (content === original) {
      setStatus("No changes — file already up to date ✓");
      setStatusOk(false);
      showToast("No changes to save");
      console.log("[Save] no changes, skipping write");
      return "unchanged";
    }
    setStatus("Saving…");
    setStatusOk(false);
    console.log("[Save]", localMode ? "local workspace" : "POST /api/file", path, content.length + " chars");
    try {
      await writeActive(path, content);
      try {
        const verify = await readActive(path);
        if (verify === content) {
          setOriginal(content);
          const where = localMode ? "local workspace" : "disk";
          const msg = `Saved ✓ ${path} (${lines} lines, ${content.length} chars) — verified in ${where} at ${new Date().toLocaleTimeString()}`;
          setStatus(msg);
          setStatusOk(true);
          showToast(`Saved ✓ ${path}`);
          onSaved();
          console.log("[Save] verified OK");
          return true;
        }
        setStatus("Save sent but verify mismatch — file differs!");
        showToast("Save sent but verify mismatch", true);
        return false;
      } catch (ve) {
        setOriginal(content);
        setStatus(`Saved ✓ ${new Date().toLocaleTimeString()} (verify read failed: ${ve instanceof Error ? ve.message : String(ve)})`);
        setStatusOk(true);
        showToast(`Saved ✓ ${path}`);
        onSaved();
        return true;
      }
    } catch (e) {
      console.error("[Save] failed:", e);
      const msg = `Save failed: ${e instanceof Error ? e.message : String(e)}`;
      setStatus(msg);
      showToast(msg, true);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, original, path, lines, onSaved, showToast, readActive, writeActive, localMode]);

  const close = useCallback(() => {
    if (content !== original) {
      if (!confirm("Discard unsaved changes?")) return;
    }
    onClose();
  }, [content, original, onClose]);

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
      setStatus("Type an instruction for the AI first");
      return;
    }
    if (!sessionRef.current) {
      console.warn("[AI Edit] session is null — model not ready");
      setStatus('Model not ready yet — wait for "Ready — Gemma 4" in the top bar');
      return;
    }
    if (busyRef.current) {
      setStatus("Model is busy in chat — wait a moment");
      return;
    }
    busyRef.current = "ai";
    setAiBusy(true);
    setStatus("AI is reading the file and rewriting it…");
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
          setStatus(`AI writing… ${result.length} chars (live preview)`);
        }
        console.log("[AI Edit] stream done, total chars:", result.length);
      } catch (streamErr) {
        console.warn("[AI Edit] promptStreaming failed, trying session.prompt:", streamErr);
        setStatus("Streaming failed, retrying non-stream…");
        result = (await sessionRef.current.prompt(aiPrompt)) ?? "";
      }
      result = stripCodeFences(result);
      if (!result) {
        setStatus("AI returned empty output — nothing applied (restored original)");
        setContent(backup);
        return;
      }
      const diff = summarizeDiff(backup, result);
      setContent(result);
      setStatus("✨ AI edit applied — saving…");
      const saveOk = await (async () => {
        // inline save of the new content to keep verify logic in one place
        setStatus("Saving…");
        try {
          await writeActive(path, result);
          const verify = await readActive(path);
          if (verify === result) {
            setOriginal(result);
            const where = localMode ? "local workspace" : "disk";
            const msg = `Saved ✓ ${path} — verified in ${where} at ${new Date().toLocaleTimeString()}`;
            setStatus(msg);
            setStatusOk(true);
            onSaved();
            return true as const;
          }
          setStatus("Save sent but verify mismatch — file differs!");
          return false as const;
        } catch (e) {
          setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
          return false as const;
        }
      })();
      pushMessage("user", `✨ AI Edit ${path}: ${instr}`);
      pushMessage(
        "assistant",
        `Edited ${path} (${diff.oldCount}→${diff.newCount} lines, +${diff.added}/-${diff.removed}). ` +
          (saveOk === true ? "Saved ✓ verified." : "Save FAILED — see editor status.") +
          `\n\n${diff.preview}`,
      );
      persistChat();
      setInstruction("");
      showToast(saveOk === false ? "AI edit applied but save FAILED" : `AI edit saved ✓ ${path}`, saveOk === false);
    } catch (err) {
      console.error("[AI Edit] failed:", err);
      setStatus(`AI edit failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      busyRef.current = null;
      setAiBusy(false);
    }
  }, [aiBusy, instruction, readInput, sessionRef, busyRef, content, path, onSaved, pushMessage, persistChat, showToast, readActive, writeActive, localMode]);

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
              <span id="editor-dirty" className="editor-dirty">● unsaved</span>
            ) : null}
          </div>
          <div className="editor-header-actions">
            <span id="editor-status" className={`editor-status${statusOk ? " success" : ""}`}>
              {status}
            </span>
            <button className="editor-btn" onClick={close} title="Close (Esc)">
              ✕ Close
            </button>
          </div>
        </div>
        <textarea
          id="editor-textarea"
          ref={textareaRef}
          spellCheck={false}
          placeholder="File contents…"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (status.startsWith("Saved") || status.startsWith("No changes")) {
              setStatus("");
              setStatusOk(false);
            }
          }}
        />
        <div className="editor-ai-bar">
          <input
            id="editor-instruction"
            type="text"
            placeholder="Tell AI what to change… e.g fix the bug, add comments, refactor to async/await"
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
            title="Let the model read the file and rewrite it"
          >
            {aiBusy ? "⏳ Editing…" : "✨ AI Edit"}
          </button>
        </div>
        <div className="editor-footer">
          <div className="editor-hint">
            Ctrl+S to save &nbsp;•&nbsp; Esc to close &nbsp;•&nbsp; {lines} lines • {content.length} chars
          </div>
          <div className="editor-actions">
            <button className="editor-btn" onClick={close}>Cancel</button>
            <button className="editor-btn primary" onClick={() => void save()}>💾 Save</button>
            <button
              className="editor-btn accent"
              onClick={() => void sendToModel()}
              title="Insert file contents into chat so the model can see it"
            >
              📤 Send to Model
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
