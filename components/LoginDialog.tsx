"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { TFn } from "@/lib/i18n";

interface Props {
  open: boolean;
  checking: boolean;
  error: string | null;
  onLogin: (id: string, pw: string) => Promise<boolean>;
  onClose: () => void;
  t: TFn;
}

/** Small member-login popup (Radix Dialog). Credentials go to /api/auth only. */
export default function LoginDialog({ open, checking, error, onLogin, onClose, t }: Props) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");

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

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="review-overlay" id="login-overlay" />
        <Dialog.Content
          className="review-card"
          style={{ maxWidth: 320 }}
          onOpenAutoFocus={(e) => {
            // Focus the ID field instead of the dialog body.
            const input = (e.target as HTMLElement).querySelector(
              'input[autocomplete="username"]',
            ) as HTMLElement | null;
            if (input) {
              e.preventDefault();
              input.focus();
            }
          }}
        >
          <Dialog.Title asChild>
            <h3>{t("lgTitle")}</h3>
          </Dialog.Title>
          <Dialog.Description asChild>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
              {t("lgHint")}
            </div>
          </Dialog.Description>
          <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
            {t("lgId")}
            <input
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
