"use client";

import { useState } from "react";
import { LANGS, isLang, type Lang, type TFn } from "@/lib/i18n";

interface Props {
  t: TFn;
  lang: Lang;
  setLang: (l: Lang) => void;
  folderChosen: boolean;
  folderName: string | null;
  onPickFolder: () => void;
  onTryTask: (prompt: string) => void;
  onDone: () => void;
  onSkip: () => void;
}

export default function Onboarding({
  t,
  lang,
  setLang,
  folderChosen,
  folderName,
  onPickFolder,
  onTryTask,
  onDone,
  onSkip,
}: Props) {
  const [step, setStep] = useState(0);

  return (
    <div className="review-overlay" id="onboard-overlay">
      <div className="review-card">
        <h3>👋 {t("obWelcome")}</h3>
        <div style={{ display: "flex", gap: 6, margin: "10px 0 14px" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= step ? "#2e7d32" : "var(--border)",
              }}
            />
          ))}
        </div>

        {step === 0 ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("obStep1T")}</div>
            <select
              className="sidebar-btn small"
              value={lang}
              onChange={(e) => {
                if (isLang(e.target.value)) setLang(e.target.value);
              }}
              style={{ width: "100%" }}
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("obStep2T")}</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
              {t("obStep2Hint")}
            </div>
            <button className="sidebar-btn" onClick={onPickFolder} style={{ width: "100%", justifyContent: "center" }}>
              {folderChosen ? `📂 ${folderName} ✓` : t("pgChooseFolder")}
            </button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("obStep3T")}</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
              {t("obStep3Hint")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: t("chSt1L"), prompt: t("chSt1P") },
                { label: t("chSt2L"), prompt: t("chSt2P") },
                { label: t("chSt3L"), prompt: t("chSt3P") },
              ].map((s) => (
                <button
                  key={s.label}
                  className="sidebar-btn small"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => onTryTask(s.prompt)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <div className="review-actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button className="editor-btn" onClick={onSkip}>
            {t("obSkip")}
          </button>
          <span style={{ display: "flex", gap: 8 }}>
            {step > 0 ? (
              <button className="editor-btn" onClick={() => setStep(step - 1)}>
                {t("obBack")}
              </button>
            ) : null}
            {step < 2 ? (
              <button className="editor-btn primary" onClick={() => setStep(step + 1)}>
                {t("obNext")}
              </button>
            ) : (
              <button className="editor-btn primary" onClick={onDone}>
                {t("obDone")}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
