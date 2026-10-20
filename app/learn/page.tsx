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
    <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(480px, 100%)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/" className="sidebar-btn small" style={{ width: "auto" }}>
            ← Shrink
          </Link>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{model.ready ? model.status : "AI starting…"}</span>
        </div>
        <div
          style={{
            position: "relative",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            height: "min(82vh, 900px)",
          }}
        >
          {/* Reuse the panel inline: override fixed positioning via wrapper. */}
          <div style={{ position: "absolute", inset: 0 }}>
            <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <TutorPanel
                initialTab={tab}
                modelReady={model.ready}
                modelStatus={model.status}
                onAskAI={askAI}
              />
            </div>
          </div>
        </div>
      </div>
      <style>{`
        /* Inline mode: panel fills the card instead of sliding over. */
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
