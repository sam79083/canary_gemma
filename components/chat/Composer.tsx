"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  ArrowUp,
  CircleHelp,
  Ellipsis,
  ImagePlus,
  Mic,
  Paperclip,
  RotateCcw,
  Search,
  Square,
  X,
} from "lucide-react";
import Tip from "@/components/Tip";
import { HF_DRAW_LABEL } from "@/lib/cloud-model";
import type { Provider } from "@/hooks/useLanguageModel";
import type { TFn } from "@/lib/i18n";
import type { AttachedPhoto } from "./useAttachments";
import { SCENARIOS } from "@/lib/learn-roleplay";

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

/** Prompt box + tool buttons + quota line. */
export default function Composer({
  input,
  setInput,
  streaming,
  modelReady,
  inputRef,
  photos,
  setPhotos,
  speechOK,
  listening,
  toggleVoice,
  agentMode,
  setAgentMode,
  quota,
  quotaLow,
  loadQuota,
  provider,
  tokens,
  draws,
  emptyChat,
  undoCount,
  undoLabel,
  onUndo,
  workspaceConnected,
  workspaceSupported,
  t,
  handleFiles,
  handleSend,
  handleSearch,
  handleDraw,
  onStop,
  onRunPrompt,
  onHelp,
  planMode,
  setPlanMode,
  practiceOn,
  setPracticeOn,
  practiceTargets,
  practiceUsed,
  onRemoveTarget,
  roleId,
  onPickScenario,
  roleGoals,
}: {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  modelReady: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  photos: AttachedPhoto[];
  setPhotos: React.Dispatch<React.SetStateAction<AttachedPhoto[]>>;
  speechOK: boolean;
  listening: boolean;
  toggleVoice: () => void;
  agentMode: boolean;
  setAgentMode: (v: boolean) => void;
  quota: string;
  quotaLow: boolean;
  loadQuota: () => void;
  provider: Provider;
  tokens: number;
  draws: number;
  emptyChat: boolean;
  undoCount: number;
  undoLabel: string | null;
  onUndo: () => void;
  workspaceConnected: boolean;
  workspaceSupported: boolean;
  t: TFn;
  handleFiles: (files: FileList | null) => void;
  handleSend: (override?: string) => void;
  handleSearch: (override?: string) => void;
  handleDraw: () => void;
  onStop: () => void;
  onRunPrompt: (prompt: string) => void;
  onHelp: () => void;
  planMode: boolean;
  setPlanMode: (v: boolean) => void;
  practiceOn: boolean;
  setPracticeOn: (v: boolean) => void;
  practiceTargets: { term: string; meaning?: string }[];
  practiceUsed: string[];
  onRemoveTarget: (term: string) => void;
  roleId: string | null;
  onPickScenario: (id: string | null) => void;
  roleGoals: { label: string; done: boolean }[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  /** Grow with the text up to ~6 rows, then scroll inside the box. */
  const autoGrow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, 148);
    el.style.height = `${capped}px`;
    el.style.overflowY = el.scrollHeight > 148 ? "auto" : "hidden";
  }, [inputRef]);

  useEffect(() => {
    autoGrow();
  }, [input, autoGrow]);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const TASKS: { label: string; prompt: string; cursorBack?: number }[] = [
    { label: t("tk1L"), prompt: t("tk1P") },
    { label: t("tk2L"), prompt: t("tk2P") },
    { label: t("tk3L"), prompt: t("tk3P") },
    { label: t("tk4L"), prompt: t("tk4P"), cursorBack: 11 },
  ];

  const sendDisabled = !modelReady || streaming || !input.trim();
  const searchDisabled = streaming || !input.trim();

  return (
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
                <X size={12} aria-hidden="true" />
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
      {practiceOn ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="task-row" title="Roleplay a scene — the AI plays a character with goals">
            <select
              className="theme-toggle"
              value={roleId ?? ""}
              onChange={(e) => onPickScenario(e.target.value || null)}
              disabled={streaming}
              style={{ cursor: "pointer", fontSize: 12 }}
              title="Roleplay scenario (empty = free practice chat)"
            >
              <option value="">🎭 Free chat</option>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
            {roleGoals.map((g) => (
              <span
                key={g.label}
                className="task-chip"
                style={g.done ? { opacity: 0.75, textDecoration: "line-through" } : undefined}
              >
                {g.done ? "✓ " : "○ "}{g.label}
              </span>
            ))}
          </div>
          <div className="task-row" title="Words you are practicing — use one in chat for +5 XP">
            {practiceTargets.length === 0 ? (
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                Add words from Learn or select text in chat 💬 — or pick a 🎭 scene above
              </span>
            ) : (
              practiceTargets.map((tg) => {
                const used = practiceUsed.includes(tg.term.toLowerCase());
                return (
                <span
                  key={tg.term}
                  className="task-chip"
                  title={tg.meaning ?? tg.term}
                  style={used ? { opacity: 0.75, textDecoration: "line-through" } : undefined}
                >
                  {used ? "✓ " : ""}{tg.term}{" "}
                  <button
                    className="quota-refresh"
                    title="Remove target"
                    onClick={() => onRemoveTarget(tg.term)}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      {emptyChat && modelReady && !streaming ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          <div className="task-row" title="English roleplay — the AI plays the scene partner and replies in character">
            <span style={{ fontSize: 12, fontWeight: 700 }}>🎭 English roleplay:</span>
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                className="task-chip"
                onClick={() => {
                  if (!practiceOn) setPracticeOn(true);
                  onPickScenario(s.id);
                  inputRef.current?.focus();
                }}
                disabled={streaming || roleId === s.id}
                title={`${s.name}: ${s.opener}`}
                style={roleId === s.id ? { opacity: 0.6 } : undefined}
              >
                {s.icon} {s.name}
              </button>
            ))}
          </div>
          {agentMode ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className="send-btn secondary"
                style={{ width: "auto", borderRadius: 16, padding: "6px 12px", fontSize: 12, height: "auto", fontWeight: 700 }}
                onClick={() => onRunPrompt(t("chDemoP"))}
                title={t("chDemoP")}
              >
                {t("chDemoL")}
              </button>
            </div>
          ) : null}
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
            <Paperclip size={16} aria-hidden="true" />
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
              {listening ? <Square size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
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
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
          {streaming ? (
            <button className="send-btn" onClick={() => onStop()} title={t("chStopped")}>
              <Square size={18} aria-hidden="true" />
            </button>
          ) : (
            <button className="send-btn" onClick={() => void handleSend()} disabled={sendDisabled}>
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          )}
          <div className="composer-more-wrap" ref={moreRef}>
            <Tip label="More options">
              <button
                className="send-btn secondary"
                onClick={() => setMoreOpen(!moreOpen)}
                title="More options"
                aria-haspopup="true"
                aria-expanded={moreOpen}
                aria-label="More options"
              >
                <Ellipsis size={16} aria-hidden="true" />
              </button>
            </Tip>
            {moreOpen ? (
              <div
                className="composer-more-menu"
                role="menu"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMoreOpen(false);
                    moreRef.current?.querySelector("button")?.focus();
                  }
                }}
              >
                <button
                  className="composer-more-item"
                  role="menuitem"
                  disabled={searchDisabled}
                  onClick={() => {
                    setMoreOpen(false);
                    void handleSearch();
                  }}
                >
                  <Search size={14} aria-hidden="true" />
                  {t("chLooking")}
                </button>
                <button
                  className="composer-more-item"
                  role="menuitem"
                  disabled={streaming || !input.trim()}
                  onClick={() => {
                    setMoreOpen(false);
                    void handleDraw();
                  }}
                >
                  <ImagePlus size={14} aria-hidden="true" /> {t("cfHFDraw")}
                </button>
                <button
                  className="composer-more-item"
                  role="menuitem"
                  disabled={streaming}
                  onClick={() => {
                    setMoreOpen(false);
                    onHelp();
                  }}
                >
                  <CircleHelp size={14} aria-hidden="true" /> {t("hpTitle")}
                </button>
              </div>
            ) : null}
          </div>
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
          <label
            title={t("plHint")}
            style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={planMode}
              onChange={(e) => {
                const on = e.target.checked;
                setPlanMode(on);
                if (on) setAgentMode(true);
              }}
              disabled={streaming}
            />
            {t("plMode")}
          </label>
          <label
            title="English roleplay: the AI plays a scene partner (barista, interviewer…) and scores your goals with XP"
            style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={practiceOn}
              onChange={(e) => setPracticeOn(e.target.checked)}
              disabled={streaming}
            />
            🎭 Roleplay
          </label>
        {!workspaceConnected && workspaceSupported ? (
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
          <RotateCcw size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}


