"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CAREER_TRACKS,
  buildCareerChatPrompt,
  careerById,
  pickCareerQuestions,
} from "@/lib/learn-career";
import type { CEFR } from "@/lib/learn-bank";
import type { FlashCard } from "@/lib/learn-flash";

const TRACK_KEY = "canary-career-track";

function loadTrackId(): string {
  try {
    if (typeof localStorage === "undefined") return CAREER_TRACKS[0].id;
    const id = localStorage.getItem(TRACK_KEY);
    return careerById(id) ? (id as string) : CAREER_TRACKS[0].id;
  } catch {
    return CAREER_TRACKS[0].id;
  }
}

/**
 * Career tracks: pick a job, learn the phrases that team actually uses, then
 * rehearse interview answers with STAR skeletons. "Practice in chat" hands the
 * exact question to the main conversation so the model can run the mock
 * interview (no new persona, no extra API surface).
 */
export default function CareerBox({
  level,
  today,
  cards,
  onSaveWord,
  onPractice,
  onSendToChat,
  onSpeak,
}: {
  level: CEFR | null;
  today: string;
  cards: FlashCard[];
  /** Persist a phrase card; returns true when +2 XP was newly paid today. */
  onSaveWord: (term: string, meaning: string) => boolean;
  /** First mock interview of the day pays +3 XP. */
  onPractice: () => boolean;
  onSendToChat?: (text: string) => void;
  onSpeak: (text: string, rate?: number) => void;
}) {
  const [trackId, setTrackId] = useState(loadTrackId);
  const [deal, setDeal] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [savedNow, setSavedNow] = useState<Record<string, 1>>({});
  const [sentQ, setSentQ] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(TRACK_KEY, trackId);
    } catch {
      // best-effort
    }
  }, [trackId]);

  const track = careerById(trackId) ?? CAREER_TRACKS[0];
  const known = useMemo(
    () => new Set(cards.map((c) => c.term.trim().toLowerCase()).filter(Boolean)),
    [cards],
  );
  const questions = useMemo(
    () => pickCareerQuestions(track, level, `${today}|${deal}`, 3),
    [track, level, today, deal],
  );

  const savePhrase = (en: string, ko: string, when: string) => {
    onSaveWord(en, `${ko} — ${when}`);
    setSavedNow((s) => ({ ...s, [en.toLowerCase()]: 1 }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CAREER_TRACKS.map((t) => (
          <button
            key={t.id}
            className={`sidebar-btn small${t.id === track.id ? " secondary" : ""}`}
            style={{ width: "auto", fontSize: 12 }}
            onClick={() => {
              setTrackId(t.id);
              setDeal(0);
              setOpen(null);
              setSentQ(null);
            }}
          >
            {t.icon} {t.name}
          </button>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>
          {track.icon} {track.name} <span style={{ opacity: 0.65, fontSize: 12 }}>({track.ko})</span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.85 }}>{track.blurb}</p>
      </div>

      <div style={{ fontSize: 12, opacity: 0.85, borderLeft: "3px solid var(--green)", paddingLeft: 8 }}>
        💡 {track.tip}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>🗣️ Phrases this team uses</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {track.phrases.map((p) => {
          const saved = known.has(p.en.toLowerCase()) || !!savedNow[p.en.toLowerCase()];
          return (
            <div key={p.en} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <b style={{ fontSize: 14 }}>{p.en}</b>
                <span style={{ fontSize: 11, opacity: 0.6 }}>{p.level}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{p.ko}</div>
              <div style={{ fontSize: 12, opacity: 0.7, fontStyle: "italic", marginTop: 2 }}>
                Use when: {p.when}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button
                  className="sidebar-btn small"
                  style={{ width: "auto", fontSize: 11 }}
                  onClick={() => onSpeak(p.en)}
                  title="Hear the phrase"
                >
                  🔊
                </button>
                <button
                  className="sidebar-btn small"
                  style={{ width: "auto", fontSize: 11 }}
                  onClick={() => onSpeak(p.en, 0.7)}
                  title="Slow model"
                >
                  🐢
                </button>
                <button
                  className="sidebar-btn small"
                  style={{ width: "auto", fontSize: 11 }}
                  disabled={saved}
                  onClick={() => savePhrase(p.en, p.ko, p.when)}
                >
                  {saved ? "✓ Saved" : "🗂️ +Card"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>💬 Interview practice</span>
        <span style={{ flex: 1 }} />
        <button
          className="sidebar-btn small"
          style={{ width: "auto", fontSize: 12 }}
          onClick={() => {
            setDeal((d) => d + 1);
            setOpen(null);
            setSentQ(null);
          }}
        >
          Deal another set
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((q) => {
          const isOpen = open === q.q;
          const sent = sentQ === q.q;
          return (
            <div key={q.q} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <b style={{ fontSize: 13 }}>{q.q}</b>
                <span style={{ fontSize: 11, opacity: 0.6 }}>{q.level}</span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{q.ko}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button
                  className="sidebar-btn small"
                  style={{ width: "auto", fontSize: 11 }}
                  onClick={() => setOpen(isOpen ? null : q.q)}
                  title="STAR-style answer outline"
                >
                  {isOpen ? "▾ Hide skeleton" : "🧭 Answer skeleton"}
                </button>
                <button
                  className="sidebar-btn small"
                  style={{ width: "auto", fontSize: 11 }}
                  onClick={() => onSpeak(q.q)}
                  title="Hear the question"
                >
                  🔊
                </button>
                {onSendToChat ? (
                  <button
                    className="sidebar-btn small primary"
                    style={{ width: "auto", fontSize: 11 }}
                    onClick={() => {
                      onSendToChat(buildCareerChatPrompt(track, q));
                      onPractice();
                      setSentQ(q.q);
                    }}
                    title="Send this question to the main chat"
                  >
                    💬 Practice in chat
                  </button>
                ) : (
                  <span style={{ fontSize: 11, opacity: 0.65, alignSelf: "center" }}>
                    Open Chat to rehearse this.
                  </span>
                )}
              </div>
              {sent ? (
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                  Sent to Chat — answer out loud, then ask for one improvement.
                </div>
              ) : null}
              {isOpen ? (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, opacity: 0.9 }}>
                  {q.skeleton.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>
        Questions are dealt at your level ({level ?? "A1"}) and one band up. The skeleton
        is a starting point — fill it with your own story, then say it out loud.
      </p>
    </div>
  );
}
