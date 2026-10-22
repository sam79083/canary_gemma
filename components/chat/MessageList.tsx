"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Dices,
  Download,
  FileText,
  Pencil,
  RotateCcw,
  Share2,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { triggerDownload } from "@/lib/api";
import { renderMarkdown, stripLeakedToolText } from "@/lib/markdown";
import { highlightHtml, type HighlightHit, type SearchHit } from "@/lib/search";
import type { ChatMessage } from "@/lib/types";
import type { TFn } from "@/lib/i18n";
import { extractExamples, parseRoleplayReply } from "@/lib/learn-roleplay";

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
  onSpeak,
  speakingIdx,
  speechSupported,
  onOpenReader,
  searchOpen = false,
  searchHits = [],
  activeHitIndex = -1,
  onUseExample,
  roleplayActive = false,
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
  /** Read-aloud + fullscreen reader (elder-friendly). All optional. */
  onSpeak?: (idx: number) => void;
  speakingIdx?: number | null;
  speechSupported?: boolean;
  onOpenReader?: (idx: number) => void;
  /** In-conversation search (flat match list + which match is active). */
  searchOpen?: boolean;
  searchHits?: SearchHit[];
  activeHitIndex?: number;
  /** One-tap roleplay replies: parsed from the suggestion layer. */
  onUseExample?: (text: string) => void;
  /** A roleplay scene is active — split replies into Fix / Reply / chips. */
  roleplayActive?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Chat bubble context menu (right-click / long-press). */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);
  /** Long-press timer for touch devices (opens the same menu). */
  const touchRef = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  /** Element that triggered the context menu (for focus return). */
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  /** Ref to the context menu container. */
  const menuRef = useRef<HTMLDivElement>(null);

  // The scroll container: auto-scroll only while the user is already pinned
  // to/near the bottom, so reading history isn't yanked down mid-stream.
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.addEventListener("scroll", () => {
        // Bottom reached (±48px) => repin; scrolled up => stay unpinned.
        pinnedRef.current =
          list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      });
    }
  }, []);
  useEffect(() => {
    if (!pinnedRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

  // Group the flat search-hit list per message for quick lookup while rendering.
  const hitsByMsg = useMemo(() => {
    const map = new Map<number, HighlightHit[]>();
    searchHits.forEach((hit, globalIdx) => {
      const arr = map.get(hit.msgIdx) ?? [];
      arr.push({ start: hit.start, end: hit.end, globalIdx });
      map.set(hit.msgIdx, arr);
    });
    return map;
  }, [searchHits]);

  // Jump to the active match whenever navigation or the query changes.
  useEffect(() => {
    if (!searchOpen || activeHitIndex < 0) return;
    const active = searchHits[activeHitIndex];
    if (!active) return;
    document
      .querySelector(`.message[data-idx="${active.msgIdx}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchOpen, searchHits, activeHitIndex]);

  /** Plain-text highlight for user bubbles (React nodes, no HTML injection). */
  const renderHighlightedText = useCallback(
    (text: string, hits: HighlightHit[]): ReactNode => {
      if (hits.length === 0) return text;
      const sorted = [...hits].sort((a, b) => a.start - b.start || a.end - b.end);
      const parts: ReactNode[] = [];
      let cursor = 0;
      for (const h of sorted) {
        if (h.start < cursor || h.start >= h.end) continue;
        if (h.start > cursor) parts.push(text.slice(cursor, h.start));
        parts.push(
          <span
            key={h.globalIdx}
            className={
              h.globalIdx === activeHitIndex ? "search-match search-match-active" : "search-match"
            }
          >
            {text.slice(h.start, h.end)}
          </span>,
        );
        cursor = h.end;
      }
      parts.push(text.slice(cursor));
      return parts;
    },
    [activeHitIndex],
  );

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
      menuTriggerRef.current = bubble;
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

  // Focus first menu item when menu opens.
  useEffect(() => {
    if (ctxMenu && menuRef.current) {
      const firstItem = menuRef.current.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    }
  }, [ctxMenu]);

  // Return focus to trigger element when menu closes.
  useEffect(() => {
    if (!ctxMenu && menuTriggerRef.current) {
      menuTriggerRef.current.focus();
      menuTriggerRef.current = null;
    }
  }, [ctxMenu]);

  // Keyboard navigation for the context menu.
  const onMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!menuRef.current) return;
    const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        items[currentIndex < items.length - 1 ? currentIndex + 1 : 0].focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        items[currentIndex > 0 ? currentIndex - 1 : items.length - 1].focus();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (currentIndex >= 0) items[currentIndex].click();
        break;
      case "Escape":
        e.preventDefault();
        setCtxMenu(null);
        break;
    }
  }, []);

  /** Long-press on a bubble (touch): same menu as right-click. */
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!onOpenReader) return;
      const touch = e.touches[0];
      if (!touch) return;
      const el = e.target as HTMLElement | null;
      const bubble = el?.closest?.(".message[data-idx]") as HTMLElement | null;
      if (!bubble) return;
      const idx = Number(bubble.getAttribute("data-idx"));
      if (!Number.isInteger(idx) || !messages[idx]) return;
      const x = touch.clientX;
      const y = touch.clientY;
      const timer = setTimeout(() => {
        try {
          (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(30);
        } catch {
          // ignore
        }
        menuTriggerRef.current = bubble;
        setCtxMenu({
          x: Math.min(x, window.innerWidth - 200),
          y: Math.min(y, window.innerHeight - 260),
          idx,
        });
      }, 550);
      touchRef.current = { x, y, timer };
    },
    [messages, onOpenReader],
  );
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const cur = touchRef.current;
    if (!cur) return;
    const touch = e.touches[0];
    if (!touch) return;
    // Finger slid (scrolling) — not a press.
    if (Math.abs(touch.clientX - cur.x) + Math.abs(touch.clientY - cur.y) > 12) {
      clearTimeout(cur.timer);
      touchRef.current = null;
    }
  }, []);
  const cancelTouch = useCallback(() => {
    if (touchRef.current) {
      clearTimeout(touchRef.current.timer);
      touchRef.current = null;
    }
  }, []);

  // One-time welcome banner (dismissible; remembered via localStorage).
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("canary-welcomed")) setWelcomeVisible(true);
    } catch {
      setWelcomeVisible(true);
    }
  }, []);
  const dismissWelcome = useCallback(() => {
    try {
      localStorage.setItem("canary-welcomed", "1");
    } catch {
      // ignore
    }
    setWelcomeVisible(false);
  }, []);

  const emptyChat = messages.length === 0 && streamText === null;
  const showWelcome = welcomeVisible && messages.length === 0 && modelReady;

  const STARTERS = [
    { label: t("chSt1L"), prompt: t("chSt1P") },
    { label: t("chSt2L"), prompt: t("chSt2P") },
    { label: t("chSt3L"), prompt: t("chSt3P") },
  ];

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
      ref={listRef}
      className={`messages${emptyChat ? " messages-empty" : ""}`}
      id="messages"
      onClick={onCodeCopy}
      onContextMenu={onBubbleMenu}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={cancelTouch}
      onTouchCancel={cancelTouch}
    >
      {showWelcome ? (
        <div className="welcome-banner" id="welcome-banner">
          <span>{t("chWelcome")}</span>
          <button className="welcome-close" onClick={dismissWelcome} aria-label="Dismiss">
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {messages.map((m, i) => {
        // Roleplay layer split (💡 Fix / ▶️ Reply / 💬 Try saying). Only for
        // assistant messages while a scene is active and not in raw/search
        // view — ordinary chat is left untouched. Pure parse, no hooks.
        const rp =
          m.role === "assistant" && roleplayActive && !searchOpen && rawIdx !== i
            ? parseRoleplayReply(stripLeakedToolText(m.content))
            : null;
        const rpLayers = rp?.layered ? rp : null;
        return (
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
            <div className="msg-body">
              {rawIdx === i ? (
                <pre className="content" style={{ fontSize: 12 }}>{stripLeakedToolText(m.content)}</pre>
              ) : rpLayers ? (
                <>
                  {rpLayers.fix ? (
                    <div className="rp-fix">
                      <span className="rp-fix-label">💡 Fix</span>
                      <span>{rpLayers.fix}</span>
                    </div>
                  ) : null}
                   <div
                     className="content md"
                     dangerouslySetInnerHTML={{ __html: renderMarkdown(rpLayers.reply, t("mdCopy")) }}
                   />
                   {rpLayers.vocab && rpLayers.vocab.length > 0 ? (
                     <div className="rp-fix" style={{ marginTop: 4 }}>
                       <span className="rp-fix-label">📚 Vocab</span>
                       <span>{rpLayers.vocab.map((v) => `"${v}"`).join(" · ")}</span>
                     </div>
                   ) : null}
                 </>
              ) : (
                <div
                  className="content md"
                  dangerouslySetInnerHTML={{
                    __html:
                      searchOpen && hitsByMsg.get(i)?.length
                        ? highlightHtml(
                            renderMarkdown(stripLeakedToolText(m.content), t("mdCopy")),
                            hitsByMsg.get(i) ?? [],
                            activeHitIndex,
                          )
                        : renderMarkdown(stripLeakedToolText(m.content), t("mdCopy")),
                  }}
                />
              )}
              {onUseExample
                ? (() => {
                    // Suggestion layer → tappable send chips (beginners tap
                    // instead of retyping). Reuses the parse above so the
                    // chips never duplicate text shown in the bubble.
                    const ex = rpLayers ? rpLayers.examples : extractExamples(m.content);
                    if (ex.length === 0) return null;
                    const send = onUseExample;
                    return (
                      <div className="rp-say">
                        <span className="rp-say-label">💬 {t("rpTrySaying")}</span>
                        {ex.map((e) => (
                          <button
                            key={e}
                            className="task-chip"
                            disabled={streaming}
                            title={`Say "${e}"`}
                            onClick={() => send(e)}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    );
                  })()
                : null}
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
                  <Dices size={13} aria-hidden="true" /> {t("cfReroll")}
                </button>
              ) : null}
            </>
          ) : null}
          {m.files && m.files.length > 0 ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {m.files.map((f) => (
                <span key={f.path} className="task-chip" title={f.path}>
                  <FileText size={13} aria-hidden="true" /> {f.name.length > 24 ? f.name.slice(0, 24) + "…" : f.name}{" "}
                  {!workspaceConnected ? (
                    <button
                      className="quota-refresh"
                      title={t("dlTitle")}
                      onClick={() => triggerDownload(f.name)}
                    >
                      <Download size={13} aria-hidden="true" />
                    </button>
                  ) : null}{" "}
                  <button
                    className="quota-refresh"
                    title={t("trEdit")}
                    onClick={() => onOpenFile(f.path)}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
            </div>
          ) : (
            <div className="content">
              {searchOpen
                ? renderHighlightedText(m.content, hitsByMsg.get(i) ?? [])
                : m.content}
            </div>
          )}
          {m.role === "assistant" ? (
            <button
              className="msg-share"
              title={t("shShare")}
              onClick={() => void shareMsg(m.content, i)}
            >
              {copiedIdx === i ? "✓" : <Share2 size={14} aria-hidden="true" />}
            </button>
          ) : null}
          {m.role === "assistant" &&
          typeof m.content === "string" &&
          m.content.startsWith("🏆") &&
          m.content.includes("cleared!") ? (
            <button
              className="msg-share"
              title="Copy scorecard to share"
              onClick={() => {
                let link = "";
                try {
                  link = `${window.location.origin}${window.location.pathname}`;
                } catch {
                  link = "";
                }
                void shareMsg(
                  `${m.content}\n\n— practiced with Coco 🎭 English Roleplay${link ? ` — try it: ${link}?demo=cafe` : ""}`,
                  i,
                );
              }}
            >
              {copiedIdx === i ? "✓" : "📤"}
            </button>
          ) : null}
          {m.role === "assistant" && onSpeak && speechSupported ? (
            <button
              className="msg-share"
              title={speakingIdx === i ? t("rdStop") : t("rdListen")}
              onClick={() => onSpeak(i)}
            >
              {speakingIdx === i ? <Square size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
            </button>
          ) : null}
          {m.role === "assistant" && i === messages.length - 1 ? (
            <button
              className="msg-share"
              title={t("chRegen")}
              disabled={streaming || !modelReady}
              onClick={() => handleRegen()}
            >
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          ) : null}
        </motion.div>
        );
      })}
      {emptyChat ? (
        <div className="empty-state">
          <div className="empty-state-title">{t("chEmptyTitle")}</div>
          <div className="empty-state-hint">
            {t("chEmptyHint")}
          </div>
          <div className="empty-state-starters">
            {STARTERS.map((s) => (
              <button
                key={s.label}
                className="task-chip"
                onClick={() => {
                  setInput(s.prompt);
                  inputRef.current?.focus();
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {ctxMenu && messages[ctxMenu.idx] ? (
        <div
          id="chat-context-menu"
          ref={menuRef}
          role="menu"
          aria-label="Message actions"
          className="context-menu"
          style={{
            position: "fixed",
            left: ctxMenu.x,
            top: ctxMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={onMenuKeyDown}
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
                    ...(onOpenReader
                      ? [
                          {
                            label: `⛶ ${t("rdFullscreen")}`,
                            run: () => onOpenReader(ctxMenu.idx),
                          },
                        ]
                      : []),
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
              role="menuitem"
              tabIndex={0}
              className="context-menu-item"
              onClick={() => {
                setCtxMenu(null);
                item.run();
              }}
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
