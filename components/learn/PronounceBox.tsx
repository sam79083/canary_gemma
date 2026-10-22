"use client";

import { useEffect, useRef, useState } from "react";
import {
  MINIMAL_PAIRS,
  loadPronounceStats,
  pairAccuracy,
  pickPair,
  recordAttempt,
  savePronounceStats,
  scoreMinimalPair,
  type MinimalPair,
  type PairChoice,
  type PronounceResult,
  type PronounceStats,
} from "@/lib/learn-pronounce";
import { useAudioRecorder } from "@/components/learn/useAudioRecorder";
import type { CEFR } from "@/lib/learn-bank";
import { useLanguage } from "@/hooks/useLanguage";

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechCtor = new () => SpeechRec;

/**
 * Minimal-pair pronunciation drills. Listen → pick the word you'll say →
 * speak → browser STT checks which word it heard. MediaRecorder playback is
 * offered too, so Firefox/Safari users can still compare by ear.
 */
export default function PronounceBox({
  level,
  today,
  onPass,
  onSpeak,
}: {
  level: CEFR | null;
  today: string;
  /** First correct attempt for this pair today pays +2 XP. */
  onPass: (pairId: string) => boolean;
  onSpeak: (text: string, rate?: number) => void;
}) {
  const { t } = useLanguage();
  const L = (key: string, fallback: string) => {
    try {
      const s = t(key);
      return s === key ? fallback : s;
    } catch {
      return fallback;
    }
  };
  const [pair, setPair] = useState<MinimalPair>(() => pickPair(`${today}|${level}`, level));
  const [turn, setTurn] = useState(0);
  const [target, setTarget] = useState<PairChoice>("a");
  const [stats, setStats] = useState<PronounceStats>(loadPronounceStats);
  const [result, setResult] = useState<PronounceResult | null>(null);
  const [xpMsg, setXpMsg] = useState("");
  const [speechOK, setSpeechOK] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const recorder = useAudioRecorder();

  useEffect(() => {
    try {
      const w = window as unknown as {
        SpeechRecognition?: SpeechCtor;
        webkitSpeechRecognition?: SpeechCtor;
      };
      setSpeechOK(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    } catch {
      setSpeechOK(false);
    }
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
      recRef.current = null;
    };
  }, []);

  useEffect(() => {
    savePronounceStats(stats);
  }, [stats]);

  const reset = (p: MinimalPair) => {
    setPair(p);
    setResult(null);
    setXpMsg("");
    setTarget("a");
    recorder.clear();
  };

  const nextPair = () => {
    const n = turn + 1;
    setTurn(n);
    reset(pickPair(`${today}|${level}|${n}`, level, pair.id));
  };

  const toggleScore = () => {
    if (!pair) return;
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
      return;
    }
    if (recorder.recording) recorder.stop();
    try {
      const w = window as unknown as {
        SpeechRecognition?: SpeechCtor;
        webkitSpeechRecognition?: SpeechCtor;
      };
      const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (!Ctor) return;
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setResult(null);
      setXpMsg("");
      setListening(true);
      rec.onresult = (e) => {
        try {
          const last = e.results[e.results.length - 1];
          const text = last && last[0] ? last[0].transcript : "";
          if (!text.trim()) return;
          const r = scoreMinimalPair(pair, text, target);
          setResult(r);
          setStats((prev) => recordAttempt(prev, pair.id, r.score));
          if (r.score === 1) {
            const paid = onPass(pair.id);
            setXpMsg(paid ? "· +2 XP" : "");
          }
        } catch {
          // ignore malformed events
        }
      };
      const done = () => {
        setListening(false);
        recRef.current = null;
      };
      rec.onend = done;
      rec.onerror = done;
      recRef.current = rec;
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const targetWord = target === "a" ? pair.a : pair.b;
  const stat = stats[pair.id];
  const secs = `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
        {L("lnPronIntro", "Train the sounds Korean speakers mix up. Listen, copy, and let the browser check which word it heard. No audio leaves your device.")}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ opacity: 0.7 }}>
          Pair {turn + 1} · {pair.level}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.85 }} title="Correct attempts / total attempts">
          Accuracy {pairAccuracy(stat)}% ({stat?.ok ?? 0}/{stat?.total ?? 0})
        </span>
        <button className="sidebar-btn small" style={{ width: "auto", fontSize: 12 }} onClick={nextPair}>
          {L("lnNextPair", "Next pair →")}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["a", "b"] as const).map((side) => {
          const word = side === "a" ? pair.a : pair.b;
          const ipa = side === "a" ? pair.ipaA : pair.ipaB;
          const ko = side === "a" ? pair.koA : pair.koB;
          const example = side === "a" ? pair.sentenceA : pair.sentenceB;
          return (
            <div
              key={side}
              style={{
                border: `1px solid ${target === side ? "var(--green)" : "var(--border)"}`,
                borderRadius: 8,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="sidebar-btn small"
                  style={{ width: "auto", fontSize: 12 }}
                  onClick={() => onSpeak(word)}
                  title={L("lnHearWord", "Hear the word")}
                >
                  🔊
                </button>
                <button
                  className="sidebar-btn small"
                  style={{ width: "auto", fontSize: 11 }}
                  onClick={() => onSpeak(word, 0.65)}
                  title={L("lnHearSlow", "Hear it slowly")}
                >
                  🐢
                </button>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{word}</span>
                <span style={{ fontSize: 11, opacity: 0.65 }}>{ipa}</span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{ko}</div>
              <div style={{ fontSize: 12, opacity: 0.7, fontStyle: "italic" }}>{example}</div>
            </div>
          );
        })}
      </div>

      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{L("lnWhichSay", "🎯 Which one will you say?")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["a", "b"] as const).map((side) => {
            const word = side === "a" ? pair.a : pair.b;
            return (
              <button
                key={side}
                className={`sidebar-btn small${target === side ? " secondary" : ""}`}
                style={{ width: "auto", fontSize: 12 }}
                onClick={() => {
                  setTarget(side);
                  setResult(null);
                  setXpMsg("");
                }}
              >
                {word}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            className={`sidebar-btn small${listening ? " secondary" : " primary"}`}
            onClick={toggleScore}
            disabled={!speechOK}
            style={{ flex: 1 }}
            title={
              speechOK
                ? t("lnSayMic", { w: targetWord })
                : L("lnAutoScoreChromeRec", "Auto-scoring needs desktop Chrome — recording still works")
            }
          >
            {listening ? L("lnListening", "🎤 Listening… tap to stop") : t("lnScoreWord", { w: targetWord })}
          </button>
          {recorder.supported ? (
            <button
              className={`sidebar-btn small${recorder.recording ? " secondary" : ""}`}
              onClick={() => {
                if (recorder.recording) {
                  recorder.stop();
                } else {
                  if (listening) {
                    try {
                      recRef.current?.stop();
                    } catch {
                      // ignore
                    }
                  }
                  void recorder.start();
                }
              }}
              style={{ flex: 1 }}
              title={L("lnRecordTake", "Record your take (stays on your device)")}
            >
              {recorder.recording ? `${L("lnRecording", "⏺")} ${secs} — ${L("lnTapStop", "tap to stop")}` : L("lnRecordCompare", "🎙️ Record & compare")}
            </button>
          ) : null}
        </div>

        {!speechOK ? (
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {L("lnAutoScoreChromeNote2", "Auto-scoring needs desktop Chrome. You can still record, listen back, and compare with the model.")}
          </div>
        ) : null}
        {recorder.error ? <div style={{ fontSize: 12, opacity: 0.85 }}>⚠️ {recorder.error}</div> : null}
        {recorder.url ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 11 }}
              onClick={() => {
                try {
                  const el = document.querySelector<HTMLAudioElement>("audio[data-pron-mine]");
                  if (el) {
                    el.currentTime = 0;
                    void el.play();
                  }
                } catch {
                  // ignore
                }
              }}
            >
              ▶️ {L("lnHearMe", "Hear me")}
            </button>
            <button
              className="sidebar-btn small"
              style={{ width: "auto", fontSize: 11 }}
              onClick={() => recorder.clear()}
            >
              🗑️ {L("lnRetakeBtn2", "Retake")}
            </button>
            <audio data-pron-mine src={recorder.url} controls style={{ height: 28, maxWidth: "100%" }} />
          </div>
        ) : null}

        {result ? (
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            {result.score === 1 ? (
              <span>
                ✅ {t("lnHeardTarget", { w: result.heardWord })} {xpMsg}
              </span>
            ) : result.score === 0 ? (
              <span>
                ⚠️ {t("lnHeardOther", { w: result.heardWord })}
              </span>
            ) : (
              <span>
                🤔 {t("lnHeardUnclear", { h: result.heard || "(nothing)" })}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div style={{ fontSize: 12, opacity: 0.85, borderLeft: "3px solid var(--green)", paddingLeft: 8 }}>
        💡 {pair.tip}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>
        {t("lnPairCount", { n: MINIMAL_PAIRS.length })}
      </div>
    </div>
  );
}
