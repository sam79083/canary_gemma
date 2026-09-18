"use client";

import { useRef, useState, type RefObject } from "react";
import Tip from "@/components/Tip";
import { HF_DRAW_LABEL } from "@/lib/cloud-model";
import type { Provider } from "@/hooks/useLanguageModel";
import type { TFn } from "@/lib/i18n";
import type { AttachedPhoto } from "./useAttachments";

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
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const STARTERS = [
    { label: t("chSt1L"), prompt: t("chSt1P") },
    { label: t("chSt2L"), prompt: t("chSt2P") },
    { label: t("chSt3L"), prompt: t("chSt3P") },
  ];

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
                ✕
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
      {emptyChat && modelReady && !streaming ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {agentMode ? (
            <button
              className="send-btn secondary"
              style={{ width: "auto", borderRadius: 16, padding: "6px 12px", fontSize: 12, height: "auto", fontWeight: 700 }}
              onClick={() => onRunPrompt(t("chDemoP"))}
              title={t("chDemoP")}
            >
              {t("chDemoL")}
            </button>
          ) : null}
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
            📎
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
              {listening ? "⏺" : "🎤"}
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Tip label={t("chLooking")}>
          <button
            className="send-btn secondary"
            onClick={() => void handleSearch()}
            disabled={searchDisabled}
            title={t("chLooking")}
          >
          {streaming ? (
            "⏳"
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.7z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.5 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.5-2.7-.1.1C.5 8.9 0 10.4 0 12s.5 3.1 1.5 4.5l3.7-2.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.9l3.7 2.8c1-2.9 3.7-5 6.8-5z"
              />
            </svg>
          )}
        </button>
        </Tip>
        <Tip label={t("cfHFDraw")}>
          <button
            className="send-btn secondary"
            onClick={() => void handleDraw()}
            disabled={streaming || !input.trim()}
            title={t("cfHFDraw")}
          >
            🖼️
          </button>
        </Tip>
          {streaming ? (
            <button className="send-btn" onClick={() => onStop()} title={t("chStopped")}>
              ⏹
            </button>
          ) : (
            <button className="send-btn" onClick={() => void handleSend()} disabled={sendDisabled}>
              ➤
            </button>
          )}
          <Tip label={t("hpTitle")}>
            <button
              className="send-btn secondary"
              onClick={() => onHelp()}
              disabled={streaming}
              title={t("hpTitle")}
            >
              ?
            </button>
          </Tip>
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
          ↻
        </button>
      </div>
    </div>
  );
}


