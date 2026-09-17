"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TFn } from "@/lib/i18n";

interface Props {
  open: boolean;
  checking: boolean;
  error: string | null;
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
export default function LoginDialog({ open, checking, error, onClose, t }: Props) {
  const [focused, setFocused] = useState<string | null>(null);

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
      <div className="review-card" style={{ maxWidth: 320, padding: "24px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>
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
          {/* Google OAuth is handled by the parent Supabase setup. */}
          <div style={{ textAlign: "center", marginBottom: 12, color: "var(--muted)", fontSize: 12 }}>
            Continue with Google via Supabase
          </div>
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
            style={{
              width: "100%",
              fontSize: 12,
              padding: "8px 0",
            }}
          >
            {t("lgCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}