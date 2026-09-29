// Fullscreen big-text reader for elders: large type, adjustable size,
// read-aloud control, prev/next through assistant answers.
"use client";

import { useEffect, useState } from "react";
import { renderMarkdown, stripLeakedToolText } from "@/lib/markdown";
import type { TFn } from "@/lib/i18n";

const FONT_KEY = "canary-reader-font";
const FONT_MIN = 18;
const FONT_MAX = 48;
const FONT_STEP = 2;
const FONT_DEFAULT = 26;

export default function ReaderOverlay({
  text,
  title,
  t,
  speaking,
  onSpeak,
  onClose,
  onPrev,
  onNext,
}: {
  text: string;
  title: string;
  t: TFn;
  speaking: boolean;
  onSpeak: () => void;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const [fontSize, setFontSize] = useState(FONT_DEFAULT);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(FONT_KEY));
      if (Number.isFinite(v)) {
        setFontSize(Math.min(FONT_MAX, Math.max(FONT_MIN, v)));
      }
    } catch {
      // keep default
    }
  }, []);

  const setFont = (n: number) => {
    const v = Math.min(FONT_MAX, Math.max(FONT_MIN, n));
    setFontSize(v);
    try {
      localStorage.setItem(FONT_KEY, String(v));
    } catch {
      // ignore
    }
  };

  // Escape closes (but not while typing — overlay has no inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const btn: React.CSSProperties = {
    border: "1px solid var(--border)",
    background: "var(--model-bar-bg)",
    color: "var(--text)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 16,
    cursor: "pointer",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        <button type="button" title={t("rdTextSize")} onClick={() => setFont(fontSize - FONT_STEP)} disabled={fontSize <= FONT_MIN} style={btn}>
          A−
        </button>
        <button type="button" title={t("rdTextSize")} onClick={() => setFont(fontSize + FONT_STEP)} disabled={fontSize >= FONT_MAX} style={btn}>
          A+
        </button>
        <button type="button" title={speaking ? t("rdStop") : t("rdListen")} onClick={onSpeak} style={btn}>
          {speaking ? "⏹" : "🔊"}
        </button>
        <button type="button" title={t("chDismiss")} onClick={onClose} style={btn}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px 40px" }}>
        <div
          className="content md"
          style={{ fontSize, lineHeight: 1.8, maxWidth: 720, margin: "0 auto" }}
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(stripLeakedToolText(text), t("mdCopy")),
          }}
        />
      </div>
      {onPrev || onNext ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button type="button" onClick={() => onPrev?.()} disabled={!onPrev} style={{ ...btn, flex: 1 }}>
            ←
          </button>
          <button type="button" onClick={() => onNext?.()} disabled={!onNext} style={{ ...btn, flex: 1 }}>
            →
          </button>
        </div>
      ) : null}
    </div>
  );
}
