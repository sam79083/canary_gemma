"use client";

import { useState } from "react";
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
  /** Learner fork: close onboarding and open the tutor on the level check. */
  onStudy: () => void;
}

/** First-visit fork: chat/files people vs English learners.
 * Learners skip the folder entirely and land on the 30-second level check
 * (first win in ~60 seconds); chatters get the original folder flow. */
export default function Onboarding({
  t,
  folderChosen,
  folderName,
  folderSupported,
  folderError,
  onPickFolder,
  onDone,
  onSkip,
  onStudy,
}: Props) {
  const [fork, setFork] = useState<"ask" | "chat" | "study">("ask");

  if (fork === "ask") {
    return (
      <div className="review-overlay" id="onboard-overlay">
        <div className="review-card" style={{ textAlign: "center" }}>
          <h3>👋 {t("obWelcome")}</h3>
          <div style={{ fontWeight: 600, margin: "10px 0 12px" }}>
            What brings you here? · 무엇을 하러 오셨어요?
          </div>
          <button
            className="editor-btn primary"
            onClick={() => setFork("study")}
            style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "12px", marginBottom: 8 }}
          >
            🦜 Study English · 영어 공부
          </button>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
            30-sec level check → first quiz + AI feedback in ~1 minute
          </div>
          <button
            className="editor-btn"
            onClick={() => setFork("chat")}
            style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "12px" }}
          >
            💬 Chat & files · 채팅과 파일
          </button>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            Private AI chat with a file agent on your device
          </div>
          <div className="review-actions" style={{ marginTop: 16, justifyContent: "center" }}>
            <button className="editor-btn" onClick={onSkip}>
              {t("obSkip")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (fork === "study") {
    return (
      <div className="review-overlay" id="onboard-overlay">
        <div className="review-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>🦜</div>
          <div style={{ fontWeight: 800, fontSize: 17, margin: "6px 0" }}>
            Start with a 30-second level check
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
            12 can-do questions → your level → first 5-question quiz with instant AI feedback. No account, no setup.
          </div>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 14 }}>
            12개 질문 → 레벨 측정 → 5문제 퀴즈와 AI 피드백까지, 약 1분이면 첫 성공!
          </div>
          <button
            className="editor-btn primary"
            onClick={onStudy}
            style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "12px" }}
          >
            Check my level → · 레벨 측정하기 →
          </button>
          <div className="review-actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <button className="editor-btn" onClick={() => setFork("ask")}>
              ← Back
            </button>
            <button className="editor-btn" onClick={onSkip}>
              Just look around
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <div>🦜 {t("lnTutor")}: Ctrl+J — quiz, idioms, essay with AI coaching.</div>
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
