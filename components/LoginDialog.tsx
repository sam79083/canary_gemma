"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TFn } from "@/lib/i18n";

interface Props {
  open: boolean;
  checking: boolean;
  error: string | null;
  onLogin: (id: string, pw: string) => Promise<boolean>;
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
 * Small member-login popup. Plain elements on purpose: modal-layer
 * libraries restyle <body> behind our back (pointer-events, aria-hidden)
 * and have left this dialog visible-but-unclickable before.
 * The card is a CHILD of the dim layer, so no stacking games are possible.
 * Backdrop clicks never dismiss (typed credentials must survive); Esc and
 * Cancel do. Credentials go to /api/auth only.
 */
export default function LoginDialog({ open, checking, error, onLogin, onClose, t }: Props) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFocused(null);
      const tmr = setTimeout(() => idRef.current?.focus(), 30);
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
    if (!id.trim() || !pw || checking) return;
    void onLogin(id.trim(), pw).then((ok) => {
      if (ok) {
        setId("");
        setPw("");
        onClose();
      }
    });
  };

  const inputStyle = (name: string): CSSProperties => ({
    ...fieldInput,
    ...(focused === name
      ? {
          borderColor: "#2383e6",
          boxShadow: "rgba(35, 131, 230, 0.15) 0px 0px 0px 2px",
        }
      : null),
  });

  return (
    <div
      className="review-overlay"
      id="login-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("lgTitle")}
    >
      <div className="review-card" style={{ maxWidth: 320, padding: "24px 24px 20px" }}>
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
              {t("lgTitle")}
            </span>
            <span style={{ display: "block", fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              {t("lgHint")}
            </span>
          </span>
        </div>
        <label style={fieldLabel}>
          {t("lgId")}
          <input
            ref={idRef}
            style={inputStyle("id")}
            autoComplete="username"
            value={id}
            onChange={(e) => setId(e.target.value)}
            onFocus={() => setFocused("id")}
            onBlur={() => setFocused(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              e.stopPropagation();
            }}
          />
        </label>
        <label style={{ ...fieldLabel, marginBottom: 12 }}>
          {t("lgPw")}
          <input
            style={inputStyle("pw")}
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onFocus={() => setFocused("pw")}
            onBlur={() => setFocused(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              e.stopPropagation();
            }}
          />
        </label>
        {error ? (
          <div className="workspace-error" style={{ marginBottom: 10 }}>
            {error === "Wrong id or password" ? t("lgFail") : error}
          </div>
        ) : null}
        <button
          className="editor-btn primary"
          style={{ width: "100%", justifyContent: "center", padding: "9px 12px" }}
          onClick={submit}
          disabled={checking || !id.trim() || !pw}
        >
          {checking ? "⏳" : t("lgSubmit")}
        </button>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button
            className="quota-refresh"
            style={{ fontSize: 12 }}
            onClick={onClose}
            disabled={checking}
          >
            {t("lgCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
