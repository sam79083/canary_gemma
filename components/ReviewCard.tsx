"use client";

import { useEffect, useState } from "react";
import { summarizeDiff } from "@/lib/diff";
import type { TFn } from "@/lib/i18n";
import type { PendingReview } from "@/lib/types";

/** Keep/Undo modal. For writes the proposal is editable — Keep applies
 *  the edited text, so the reviewer becomes the editor. */
export default function ReviewCard({
  review,
  t,
  onSettle,
}: {
  review: PendingReview;
  t: TFn;
  onSettle: (ok: boolean, text?: string, feedback?: string, saveAsNew?: boolean) => void;
}) {
  const [edited, setEdited] = useState(review.newText);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setEdited(review.newText);
  }, [review]);
  useEffect(() => {
    setFeedback("");
  }, [review]);

  const isNew = review.kind === "write" && review.oldText === "";
  const diffPreview =
    review.oldText === "" && edited === review.newText
      ? `+++ ${t("rvNewFile")} +++\n` +
        edited.slice(0, 2000) +
        (edited.length > 2000 ? "\n…" : "")
      : summarizeDiff(review.oldText, edited).preview;

  return (
    <div className="review-overlay" id="review-overlay">
      <div className="review-card">
        <h3>{t("rvTitle")}</h3>
        <div className="review-path">📄 {review.path}</div>
        {review.kind === "delete" ? (
          <div className="review-note">{t("rvDeleteNote")}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
              {t("rvEditHint")}
            </div>
            <textarea
              className="review-edit"
              autoFocus
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              spellCheck={false}
            />
            <pre className="review-diff">{diffPreview}</pre>
          </>
        )}
        {review.kind === "write" ? (
          <div className="review-feedback">
            <div className="review-feedback-label">💬 {t("rvFeedbackPh")}</div>
            <textarea
              className="review-feedback-input"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && feedback.trim()) {
                  e.preventDefault();
                  onSettle(false, undefined, feedback.trim());
                }
              }}
              placeholder={t("rvFeedbackEx")}
              spellCheck={false}
            />
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
              {t("rvFeedbackHint")}
            </div>
          </div>
        ) : null}
        <div className="review-actions" style={{ marginTop: 12 }}>
          <button className="editor-btn" onClick={() => onSettle(false)}>
            {isNew ? t("rvDrop") : t("rvUndo")}
          </button>
          {review.kind === "write" ? (
            <button
              className={`editor-btn remake${feedback.trim() ? " primary" : ""}`}
              disabled={!feedback.trim()}
              onClick={() => onSettle(false, undefined, feedback.trim())}
            >
              {t("rvRegen")}
            </button>
          ) : null}
          {review.kind === "write" && !isNew ? (
            <button
              className="editor-btn"
              onClick={() => onSettle(true, edited, undefined, true)}
              title={t("rvSaveAsNewTitle")}
            >
              {t("rvSaveAsNew")}
            </button>
          ) : null}
          <button
            className="editor-btn primary"
            onClick={() => onSettle(true, review.kind === "write" ? edited : undefined)}
          >
            {t("rvKeep")}
          </button>
        </div>
      </div>
    </div>
  );
}
