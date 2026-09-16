"use client";

import { useEffect, useRef, useState } from "react";
import type { TFn } from "@/lib/i18n";

interface Props {
  open: boolean;
  saving: boolean;
  onSaveKey: (key: string) => void;
  onLoginClick: () => void;
  onClose: () => void;
  t: TFn;
}

/**
 * Trial-budget-exhausted popup. Same plain-element modal pattern as
 * LoginDialog: card is a child of the dim layer, Esc/cancel dismisses.
 */
export default function TrialOverDialog({ open, saving, onSaveKey, onLoginClick, onClose, t }: Props) {
  const [key, setKey] = useState("");
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setKey("");
      const tmr = setTimeout(() => keyRef.current?.focus(), 30);
      return () => clearTimeout(tmr);
    }
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    if (!key.trim() || saving) return;
    onSaveKey(key.trim());
  };

  return (
    <div
      className="review-overlay"
      id="trialover-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("trOverTitle")}
    >
      <div className="review-card" style={{ maxWidth: 340, padding: "24px 24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--status-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            🔑
          </span>
          <span>
            <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>
              {t("trOverTitle")}
            </span>
            <span style={{ display: "block", fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              {t("trOverDesc")}
            </span>
          </span>
        </div>
        <div style={{ fontSize: 12, margin: "10px 0" }}>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            {t("pgGeminiGetKey")}
          </a>
        </div>
        <input
          ref={keyRef}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "var(--border)",
            borderRadius: 6,
            padding: "9px 12px",
            fontSize: 14,
            fontFamily: "inherit",
            background: "var(--input-bg)",
            color: "var(--text)",
            outline: "none",
            cursor: "text",
            marginBottom: 10,
          }}
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            e.stopPropagation();
          }}
          placeholder={t("pgGeminiKeyPh")}
        />
        <button
          className="editor-btn primary"
          style={{ width: "100%", justifyContent: "center", padding: "9px 12px" }}
          onClick={submit}
          disabled={saving || !key.trim()}
        >
          {saving ? "⏳" : t("trOverSave")}
        </button>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
          <button
            className="quota-refresh"
            style={{ fontSize: 12 }}
            onClick={() => {
              onClose();
              onLoginClick();
            }}
            disabled={saving}
          >
            {t("trOverLoginBtn")}
          </button>
          <button
            className="quota-refresh"
            style={{ fontSize: 12 }}
            onClick={onClose}
            disabled={saving}
          >
            {t("lgCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
