"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TFn } from "@/lib/i18n";

interface Props {
  open: boolean;
  checking: boolean;
  error: string | null;
  onGoogleLogin: () => Promise<boolean>;
  onClose: () => void;
  t: TFn;
}

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--status-text)",
  marginBottom: 10,
};

const fieldInput: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
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
};

/**
 * Member login popup with full-width cancel area.
 * The card is a child of the dim layer, so no stacking games are possible.
 * Backdrop clicks never dismiss (credentials must survive); Esc and Cancel do.
 */
export default function LoginDialog({ open, checking, error, onGoogleLogin, onClose, t }: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const googleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setFocused(null);
      const tmr = setTimeout(() => {
        const inp = document.activeElement as HTMLInputElement | null;
        inp?.blur?.();
      }, 30);
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

  return (
    <div
      className="review-overlay"
      id="login-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("lgTitle")}
    >
      <div className="review-card" style={{ maxWidth: 320, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginRight: 8 }}>
            🔑
          </span>
          <span>
            <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>
              {t("lgTitle")}
            </span>
            <span style={{ display: "block", fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              {t("lgHint")}
            </span>
          </span>
        </div>

        <div style={{ marginBottom: 20 }}>
          <button
            ref={googleRef}
            className="editor-btn primary"
            style={{ width: "100%", justifyContent: "center", padding: "12px" }}
            onClick={() => {
              void onGoogleLogin().then((ok) => {
                if (ok) onClose();
              });
            }}
            disabled={checking}
          >
            {checking ? "⏳" : t("lgGoogle")}
          </button>
          {error ? (
            <div className="workspace-error" style={{ marginTop: 10 }}>
              {error === "member-full" ? t("lgFull") : error}
            </div>
          ) : null}
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: 8,
            cursor: "pointer",
          }}
          onClick={onClose}
        >
          <button
            className="quota-refresh"
            style={{ width: "100%", fontSize: 12, padding: "8px 0px" }}
          >
            {t("lgCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}