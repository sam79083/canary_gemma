"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Chat & roleplay modes. Mirrors the chat page's localStorage keys, so a
 * settings round-trip re-applies them on chat remount.
 * Hydration-safe: initial render uses defaults, stored values load in an
 * effect — server HTML and first client render must match.
 */
function readFlag(key: string, dflt: boolean): boolean {
  try {
    if (typeof localStorage === "undefined") return dflt;
    const raw = localStorage.getItem(key);
    if (raw === null) return dflt;
    return raw === "1";
  } catch {
    return dflt;
  }
}

export default function ChatModeSection() {
  const { t } = useLanguage();
  const [agentMode, setAgentMode] = useState(true);
  const [planMode, setPlanMode] = useState(false);
  const [practiceOn, setPracticeOn] = useState(true);

  useEffect(() => {
    setAgentMode(readFlag("canary-agent-mode", true));
    setPlanMode(readFlag("canary-plan-mode", false));
    setPracticeOn(readFlag("canary-practice-on", false));
  }, []);

  const put = (key: string, on: boolean): void => {
    try { localStorage.setItem(key, on ? "1" : "0"); } catch {
      // best-effort
    }
  };

  const rows: Array<{ key: string; label: string; hint: string; on: boolean; set: (v: boolean) => void }> = [
    {
      key: "agent",
      label: t("chAgentLabel"),
      hint: t("chAgentHint"),
      on: agentMode,
      set: (v) => { setAgentMode(v); put("canary-agent-mode", v); if (!v) { setPlanMode(false); put("canary-plan-mode", false); } },
    },
    {
      key: "plan",
      label: t("plMode"),
      hint: t("plHint"),
      on: planMode,
      set: (v) => { setPlanMode(v); put("canary-plan-mode", v); if (v) { setAgentMode(true); put("canary-agent-mode", true); } },
    },
    {
      key: "roleplay",
      label: "🎭 " + t("rpMode"),
      hint: t("rpHint"),
      on: practiceOn,
      set: (v) => { setPracticeOn(v); put("canary-practice-on", v); },
    },
  ];

  return (
    <section className="settings-section">
      <h2>{t("seChatModes")}</h2>
      {rows.map((r) => (
        <div className="settings-row" key={r.key} title={r.hint}>
          <span className="settings-label">{r.label}</span>
          <select
            className="sidebar-btn small"
            value={r.on ? "1" : "0"}
            onChange={(e) => r.set(e.target.value === "1")}
            style={{ cursor: "pointer", textAlign: "center" }}
          >
            <option value="1">On</option>
            <option value="0">Off</option>
          </select>
        </div>
      ))}
    </section>
  );
}
