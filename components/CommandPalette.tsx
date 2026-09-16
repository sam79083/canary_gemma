"use client";

import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { displayTitle } from "@/lib/sessions-local";
import type { SessionHit, SessionInfo } from "@/lib/types";
import type { TFn } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SessionInfo[];
  currentFile: string | null;
  onPickChat: (filename: string) => void;
  onNewChat: () => void;
  onSaveChat: () => void;
  canSave: boolean;
  loggedIn: boolean;
  user: string | null;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  /** Keyword search across saved messages (debounced by the palette). */
  searchContents: (q: string) => Promise<SessionHit[]>;
  t: TFn;
}

function fmtWhen(ts: number): string {
  if (!ts) return "?";
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Ctrl+K quick switcher: chats + core actions. Plain Command in our own
 * overlay (documented cmdk attributes only, styled in globals.css). */
export default function CommandPalette({
  open,
  onOpenChange,
  sessions,
  currentFile,
  onPickChat,
  onNewChat,
  onSaveChat,
  canSave,
  loggedIn,
  user,
  onLoginClick,
  onLogoutClick,
  searchContents,
  t,
}: Props) {
  const close = () => onOpenChange(false);
  const shown = sessions.filter((s) => s.filename && s.filename.trim());
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SessionHit[]>([]);
  const searchRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
  }, [open ]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const id = ++searchRef.current;
    const timer = setTimeout(() => {
      void searchContents(q)
        .then((r) => {
          if (searchRef.current === id) setHits(r);
        })
        .catch(() => {
          if (searchRef.current === id) setHits([]);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchContents, open]);
  if (!open) return null;

  return (
    <div
      className="review-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="review-card cmdk-panel">
        <Command
          label={t("cmSearch")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
            e.stopPropagation();
          }}
        >
          <Command.Input placeholder={t("cmSearch")} onValueChange={setQuery} />
          <Command.List>
            <Command.Empty>{t("pgNoPastChats")}</Command.Empty>
            {shown.length > 0 ? (
              <Command.Group heading={t("cmChats")}>
                {shown.map((s) => {
                  const title = displayTitle(s).trim() || s.filename;
                  return (
                    <Command.Item
                      key={s.filename}
                      value={s.filename}
                      keywords={[title]}
                      onSelect={(v) => {
                        onPickChat(String(v));
                        close();
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: s.filename === currentFile ? 700 : 400,
                        }}
                      >
                        {s.filename === currentFile ? "● " : "○ "}
                        {title}
                      </span>
                      <span className="cmdk-item-meta">{fmtWhen(s.timestamp)}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ) : null}
            {hits.length > 0 ? (
              <Command.Group heading={t("cmContent")}>
                {hits.map((h) => (
                  <Command.Item
                    key={`hit-${h.filename}`}
                    value={`hit-${h.filename}`}
                    keywords={[h.title, h.snippet]}
                    onSelect={() => {
                      onPickChat(h.filename);
                      close();
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: h.filename === currentFile ? 700 : 400,
                        }}
                      >
                        {h.filename === currentFile ? "● " : "○ "}
                        {h.title}
                      </span>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 11,
                          opacity: 0.65,
                        }}
                      >
                        {h.snippet}
                      </span>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            <Command.Group heading={t("cmActions")}>
              <Command.Item
                value="__new_chat__"
                keywords={[t("pgNewChat")]}
                onSelect={() => {
                  onNewChat();
                  close();
                }}
              >
                {t("pgNewChat")}
              </Command.Item>
              {canSave ? (
                <Command.Item
                  value="__save_chat__"
                  keywords={[t("svSave")]}
                  onSelect={() => {
                    onSaveChat();
                    close();
                  }}
                >
                  {t("svSave")}
                </Command.Item>
              ) : null}
              {loggedIn ? (
                <Command.Item
                  value="__logout__"
                  keywords={[t("lgLogout"), user ?? ""]}
                  onSelect={() => {
                    onLogoutClick();
                    close();
                  }}
                >
                  {t("lgLogout")} ({user})
                </Command.Item>
              ) : (
                <Command.Item
                  value="__login__"
                  keywords={[t("lgLogin")]}
                  onSelect={() => {
                    onLoginClick();
                    close();
                  }}
                >
                  {t("lgLogin")}
                </Command.Item>
              )}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
