"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";

/** Chat & roleplay toggles (persisted to the same localStorage keys chat reads). */
export default function ChatModeSection() {
  const { t } = useLanguage();
  const [agentMode, setAgentMode] = useState<boolean>(() => {
    try { return typeof localStorage !== "undefined" ? localStorage.getItem("canary-agent-mode") !== "0" : true; }
    catch { return true; }
  });
  const [planMode, setPlanMode] = useState<boolean>(() => {
    try { return typeof localStorage !== "undefined" && localStorage.getItem("canary-plan-mode") === "1"; }
    catch { return false; }
  });
  const [practiceOn, setPracticeOn] = useState<boolean>(() => {
    try { return typeof localStorage !== "undefined" && localStorage.getItem("canary-practice-on") === "1"; }
    catch { return false; }
  });

  useEffect(() => { try { localStorage.setItem("canary-agent-mode", agentMode ? "1" : "0"); } catch {} }, [agentMode]);
  useEffect(() => { try { localStorage.setItem("canary-plan-mode", planMode ? "1" : "0"); } catch {} }, [planMode]);
  useEffect(() => { try { localStorage.setItem("canary-practice-on", practiceOn ? "1" : "0"); } catch {} }, [practiceOn]);

  return (
    <section className="settings-section">
      <h2>{t("seChatModes") ?? "Chat & roleplay"}</h2>
      <div className="settings-row">
        <span className="settings-label">{t("chAgentLabel")}</span>
        <input type="checkbox" checked={agentMode} onChange={(e) => { const on = e.target.checked; setAgentMode(on); if (!on) setPlanMode(false); }} />
      </div>
      <div className="settings-row">
        <span className="settings-label">{t("plMode")}</span>
        <input type="checkbox" checked={planMode} onChange={(e) => { const on = e.target.checked; setPlanMode(on); if (on) setAgentMode(true); }} />
      </div>
      <div className="settings-row">
        <span className="settings-label">🎭 Roleplay</span>
        <input type="checkbox" checked={practiceOn} onChange={(e) => setPracticeOn(e.target.checked)} />
      </div>
    </section>
  );
}
