"use client";

import type { TFn } from "@/lib/i18n";

interface Props {
  t: TFn;
  folderChosen: boolean;
  folderName: string | null;
  folderSupported: boolean;
  folderError: string | null;
  onPickFolder: () => void;
  onDone: () => void;
  onSkip: () => void;
}

/** First-visit popup: folder only. Language defaults to Korean and the
 * starter templates live in the chat itself — no setup wizard. */
export default function Onboarding({
  t,
  folderChosen,
  folderName,
  folderSupported,
  folderError,
  onPickFolder,
  onDone,
  onSkip,
}: Props) {
  return (
    <div className="review-overlay" id="onboard-overlay">
      <div className="review-card">
        <h3>👋 {t("obWelcome")}</h3>
        <div style={{ fontWeight: 600, marginBottom: 8, marginTop: 10 }}>
          {t("obStep2T")}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
          {t("obStep2Hint")}
        </div>
        {!folderSupported ? (
          <div
            className="note"
            style={{ marginBottom: 10, marginTop: 0 }}
          >
            {t("obStep2Mobile")}
          </div>
        ) : (
          <>
            <button className="editor-btn primary" onClick={onPickFolder} style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "10px 12px" }}>
                  {folderChosen ? `📁 ${folderName} ✓` : `📁 ${t("pgChooseFolder")}`}
            </button>
            {folderError ? (
              <div className="workspace-error" style={{ marginTop: 6 }}>
                {folderError}
              </div>
            ) : null}
          </>
        )}

        <div
          className="note"
          style={{ marginTop: 12, lineHeight: 1.7, fontSize: 13 }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {t("obFeatT")}
          </div>
          <div>{t("obFeat1")}</div>
          <div>{t("obFeat2")}</div>
          <div>{t("obFeat3")}</div>
        </div>

        <div className="review-actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button className="editor-btn" onClick={onSkip}>
            {t("obSkip")}
          </button>
          <button className="editor-btn primary" onClick={onDone}>
            {t("obDone")}
          </button>
        </div>
      </div>
    </div>
  );
}
