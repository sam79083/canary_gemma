"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Chat from "@/components/Chat";
import FileEditor from "@/components/FileEditor";
import FileTree from "@/components/FileTree";
import Onboarding from "@/components/Onboarding";
import UsageBlock from "@/components/UsageBlock";
import { useLanguageModel, type Provider } from "@/hooks/useLanguageModel";
import { useLanguage } from "@/hooks/useLanguage";
import { useWorkspace } from "@/hooks/useWorkspace";
import { LANGS, isLang } from "@/lib/i18n";
import type { TFn } from "@/lib/i18n";
import { summarizeDiff } from "@/lib/diff";
import { fetchQuota } from "@/lib/api";
import { folderCapLine, getFolderCap } from "@/lib/capabilities";
import {
  deleteLocalSession,
  listLocalSessions,
  loadLocalSession,
  renameLocalSession,
  saveLocalSession,
} from "@/lib/sessions-local";
import {
  deleteWorkspaceSession,
  listWorkspaceSessions,
  loadWorkspaceSession,
  renameWorkspaceSession,
  saveWorkspaceSession,
} from "@/lib/sessions-workspace";
import type { ChatMessage, PendingReview, ReviewFn, ReviewResult, SessionInfo } from "@/lib/types";

const HISTORY_KEY = "gemma4-chat-history";
const THEME_KEY = "theme";
const ONBOARD_KEY = "canary-onboard";

function titleFor(messages: ChatMessage[], t: TFn): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return t("pgNewChat").replace(/^\+ /, "");
  const text = first.content.slice(0, 50);
  return text.length >= 50 ? text + "…" : text;
}

/** Keep/Undo modal. For writes the proposal is editable — Keep applies
 *  the edited text, so the reviewer becomes the editor. */
function ReviewCard({
  review,
  t,
  onSettle,
}: {
  review: PendingReview;
  t: TFn;
  onSettle: (ok: boolean, text?: string) => void;
}) {
  const [edited, setEdited] = useState(review.newText);
  useEffect(() => {
    setEdited(review.newText);
  }, [review]);

  const diffPreview =
    review.oldText === "" && edited === review.newText
      ? `+++ ${t("rvNewFile")} +++\n` +
        edited.slice(0, 2000) +
        (edited.length > 2000 ? "\n…" : "")
      : summarizeDiff(review.oldText, edited).preview;

  return (
    <div className="review-overlay" id="review-overlay">
      <div className="review-card">
        <h3>{t("rvTitle")}</h3>
        <div className="review-path">📄 {review.path}</div>
        {review.kind === "delete" ? (
          <div className="review-note">{t("rvDeleteNote")}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
              {t("rvEditHint")}
            </div>
            <textarea
              className="review-edit"
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              spellCheck={false}
            />
            <pre className="review-diff">{diffPreview}</pre>
          </>
        )}
        <div className="review-actions">
          <button className="editor-btn" onClick={() => onSettle(false)}>
            {t("rvUndo")}
          </button>
          <button
            className="editor-btn primary"
            onClick={() => onSettle(true, review.kind === "write" ? edited : undefined)}
          >
            {t("rvKeep")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ label, ok, bad }: { label: string; ok: boolean; bad: boolean }) {  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      <span style={{ color: ok ? "#2e7d32" : bad ? "#c62828" : "#999", fontWeight: 700 }}>
        {ok ? "✓" : bad ? "✗" : "○"}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function Home() {
  const { lang, setLang, t } = useLanguage();
  const model = useLanguageModel(lang, t);
  const workspace = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [dark, setDark] = useState(false);
  const [sessionList, setSessionList] = useState<SessionInfo[]>([]);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [showFlagHelp, setShowFlagHelp] = useState(false);
  const [flagCopied, setFlagCopied] = useState(false);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(model.ollamaUrl);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(model.geminiKey);

  // Keep the edit drafts in sync when stored settings finish loading.
  useEffect(() => {
    setOllamaUrlDraft(model.ollamaUrl);
  }, [model.ollamaUrl]);
  useEffect(() => {
    setGeminiKeyDraft(model.geminiKey);
  }, [model.geminiKey]);
  const [review, setReview] = useState<PendingReview | null>(null);
  const reviewResolve = useRef<((r: ReviewResult) => void) | null>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [searchOk, setSearchOk] = useState<boolean | null>(null);
  const [capLine, setCapLine] = useState("…");
  const setupRef = useRef<HTMLDetailsElement>(null);
  // Mirror of currentSessionFileRef for rendering (rename/delete row).
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  /** Ask the user to Keep/Undo a file change. Resolves with the verdict. */
  const reviewChange: ReviewFn = useCallback((r: PendingReview) => {
    return new Promise<ReviewResult>((resolve) => {
      reviewResolve.current = resolve;
      setReview(r);
    });
  }, []);

  const settleReview = useCallback(
    (ok: boolean, text?: string) => {
      reviewResolve.current?.({ ok, text: text ?? review?.newText ?? "" });
      reviewResolve.current = null;
      setReview(null);
    },
    [review],
  );

  /** Never leave the agent loop hanging if the chat is reset mid-review. */
  const cancelPendingReview = useCallback(() => {
    if (reviewResolve.current) {
      reviewResolve.current({ ok: false, text: "" });
      reviewResolve.current = null;
      setReview(null);
    }
  }, []);

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const hydratedRef = useRef(false);
  const startedRef = useRef(false);
  // One local file per conversation — overwritten on every reply so a long
  // chat doesn't spam 50 files (the old server API created one per save).
  const currentSessionFileRef = useRef<string | null>(null);

  // Theme: load once, apply to body
  useEffect(() => {
    setDark(localStorage.getItem(THEME_KEY) === "dark");
  }, []);

  // One lightweight search-health ping for the setup checklist
  // (Chat keeps its own quota display; this is only true/false/unknown).
  useEffect(() => {
    setCapLine(folderCapLine(getFolderCap()));
    void (async () => {
      try {
        const data = await fetchQuota();
        setSearchOk(!data.error);
      } catch {
        setSearchOk(false);
      }
    })();
  }, []);

  // Auto-open the Setup section when the AI can't run — that's when it's needed.
  useEffect(() => {
    if (
      (model.availability === "unsupported" ||
        model.availability === "unavailable") &&
      setupRef.current
    )
      setupRef.current.open = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.availability]);

  // First visit: show the 3-step guide.
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setOnboardOpen(true);
    } catch {
      // storage unavailable — skip the guide
    }
  }, []);

  const closeOnboard = useCallback(() => {
    try {
      localStorage.setItem(ONBOARD_KEY, "done");
    } catch {
      // ignore
    }
    setOnboardOpen(false);
  }, []);

  const handleOnboardPickFolder = useCallback(() => {
    void workspace.pick().then((ok) => {
      if (ok) setTreeVersion((v) => v + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const handleOnboardTryTask = useCallback(
    (prompt: string) => {
      setInput(prompt);
      closeOnboard();
      setTimeout(() => document.getElementById("prompt-input")?.focus(), 0);
    },
    [closeOnboard],
  );
  useEffect(() => {
    document.body.classList.toggle("dark", dark);
  }, [dark]);

  const pushMessage = useCallback((role: ChatMessage["role"], content: string) => {
    setMessages((prev) => [...prev, { role, content }]);
  }, []);

  // Persist chat to localStorage on every change (after initial hydration)
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messagesRef.current));
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  }, [messages]);

  const persistChat = useCallback(() => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    const existing = currentSessionFileRef.current;
    const title = titleFor(msgs, t);
    const refresh = () => {
      const p = workspace.connected
        ? listWorkspaceSessions(workspace)
        : listLocalSessions();
      void p
        .then(setSessionList)
        .catch((e) => console.error("Failed to load sessions:", e));
    };
    if (workspace.connected) {
      void saveWorkspaceSession(workspace, title, msgs, existing)
        .then((filename) => {
          currentSessionFileRef.current = filename;
          setCurrentFile(filename);
          refresh();
        })
        .catch((e) => console.error("Auto-save session failed:", e));
    } else {
      void saveLocalSession(title, msgs, existing)
        .then((filename) => {
          currentSessionFileRef.current = filename;
          setCurrentFile(filename);
          refresh();
        })
        .catch((e) => console.error("Auto-save session failed:", e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected, t]);

  const refreshSessions = useCallback(async () => {
    try {
      setSessionList(
        workspace.connected
          ? await listWorkspaceSessions(workspace)
          : await listLocalSessions(),
      );
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected]);

  // When the workspace connects, switch the dropdown to that folder's
  // `.canary/sessions/`. First connect migrates any browser-localStorage
  // sessions into the folder once so nothing is lost.
  useEffect(() => {
    currentSessionFileRef.current = null;
    setCurrentFile(null);
    if (!workspace.connected) {
      void listLocalSessions()
        .then(setSessionList)
        .catch((e) => console.error("Failed to load sessions:", e));
      return;
    }
    void (async () => {
      try {
        const existing = await listWorkspaceSessions(workspace);
        if (existing.length === 0) {
          const local = await listLocalSessions();
          for (const s of local.slice(0, 50)) {
            try {
              const msgs = await loadLocalSession(s.filename);
              if (msgs.length > 0)
                await saveWorkspaceSession(workspace, s.title, msgs, s.filename);
            } catch {
              // skip one bad session, keep migrating the rest
            }
          }
        }
        setSessionList(await listWorkspaceSessions(workspace));
      } catch (e) {
        console.error("Failed to load workspace sessions:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected]);

  // Startup: history + model session (waits for stored provider/key
  // settings to load, or the wrong provider would connect).
  useEffect(() => {
    if (!model.hydrated) return;
    if (startedRef.current) return;
    startedRef.current = true;
    let stored: ChatMessage[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (!Array.isArray(stored)) stored = [];
    } catch {
      stored = [];
    }
    void refreshSessions();
    void (async () => {
      const avail = await model.supported();
      if (avail === "unavailable" || avail === "unsupported") {
        setMessages(stored);
        hydratedRef.current = true;
        return;
      }
      if (avail === "downloading" || avail === "downloadable") {
        // Chrome requires a user click to start the model download, so don't
        // auto-create here — the start button in the sidebar does it.
        setMessages(stored);
        hydratedRef.current = true;
        return;
      }
      if (stored.length > 0) {
        // Auto-restore, no popup: last chat comes back as-is.
        setMessages(stored);
        hydratedRef.current = true;
        if (!(await model.restoreSession(stored))) await model.createSession();
      } else {
        hydratedRef.current = true;
        await model.createSession();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.hydrated]);

  const handleNewChat = useCallback(() => {
    cancelPendingReview();
    model.destroy();
    localStorage.removeItem(HISTORY_KEY);
    currentSessionFileRef.current = null;
    setCurrentFile(null);
    setMessages([]);
    void model.supported().then((avail) => {
      // Clicking "New chat" counts as the user gesture, so creating is allowed
      // even when the model still needs downloading.
      if (avail !== "unavailable" && avail !== "unsupported")
        void model.createSession();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderSwitch = useCallback(
    async (p: Provider) => {
      if (p === model.provider || model.busyRef.current) return;
      cancelPendingReview();
      model.destroy();
      model.setProvider(p);
      const avail = await model.supported();
      if (avail === "unavailable" || avail === "unsupported") return;
      const msgs = messagesRef.current;
      if (msgs.length > 0) await model.restoreSession(msgs);
      else await model.createSession();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.provider],
  );

  const handleLoadSessionFile = useCallback(
    async (filename: string) => {
      if (!filename) return;
      try {
        const msgs = workspace.connected
          ? await loadWorkspaceSession(workspace, filename)
          : await loadLocalSession(filename);
        currentSessionFileRef.current = filename;
        setCurrentFile(filename);
        setMessages(msgs);
        model.destroy();
        await model.restoreSession(msgs);
      } catch (e) {
        console.error("Failed to load session:", e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.connected],
  );

  const handleRenameChat = useCallback(async () => {
    const filename = currentSessionFileRef.current;
    if (!filename) return;
    const current =
      sessionList.find((s) => s.filename === filename)?.title ?? "";
    const next = prompt(t("ssRename"), current);
    if (!next || !next.trim() || next.trim() === current) return;
    try {
      if (workspace.connected)
        await renameWorkspaceSession(workspace, filename, next);
      else await renameLocalSession(filename, next);
      setSessionList(
        workspace.connected
          ? await listWorkspaceSessions(workspace)
          : await listLocalSessions(),
      );
    } catch (e) {
      console.error("Rename failed:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected, sessionList, t]);

  const handleDeleteChat = useCallback(async () => {
    const filename = currentSessionFileRef.current;
    if (!filename) return;
    if (!confirm(t("ssDelete"))) return;
    try {
      if (workspace.connected)
        await deleteWorkspaceSession(workspace, filename);
      else await deleteLocalSession(filename);
    } catch (e) {
      console.error("Delete failed:", e);
    }
    handleNewChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected, t, handleNewChat]);

  const appendInput = useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? prev.trimEnd() + "\n\n" + text : text));
  }, []);

  const readInput = useCallback(() => input, [input]);

  const closeEditor = useCallback((focusChat = false) => {
    setEditorPath(null);
    if (focusChat) {
      setTimeout(
        () => document.getElementById("prompt-input")?.focus(),
        0,
      );
    }
  }, []);

  const openFileAndCloseDrawer = useCallback((p: string) => {
    setEditorPath(p);
    setSideOpen(false);
  }, []);

  const handleSaveChatAsFile = useCallback(async () => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) {
      alert(t("svEmpty"));
      return;
    }
    const title = titleFor(msgs, t);
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace("T", "-")
      .replace(":", "");
    const filename = `chat-${stamp}.md`;
    const body =
      `# ${title}\n\n` +
      msgs
        .map((m) => `${m.role === "user" ? "🧑" : "🤖"}\n\n${m.content}`)
        .join("\n\n---\n\n") +
      "\n";
    if (workspace.connected) {
      const rel = `chats/${filename}`;
      try {
        await workspace.makeDir("chats");
        await workspace.writeFile(rel, body);
        setTreeVersion((v) => v + 1);
        alert(t("svSaved", { name: rel }));
      } catch (e) {
        alert(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }
    try {
      const blob = new Blob([body], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      alert(t("svDownloaded", { name: filename }));
    } catch (e) {
      alert(t("trActionFail", { msg: e instanceof Error ? e.message : String(e) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.connected, t]);

  const showFlags =
    model.provider === "gemma" &&
    (model.availability === "unsupported" ||
      model.availability === "unavailable");
  const showStartButton =
    !model.ready &&
    model.availability !== null &&
    model.availability !== "unavailable" &&
    model.availability !== "unsupported";

  return (
    <>
      {model.download.show ? (
        <div id="download-overlay" className="download-overlay">
          <div className="download-card">
            <h3>{t("pgDlTitle")}</h3>
            <p id="download-status">{model.download.label || t("pgPreparing")}</p>
            <div className="download-bar-container">
              <div
                id="download-bar"
                className="download-bar"
                style={{ width: model.download.pct + "%" }}
              />
            </div>
            <p id="download-pct" className="download-pct">
              {Math.round(model.download.pct)}%
            </p>
          </div>
        </div>
      ) : null}

      <div className={`sidebar${sideOpen ? " open" : ""}`}>
        <div className="model-header">
          <span
            className="dot"
            id="model-dot"
            style={{ background: model.online ? "#2e7d32" : "#ccc" }}
          />
          {model.provider === "gemma" ? "Gemma 4" : model.provider === "ollama" ? (model.ollamaModel || "Local") : (model.geminiModel.split("-").slice(0, 2).join("-") || "Cloud")}
        </div>

        <div className="privacy-badge" title="Privacy">
          {model.provider === "cloud" ? t("pgPrivacyCloud") : t("pgPrivacy")}
        </div>

        <details className="side-group" open>
          <summary>{t("pgModelTitle")}</summary>
          <div className="workspace-box" id="model-box" style={{ marginTop: 0 }}>
          <div className="workspace-actions">
            <button
              className={`sidebar-btn small${model.provider === "gemma" ? " secondary" : ""}`}
              onClick={() => void handleProviderSwitch("gemma")}
              title="Gemma"
            >
              {t("pgGemma")}
            </button>
            <button
              className={`sidebar-btn small${model.provider === "ollama" ? " secondary" : ""}`}
              onClick={() => void handleProviderSwitch("ollama")}
              title="Ollama"
            >
              {t("pgOllama")}
            </button>
            <button
              className={`sidebar-btn small${model.provider === "cloud" ? " secondary" : ""}`}
              onClick={() => void handleProviderSwitch("cloud")}
              title="Cloud"
            >
              {t("pgCloud")}
            </button>
          </div>
          {model.provider === "ollama" ? (
            <>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="sidebar-btn small"
                  style={{ flex: 1, cursor: "text" }}
                  value={ollamaUrlDraft}
                  onChange={(e) => setOllamaUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      model.setOllamaUrl(ollamaUrlDraft.trim() || model.ollamaUrl);
                      void model.refreshOllamaModels();
                    }
                  }}
                  placeholder={t("pgOllamaUrl")}
                  title={t("pgOllamaUrl")}
                />
                <button
                  className="sidebar-btn small"
                  style={{ flex: "0 0 auto" }}
                  title={t("pgOllamaCheck")}
                  disabled={model.ollamaChecking}
                  onClick={() => {
                    model.setOllamaUrl(ollamaUrlDraft.trim() || model.ollamaUrl);
                    void model.refreshOllamaModels();
                  }}
                >
                  {model.ollamaChecking ? "⏳" : t("pgOllamaCheck")}
                </button>
              </div>
              {model.ollamaModels.length > 0 ? (
                <select
                  className="sidebar-btn small"
                  id="ollama-model-select"
                  value={model.ollamaModel}
                  onChange={(e) => {
                    model.setOllamaModel(e.target.value);
                    void model.reconnect();
                  }}
                >
                  {model.ollamaModel ? null : (
                    <option value="">{t("pgOllamaPick")}</option>
                  )}
                  {model.ollamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="workspace-hint">
                  {model.ollamaChecking
                    ? t("pgOllamaChecking")
                    : model.ollamaError === "none"
                      ? t("pgOllamaNone")
                      : t("pgOllamaCors")}
                </div>
              )}
            </>
          ) : null}
          {model.provider === "cloud" ? (
            <>
              <input
                className="sidebar-btn small"
                style={{ width: "100%", cursor: "text" }}
                type="password"
                autoComplete="off"
                value={geminiKeyDraft}
                onChange={(e) => setGeminiKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    model.setGeminiKey(geminiKeyDraft.trim());
                    void model.reconnect();
                  }
                }}
                placeholder={t("pgGeminiKeyPh")}
                title={t("pgGeminiKey")}
              />
              {model.geminiKey ? (
                <div className="workspace-hint" style={{ color: "#2e7d32", fontWeight: 600 }}>
                  {t("kgSaved", { last4: model.geminiKey.slice(-4) })}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="sidebar-btn small"
                  style={{ flex: 1, justifyContent: "center" }}
                  disabled={model.geminiChecking}
                  onClick={() => {
                    model.setGeminiKey(geminiKeyDraft.trim());
                    void model.reconnect();
                  }}
                >
                  {model.geminiChecking ? "⏳" : t("pgOllamaCheck")}
                </button>
                <button
                  className="sidebar-btn small"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => setShowKeyHelp((v) => !v)}
                >
                  {t("kgTitle")}
                </button>
              </div>
              <div className="workspace-hint">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("pgGeminiGetKey")}
                </a>
                {" — "}{t("pgGeminiHint")}
              </div>
              {showKeyHelp || !model.geminiKey ? (
                <div className="workspace-hint" style={{ lineHeight: 1.6 }}>
                  <div>{t("kgS1")}</div>
                  <div>{t("kgS2")}</div>
                  <div>{t("kgS3")}</div>
                </div>
              ) : null}
              {model.geminiModels.length > 0 ? (
                <select
                  className="sidebar-btn small"
                  id="gemini-model-select"
                  value={model.geminiModel}
                  onChange={(e) => {
                    model.setGeminiModel(e.target.value);
                    void model.reconnect();
                  }}
                >
                  {model.geminiModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : model.geminiError === "bad-key" ? (
                <div className="workspace-error">{t("stCloudBadKey")}</div>
              ) : model.geminiError && model.geminiError !== "need-key" ? (
                <div className="workspace-hint">
                  {model.geminiError === "none" ? t("pgGeminiNone") : t("stCloudFail")}
                </div>
              ) : null}
              {model.geminiModel ? (
                <UsageBlock model={model.geminiModel} t={t} />
              ) : null}
            </>
          ) : null}
        </div>

        {showStartButton ? (
          <button
            className="sidebar-btn"
            id="enable-model-btn"
            onClick={() => void model.createSession()}
          >
            {t("pgStartAi")}
          </button>
        ) : null}
        </details>

        <button className="sidebar-btn" id="new-chat-btn" onClick={handleNewChat} disabled={!model.ready}>
          {t("pgNewChat")}
        </button>

        <button
          className="sidebar-btn small secondary"
          id="save-chat-btn"
          onClick={() => void handleSaveChatAsFile()}
          disabled={messages.length === 0}
          style={{ marginTop: 6 }}
        >
          {t("svSave")}
        </button>

        <select
          className="sidebar-btn small"
          id="session-select"
          defaultValue=""
          onChange={(e) => {
            void handleLoadSessionFile(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="">
            {sessionList.length > 0 ? t("pgPastChats") : t("pgNoPastChats")}
          </option>
          {sessionList.map((s) => (
            <option key={s.filename} value={s.filename}>
              {s.title} ({new Date(s.timestamp).toLocaleString()})
            </option>
          ))}
        </select>

        {currentFile ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              marginTop: 6,
              fontSize: 12,
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                opacity: 0.8,
              }}
              title={
                sessionList.find((s) => s.filename === currentFile)?.title ?? currentFile
              }
            >
              💬{" "}
              {sessionList.find((s) => s.filename === currentFile)?.title ?? currentFile}
            </span>
            <button
              className="sidebar-btn small"
              style={{ flex: "0 0 auto" }}
              title={t("trEdit")}
              onClick={() => void handleRenameChat()}
            >
              ✏️
            </button>
            <button
              className="sidebar-btn small"
              style={{ flex: "0 0 auto" }}
              title={t("trDelete")}
              onClick={() => void handleDeleteChat()}
            >
              🗑️
            </button>
          </div>
        ) : null}

        <details className="side-group" open>
          <summary>{t("grpFiles")}</summary>
          <div className="workspace-box" id="workspace-box">
          {workspace.supported ? (
            workspace.connected ? (
              <>
                <div className="workspace-name" title={workspace.rootName ?? ""}>
                  📂 {workspace.rootName}
                </div>
                <div className="workspace-actions">
                  <button
                    className="sidebar-btn small"
                    onClick={() => {
                      void workspace.pick().then((ok) => {
                        if (ok) {
                          setEditorPath(null);
                          setTreeVersion((v) => v + 1);
                        }
                      });
                    }}
                  >
                    {t("pgChange")}
                  </button>
                  <button
                    className="sidebar-btn small"
                    title={t("pgRemove")}
                    onClick={() => {
                      workspace.disconnect();
                      setEditorPath(null);
                      setTreeVersion((v) => v + 1);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </>
            ) : (
              <button
                className="sidebar-btn"
                id="workspace-pick-btn"
                onClick={() => {
                  void workspace.pick().then((ok) => {
                    if (ok) setTreeVersion((v) => v + 1);
                  });
                }}
              >
                {t("pgChooseFolder")}
              </button>
            )
          ) : (
            <div className="workspace-unsupported">
              {t("pgFolderUnsupported")}
            </div>
          )}
          {workspace.error ? (
            <div className="workspace-error">{workspace.error}</div>
          ) : null}
          {workspace.supported && !workspace.connected ? (
            <div className="workspace-hint">
              {t("pgFolderHintPick")}
            </div>
          ) : null}
          {workspace.supported && workspace.connected ? (
            <div className="workspace-hint">
              {t("pgFolderHintSaved")}
            </div>
          ) : null}
        </div>

        <FileTree
          onOpenFile={openFileAndCloseDrawer}
          version={treeVersion}
          onMutated={() => setTreeVersion((v) => v + 1)}
          workspace={workspace}
          t={t}
        />
        </details>

        <details className="side-group" ref={setupRef}>
          <summary>
            {t("ckTitle")}
            {model.ready &&
            (workspace.connected || !workspace.supported) &&
            searchOk !== false ? null : (
              <span style={{ color: "#e65100" }}> •</span>
            )}
          </summary>
          <div className="note" id="setup-box" style={{ lineHeight: 1.7 }}>
            <CheckRow
              label={t("ckAi")}
              ok={model.ready}
              bad={
                model.availability === "unsupported" ||
                model.availability === "unavailable"
              }
            />
            <CheckRow
              label={
                workspace.connected && workspace.rootName
                  ? `${t("ckFolder")} (${workspace.rootName})`
                  : t("ckFolder")
              }
              ok={workspace.connected || !workspace.supported}
              bad={false}
            />
            <CheckRow label={t("ckSearch")} ok={searchOk === true} bad={searchOk === false} />
            {searchOk === false ? (
              <div style={{ fontSize: 11, opacity: 0.8 }}>{t("ckSearchHint")}</div>
            ) : null}
            {model.provider === "cloud" ? (
              <CheckRow label={t("ckKey")} ok={!!model.geminiKey} bad={false} />
            ) : null}
            <div style={{ fontSize: 11, opacity: 0.7, fontFamily: "monospace" }}>
              {capLine}
            </div>
          </div>

          {showFlags ? (
            <button
              className="sidebar-btn small secondary"
              id="enable-flags-btn"            title={t("pgFlagShow")}
              onClick={() => setShowFlagHelp((v) => !v)}
              style={{ marginTop: 8 }}
            >
              🚩 {showFlagHelp ? t("pgFlagHide") : t("pgFlagShow")}
            </button>
          ) : null}
        {showFlags && showFlagHelp ? (
          <div
            className="note"
            id="flag-help"
            style={{ marginTop: 6, lineHeight: 1.5 }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {t("pgFlagTitle")}
            </div>
            <div>{t("pgFlagS1")}</div>
            <code style={{ fontSize: 11, wordBreak: "break-all" }}>
              chrome://flags/#prompt-api-for-gemini-nano
            </code>
            <div>{t("pgFlagS1b")}</div>
            <div style={{ marginTop: 4 }}>{t("pgFlagS2")}</div>
            <code style={{ fontSize: 11, wordBreak: "break-all" }}>
              chrome://flags/#optimization-guide-on-device-model
            </code>
            <div>{t("pgFlagS2b")}</div>
            <div style={{ marginTop: 4 }}>
              {t("pgFlagS3a")}{" "}
              <code style={{ fontSize: 11 }}>chrome://components</code>{" "}
              {t("pgFlagS3b")}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                className="sidebar-btn small"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => {
                  const text =
                    "chrome://flags/#prompt-api-for-gemini-nano\nchrome://flags/#optimization-guide-on-device-model\nchrome://components";
                  void navigator.clipboard
                    ?.writeText(text)
                    .then(() => {
                      setFlagCopied(true);
                      setTimeout(() => setFlagCopied(false), 2000);
                    })
                    .catch(() => {
                      setFlagCopied(false);
                      alert(text);
                    });
                }}
              >
                {flagCopied ? t("pgCopied") : t("pgCopyLinks")}
              </button>
              <button
                className="sidebar-btn small"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => {
                  // Chrome blocks pages from opening chrome:// directly,
                  // so just copy + tell the user to paste it manually.
                  const text = "chrome://flags/#prompt-api-for-gemini-nano";
                  void navigator.clipboard?.writeText(text).catch(() => {});
                  alert(
                    t("pgFlagNote") + "\n\n" + text,
                  );
                }}
              >
                {t("pgHowToOpen")}
              </button>
            </div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
              {t("pgFlagNote")}
            </div>
          </div>
        ) : null}

        {!model.ready ? (
          <div className="note">
            {t("pgBrowserNote")}
          </div>
        ) : null}
        <button
          className="sidebar-btn small"
          id="guide-btn"
          onClick={() => setOnboardOpen(true)}
          style={{ marginTop: 8 }}
        >
          {t("obGuide")}
        </button>
        </details>
        <div className="status" id="sidebar-status">
          {model.status}
        </div>
      </div>

      {sideOpen ? (
        <div className="sidebar-backdrop" onClick={() => setSideOpen(false)} />
      ) : null}

      <div className="main">
        <div className="model-bar">
          <button
            className="hamburger"
            title={t("mbMenu")}
            onClick={() => setSideOpen((v) => !v)}
          >
            ☰
          </button>
          <span className="gemma-badge">
            {model.provider === "gemma" ? "Gemma 4" : model.provider === "ollama" ? (model.ollamaModel || "Local") : (model.geminiModel.split("-").slice(0, 2).join("-") || "Cloud")}
          </span>
          <span id="model-status">{model.status}</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              className="theme-toggle"
              title={t("pgLangTitle")}
              value={lang}
              onChange={(e) => {
                if (isLang(e.target.value)) setLang(e.target.value);
              }}
              style={{ cursor: "pointer" }}
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  🌐 {l.label}
                </option>
              ))}
            </select>
            <button
              className="theme-toggle"
              title={t("pgTheme")}
              onClick={() => {
                setDark((d) => {
                  localStorage.setItem(THEME_KEY, d ? "light" : "dark");
                  return !d;
                });
              }}
            >
              {dark ? "☀️" : "🌙"}
            </button>
          </span>
        </div>

        <Chat
          messages={messages}
          input={input}
          setInput={setInput}
          sessionRef={model.sessionRef}
          busyRef={model.busyRef}
          modelReady={model.ready}
          setModelStatus={(s, online) => {
            model.setStatus(s);
            model.setOnline(online);
          }}
          pushMessage={pushMessage}
          persistChat={persistChat}
          workspace={workspace}
          onFilesChanged={() => setTreeVersion((v) => v + 1)}
          onOpenFile={openFileAndCloseDrawer}
          reviewChange={reviewChange}
          provider={model.provider}
          usageModel={
            model.provider === "cloud"
              ? model.geminiModel
              : model.provider === "ollama"
                ? model.ollamaModel
                : ""
          }
          t={t}
          lang={lang}
        />
      </div>

      {editorPath ? (
        <FileEditor
          path={editorPath}
          onClose={() => closeEditor(false)}
          onSaved={() => setTreeVersion((v) => v + 1)}
          workspace={workspace}
          sessionRef={model.sessionRef}
          busyRef={model.busyRef}
          pushMessage={pushMessage}
          appendInput={(text) => {
            appendInput(text);
            closeEditor(true);
          }}
          readInput={readInput}
          persistChat={persistChat}
          t={t}
        />
      ) : null}

      {onboardOpen ? (
        <Onboarding
          t={t}
          lang={lang}
          setLang={setLang}
          folderChosen={workspace.connected}
          folderName={workspace.rootName}
          folderSupported={workspace.supported}
          folderError={workspace.error}
          onPickFolder={handleOnboardPickFolder}
          onTryTask={handleOnboardTryTask}
          onDone={closeOnboard}
          onSkip={closeOnboard}
        />
      ) : null}

      {review ? (
        <ReviewCard
          key={`${review.kind}:${review.path}`}
          review={review}
          t={t}
          onSettle={settleReview}
        />
      ) : null}
    </>
  );
}
