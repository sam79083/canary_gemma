"use client";

import { useEffect } from "react";
import type { ConfirmRequest } from "@/hooks/useConfirm";
import type { TFn } from "@/lib/i18n";

interface Props {
  req: ConfirmRequest | null;
  cancelLabel: string;
  onSettle: (ok: boolean) => void;
  t: TFn;
}

/**
 * Accessible confirm modal driven by useConfirm(). Plain elements on
 * purpose (see LoginDialog): the card is a child of the dim layer, so
 * backdrop clicks land on the layer (Cancel) and the card always wins
 * hit-testing. No modal-layer library side effects.
 */
export default function ConfirmDialog({ req, cancelLabel, onSettle, t }: Props) {
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSettle(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req, onSettle]);

  if (!req) return null;

  return (
    <div
      className="review-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label={req.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSettle(false);
      }}
    >
      <div className="review-card" style={{ maxWidth: 360 }}>
        <h3>{req.title}</h3>
        {req.desc ? <div className="review-note">{req.desc}</div> : null}
        <div className="review-actions">
          <button
            className="editor-btn"
            onClick={() => onSettle(false)}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            className="editor-btn primary"
            onClick={() => onSettle(true)}
          >
            {req.okLabel || t("trDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}
