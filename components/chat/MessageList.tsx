"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { motion } from "motion/react";
import { triggerDownload } from "@/lib/api";
import { renderMarkdown, stripLeakedToolText } from "@/lib/markdown";
import type { ChatMessage } from "@/lib/types";
import type { TFn } from "@/lib/i18n";

/** Message bubbles + right-click menu + live stream block. */
export default function MessageList({
  messages,
  streamText,
  rawIdx,
  setRawIdx,
  copiedIdx,
  streaming,
  modelReady,
  workspaceConnected,
  t,
  shareMsg,
  copyText,
  handleReroll,
  handleRegen,
  deleteMessage,
  saveMessageAsFile,
  setInput,
  inputRef,
  onOpenFile,
  onOpenCanvas,
}: {
  messages: ChatMessage[];
  streamText: string | null;
  rawIdx: number | null;
  setRawIdx: React.Dispatch<React.SetStateAction<number | null>>;
  copiedIdx: number | null;
  streaming: boolean;
  modelReady: boolean;
  workspaceConnected: boolean;
  t: TFn;
  shareMsg: (text: string, idx: number) => void;
  copyText: (text: string, idx: number) => void;
  handleReroll: (img: NonNullable<ChatMessage["image"]>) => void;
  handleRegen: () => void;
  deleteMessage: (idx: number) => void;
  saveMessageAsFile: (idx: number) => void;
  setInput: (v: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onOpenFile: (path: string) => void;
  /** 🧪 PROTOTYPE (exp/canvas): open the canvas panel for a message. */
  onOpenCanvas?: (idx: number) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Chat bubble context menu (right-click). */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

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
  const onCodeCopy = useCallback((e: React.MouseEvent) => {
    const el = e.target as HTMLElement | null;
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

  return (
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
              <pre className="content" style={{ fontSize: 12 }}>{stripLeakedToolText(m.content)}</pre>
            ) : (
            <div
              className="content md"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(stripLeakedToolText(m.content), t("mdCopy")) }}
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
                  {!workspaceConnected ? (
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
          {/* 🧪 PROTOTYPE (exp/canvas): canvas button on every AI answer */}
          {m.role === "assistant" && onOpenCanvas ? (
            <button
              className="msg-share"
              title="Open in canvas (prototype)"
              onClick={() => onOpenCanvas(i)}
            >
              🎨
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
  );
}
