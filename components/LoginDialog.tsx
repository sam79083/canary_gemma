"use client";

import { useEffect, useRef } from "react";
import type { TFn } from "@/lib/i18n";
import { supabaseBrowser } from "@/supabase/client";

interface Props {
  open: boolean;
  checking: boolean;
  error: string | null;
  onGoogleLogin: () => Promise<boolean>;
  onClose: () => void;
  t: TFn;
}

/** Google "G" mark in brand colors. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.7 2.9v.1C3.3 21.3 7.3 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5.1l3.8-2.7z"
      />
      <path
        fill="#EA4335"
        d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.8l3.8 2.9c.9-2.9 3.6-5.1 6.8-5.1z"
      />
    </svg>
  );
}

/**
 * Member login popup: Google OAuth only. Card is a child of the dim
 * layer; Esc and the Cancel button dismiss it.
 */
export default function LoginDialog({ open, checking, error, onGoogleLogin, onClose, t }: Props) {
  const googleRef = useRef<HTMLButtonElement>(null);
  const configured = supabaseBrowser() !== null;

  useEffect(() => {
    if (open) {
      const tmr = setTimeout(() => googleRef.current?.focus(), 30);
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

  const errText =
    error === "member-full"
      ? t("lgFull")
      : error === "Auth not configured"
        ? t("lgNoConfig")
        : error;

  return (
    <div
      className="review-overlay"
      id="login-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("lgTitle")}
    >
      <div className="review-card" style={{ maxWidth: 320, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("lgTitle")}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 20 }}>{t("lgHint")}</div>

        <button
          ref={googleRef}
          className="editor-btn"
          style={{
            width: "100%",
            justifyContent: "center",
            padding: "11px 12px",
            background: "#fff",
            color: "#1f1f1f",
            border: "1px solid #dadce0",
            borderRadius: 8,
            fontWeight: 600,
            gap: 10,
          }}
          onClick={() => {
            void onGoogleLogin().then((ok) => {
              if (ok) onClose();
            });
          }}
          disabled={checking || !configured}
          title={configured ? undefined : t("lgNoConfig")}
        >
          {checking ? "⏳" : <GoogleMark />}
          {checking ? "" : t("lgGoogle")}
        </button>
        {!configured ? (
          <div className="workspace-error" style={{ marginTop: 10 }}>
            {t("lgNoConfig")}
          </div>
        ) : null}
        {errText && configured ? (
          <div className="workspace-error" style={{ marginTop: 10 }}>
            {errText}
          </div>
        ) : null}

        <button
          className="editor-btn"
          style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
          onClick={onClose}
          disabled={checking}
        >
          {t("lgCancel")}
        </button>
      </div>
    </div>
  );
}
