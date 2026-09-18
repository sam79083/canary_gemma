"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { usePersonality } from "@/hooks/usePersonality";
import { useCustomInstructions } from "@/hooks/useCustomInstructions";
import { useAuth } from "@/hooks/useAuth";

/** AI persona: reply style + standing user guidelines. */
export default function PersonaSection() {
  const { t } = useLanguage();
  const { personality, setPersonality } = usePersonality();
  const auth = useAuth();
  const {
    customInstructions,
    setCustomInstructions,
    saveState,
    retrySave,
  } = useCustomInstructions(auth.user !== null);
  const unsaved = saveState.status !== "saved";
  const statusText =
    saveState.status === "error"
      ? t("psSaveFail")
      : saveState.status === "saved"
        ? (saveState.scope === "account" ? t("psSynced") : t("psSaved")) +
          (saveState.at
            ? ` ✓ ${new Date(saveState.at).toLocaleTimeString()}`
            : " ✓")
        : saveState.scope === "account"
          ? t("psSyncing")
          : t("psSaving");

  return (
    <section className="settings-section">
      <h2>
        {t("sePersona")}
        {unsaved ? <span style={{ color: "#e65100" }}> •</span> : null}
      </h2>
      <div className="settings-row">
        <span className="settings-label">{t("thPersonality")}</span>
        <select
          className="sidebar-btn small"
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          style={{ cursor: "pointer" }}
        >
          {(
            [
              ["default", t("psDefault")],
              ["concise", t("psConcise")],
              ["pirate", t("psPirate")],
              ["poet", t("psPoet")],
              ["buddy", t("psBuddy")],
            ] as Array<[string, string]>
          ).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-col">
        <span className="settings-label">{t("psCustom")}</span>
        <textarea
          className="sidebar-btn small"
          style={{ cursor: "text", minHeight: 90, resize: "vertical", lineHeight: 1.4 }}
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder={t("psCustomPh")}
          maxLength={2000}
          spellCheck={false}
        />
        <div
          onClick={saveState.status === "error" ? () => retrySave() : undefined}
          title={saveState.status === "error" ? statusText : undefined}
          style={{
            fontSize: 11,
            opacity: saveState.status === "error" ? 1 : 0.7,
            color: saveState.status === "error" ? "#c62828" : undefined,
            cursor: saveState.status === "error" ? "pointer" : "default",
          }}
        >
          {statusText}
        </div>
      </div>
    </section>
  );
}
