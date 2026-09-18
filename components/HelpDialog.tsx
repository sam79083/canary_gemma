"use client";

import { useEffect } from "react";
import type { TFn } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  t: TFn;
}

/**
 * Shortcuts + features sheet. Same plain-element modal pattern as
 * TrialOverDialog: card is a child of the dim layer, Esc dismisses.
 */
export default function HelpDialog({ open, onClose, t }: Props) {
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

  const rows = [
    t("hpSend"),
    t("hpAgent"),
    t("hpSearch"),
    t("hpDraw"),
    t("hpAttach"),
    t("hpReview"),
    t("hpSessions"),
  ];

  return (
    <div
      className="review-overlay"
      id="help-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("hpTitle")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="review-card" style={{ maxWidth: 420 }}>
        <h3>{t("hpTitle")}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, marginTop: 8 }}>
          {rows.map((row) => (
            <div key={row} style={{ lineHeight: 1.5 }}>
              {row}
            </div>
          ))}
        </div>
        <div className="review-actions" style={{ marginTop: 16 }}>
          <button className="editor-btn primary" onClick={onClose} autoFocus>
            {t("hpClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
