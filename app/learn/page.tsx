"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TutorPanel from "@/components/learn/TutorPanel";
import { useLanguage } from "@/hooks/useLanguage";
import { useLanguageModel } from "@/hooks/useLanguageModel";
import { useAuth } from "@/hooks/useAuth";

/** Dedicated /learn room: same TutorPanel, full-page (no slide-over). */
export default function LearnPage() {
  const { lang, t } = useLanguage();
  const auth = useAuth();
  const model = useLanguageModel(lang, t, auth.user !== null);
  const [tab, setTab] = useState<"quiz" | "idiom" | "book" | "read" | "cards" | "listen" | "dojo" | "say" | "work" | "review" | "essay" | "style" | "folio" | "assess" | "me">("quiz");

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("tab");
      if (q && ["quiz", "idiom", "book", "read", "cards", "listen", "dojo", "say", "work", "review", "essay", "style", "folio", "assess", "me"].includes(q))
        setTab(q as typeof tab);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askAI = useCallback(
    async (prompt: string): Promise<string | null> => {
      const session = model.sessionRef.current;
      if (!session || !model.ready) return null;
      try {
        if (typeof session.promptStreaming === "function") {
          let full = "";
          const stream = session.promptStreaming(prompt);
          for await (const chunk of stream) full += chunk;
          return full.trim() ? full : null;
        }
        const out = await session.prompt(prompt);
        return out && out.trim() ? out : null;
      } catch {
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.ready],
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
        <Link href="/" className="sidebar-btn small" style={{ width: "auto" }}>
          ← Shrink
        </Link>
        <span style={{ fontWeight: 800 }}>English Study</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{model.ready ? model.status : "AI starting…"}</span>
      </div>
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0 }}>
              <TutorPanel
                initialTab={tab}
                modelReady={model.ready}
                modelStatus={model.status}
                onAskAI={askAI}
                fullScreen
              />
        </div>
      </div>
      <style>{`
        div [role="dialog"][aria-label="English tutor"] {
          position: absolute !important;
          inset: 0 !important;
          width: auto !important;
          border-left: none !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  );
}
