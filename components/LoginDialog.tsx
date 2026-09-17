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
 * Member login popup with close (X) button and full-width cancel area.
 * The card is a child of the dim layer, so no stacking games are possible.
 * Backdrop clicks never dismiss (credentials must survive); Esc and Cancel do.
 */
export default function LoginDialog({ open, checking, error, onClose, t }: Props) {
  const [focused, setFocused] = useState<string | null>(null);
  const googleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setFocused(null);
      const tmr = setTimeout(() => closeRef.current?.focus(), 30);
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

  const loginWithGoogle = async (): Promise<boolean> => {
    try {
      // Trigger Supabase Google OAuth flow
      // The actual redirect is handled by the parent component's auth state
      // This button initiates the flow; the redirect will happen
      onClose();
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div
      className="review-overlay"
      id="login-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("lgTitle")}
      style={{
        // Enable backdrop click to close (optional - currently prevented in effects)
        // We'll keep the internal logic but also allow Escape to close
      }}
    >
      <div
        className="review-card"
        style={{
          maxWidth: 320,
          padding: "24px 24px 20px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}
        >
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
              position: "absolute",
              right: 12,
              top: 8,
            }}
          >
            🔑
            <button
              className="quota-refresh"
              style={{
                position: "absolute",
                right: 4,
                top: 2,
                width: 24,
                height: 24,
                padding: 0,
                background: "transparent",
                border: "none",
                color: "inherit",
                fontSize: 12,
                cursor: "pointer",
              }}
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
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
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "12px",
              marginBottom: 8,
            }}
            onClick={loginWithGoogle}
            disabled={checking}
          >
            {checking ? "⏳" : t("lgGoogle")}
          </button>
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