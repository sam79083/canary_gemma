"use client";

import { useEffect, useRef, useState } from "react";
import type { TFn } from "@/lib/i18n";

interface Props {
  checking: boolean;
  error: string | null;
  onLogin: (id: string, pw: string) => Promise<boolean>;
  onClose: () => void;
  t: TFn;
}

/** Small member-login popup. Credentials go to /api/auth only. */
export default function LoginDialog({ checking, error, onLogin, onClose, t }: Props) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    idRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    if (!id.trim() || !pw || checking) return;
    void onLogin(id.trim(), pw).then((ok) => {
      if (ok) onClose();
    });
  };

  return (
    <div
      className="review-overlay"
      id="login-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="review-card" style={{ maxWidth: 320 }}>
        <h3>{t("lgTitle")}</h3>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
          {t("lgHint")}
        </div>
        <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
          {t("lgId")}
          <input
            ref={idRef}
            className="sidebar-btn small"
            style={{ width: "100%", cursor: "text", marginTop: 4 }}
            autoComplete="username"
            value={id}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              e.stopPropagation();
            }}
          />
        </label>
        <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
          {t("lgPw")}
          <input
            className="sidebar-btn small"
            style={{ width: "100%", cursor: "text", marginTop: 4 }}
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
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
          <div className="workspace-error" style={{ marginBottom: 6 }}>
            {error === "Wrong id or password" ? t("lgFail") : error}
          </div>
        ) : null}
        <div className="review-actions">
          <button className="editor-btn" onClick={onClose} disabled={checking}>
            {t("lgCancel")}
          </button>
          <button
            className="editor-btn primary"
            onClick={submit}
            disabled={checking || !id.trim() || !pw}
          >
            {checking ? "⏳" : t("lgSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
