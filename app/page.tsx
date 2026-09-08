"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Chat from "@/components/Chat";
import FileEditor from "@/components/FileEditor";
import FileTree from "@/components/FileTree";
import { useLanguageModel } from "@/hooks/useLanguageModel";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  listLocalSessions,
  loadLocalSession,
  saveLocalSession,
} from "@/lib/sessions-local";
import type { ChatMessage, SessionInfo } from "@/lib/types";

const HISTORY_KEY = "gemma4-chat-history";
const THEME_KEY = "theme";

function titleFor(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  const text = first.content.slice(0, 50);
  return text.length >= 50 ? text + "…" : text;
}

export default function Home() {
  const model = useLanguageModel();
  const workspace = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [dark, setDark] = useState(false);
  const [sessionList, setSessionList] = useState<SessionInfo[]>([]);
  const [editorPath, setEditorPath] = useState<string | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);

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
    void saveLocalSession(titleFor(msgs), msgs, existing)
      .then((filename) => {
        currentSessionFileRef.current = filename;
        // Refresh the dropdown so the new/updated session shows immediately.
        void listLocalSessions()
          .then(setSessionList)
          .catch((e) => console.error("Failed to load sessions:", e));
      })
      .catch((e) => console.error("Auto-save session failed:", e));
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      setSessionList(await listLocalSessions());
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }
  }, []);

  // Startup: history + model session
  useEffect(() => {
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
        // auto-create here — the "Enable Gemma 4" button in the sidebar does it.
        setMessages(stored);
        hydratedRef.current = true;
        return;
      }
      if (stored.length > 0) {
        if (confirm(`Found a previous conversation (${stored.length} messages). Restore it?`)) {
          setMessages(stored);
          hydratedRef.current = true;
          await model.restoreSession(stored);
        } else {
          localStorage.removeItem(HISTORY_KEY);
          setMessages([]);
          hydratedRef.current = true;
          await model.createSession();
        }
      } else {
        hydratedRef.current = true;
        await model.createSession();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewChat = useCallback(() => {
    model.destroy();
    localStorage.removeItem(HISTORY_KEY);
    currentSessionFileRef.current = null;
    setMessages([]);
    void model.supported().then((avail) => {
      // Clicking "New chat" counts as the user gesture, so creating is allowed
      // even when the model still needs downloading.
      if (avail !== "unavailable" && avail !== "unsupported")
        void model.createSession();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadSessionFile = useCallback(
    async (filename: string) => {
      if (!filename) return;
      try {
        const msgs = await loadLocalSession(filename);
        currentSessionFileRef.current = filename;
        setMessages(msgs);
        model.destroy();
        await model.restoreSession(msgs);
      } catch (e) {
        console.error("Failed to load session:", e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

  return (
    <>
      {model.download.show ? (
        <div id="download-overlay" className="download-overlay">
          <div className="download-card">
            <h3>Downloading Gemma 4</h3>
            <p id="download-status">{model.download.label || "Preparing model download…"}</p>
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

      <div className="sidebar">
        <div className="model-header">
          <span
            className="dot"
            id="model-dot"
            style={{ background: model.online ? "#2e7d32" : "#ccc" }}
          />
          Gemma 4 (on-device)
        </div>

        {!model.ready &&
        (model.availability === "downloading" ||
          model.availability === "downloadable") ? (
          <button
            className="sidebar-btn"
            id="enable-model-btn"
            onClick={() => void model.createSession()}
          >
            ⬇ Enable Gemma 4
          </button>
        ) : null}

        <button className="sidebar-btn" id="new-chat-btn" onClick={handleNewChat} disabled={!model.ready}>
          + New chat
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
            {sessionList.length > 0 ? "💬 Load session…" : "No saved sessions"}
          </option>
          {sessionList.map((s) => (
            <option key={s.filename} value={s.filename}>
              {s.title} ({new Date(s.timestamp).toLocaleString()})
            </option>
          ))}
        </select>

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
                    Change
                  </button>
                  <button
                    className="sidebar-btn small"
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
                📂 Set workspace
              </button>
            )
          ) : (
            <div className="workspace-unsupported">
              Local workspace not supported — using server files.
            </div>
          )}
          {workspace.error ? (
            <div className="workspace-error">{workspace.error}</div>
          ) : null}
          {workspace.supported && !workspace.connected ? (
            <div className="workspace-hint">
              Files stay on this PC — nothing is uploaded to Render.
            </div>
          ) : null}
        </div>

        <FileTree
          onOpenFile={setEditorPath}
          version={treeVersion}
          onMutated={() => setTreeVersion((v) => v + 1)}
          workspace={workspace}
        />

        <div className="note">
          Requires Chrome 148+ or Chrome Canary with Gemma 4 built-in AI flags enabled.
        </div>
        <div className="status" id="sidebar-status">
          {model.status}
        </div>
      </div>

      <div className="main">
        <div className="model-bar">
          <span className="gemma-badge">Gemma 4</span>
          <span id="model-status">{model.status}</span>
          <button
            className="theme-toggle"
            title="Toggle dark/light mode"
            onClick={() => {
              setDark((d) => {
                localStorage.setItem(THEME_KEY, d ? "light" : "dark");
                return !d;
              });
            }}
          >
            {dark ? "☀️" : "🌙"}
          </button>
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
        />
      ) : null}
    </>
  );
}
