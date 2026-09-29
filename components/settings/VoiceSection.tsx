"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import {
  getStoredVoiceKey,
  setStoredVoiceKey,
  voiceKey,
  type VoiceLike,
} from "@/lib/speech";

/** Read-aloud voice: explicit choice wins over the automatic pick. */
export default function VoiceSection() {
  const { lang, t } = useLanguage();
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const [choice, setChoice] = useState<string>("auto");

  useEffect(() => {
    let ok = false;
    try {
      ok = "speechSynthesis" in window;
    } catch {
      ok = false;
    }
    setSupported(ok);
    if (!ok) return;
    const load = () => {
      try {
        setVoices(
          window.speechSynthesis
            .getVoices()
            .map((v) => ({ lang: v.lang, name: v.name })),
        );
      } catch {
        // ignore
      }
    };
    load();
    try {
      window.speechSynthesis.addEventListener("voiceschanged", load);
    } catch {
      // ignore
    }
    try {
      setChoice(getStoredVoiceKey() ?? "auto");
    } catch {
      // ignore
    }
    return () => {
      try {
        window.speechSynthesis.removeEventListener("voiceschanged", load);
      } catch {
        // ignore
      }
    };
  }, []);

  if (!supported) return null;

  const prefix = lang.split("-")[0].toLowerCase();
  const sorted = [...voices].sort((a, b) => {
    const am = (a.lang || "").toLowerCase().startsWith(prefix);
    const bm = (b.lang || "").toLowerCase().startsWith(prefix);
    if (am !== bm) return am ? -1 : 1;
    return `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`);
  });

  return (
    <section className="settings-section">
      <h2>{t("seVoice")}</h2>
      <div className="settings-row">
        <span className="settings-label">{t("seVoice")}</span>
        <select
          className="sidebar-btn small"
          value={voices.some((v) => voiceKey(v) === choice) ? choice : "auto"}
          onChange={(e) => {
            const v = e.target.value;
            setChoice(v);
            setStoredVoiceKey(v === "auto" ? null : v);
          }}
          style={{ cursor: "pointer", maxWidth: "100%" }}
        >
          <option value="auto">{t("seVoiceAuto")}</option>
          {sorted.map((v) => (
            <option key={voiceKey(v)} value={voiceKey(v)}>
              {v.name} ({v.lang || "?"})
            </option>
          ))}
        </select>
      </div>
      <div className="note" style={{ fontSize: 12, opacity: 0.75 }}>
        {t("seVoiceHint")}
      </div>
    </section>
  );
}
