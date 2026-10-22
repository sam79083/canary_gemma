"use client";

import { useEffect, useRef, useState } from "react";
import { contentWords, wordHitRate } from "@/lib/learn-listen";
import { useAudioRecorder } from "@/components/learn/useAudioRecorder";
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
 * Shadowing drill: listen → record yourself → compare playback → word-hit
 * score via the Web Speech API.
 *
 * Recording (MediaRecorder) works in every modern browser and stays local —
 * nothing is uploaded. Auto-scoring (SpeechRecognition) is Chrome-desktop
 * only; elsewhere the record/compare half still works. Key by sentence to
 * reset per round.
 */
export default function ShadowBox({
  sentence,
  onSpeak,
  onScore,
}: {
  sentence: string;
  onSpeak: (rate?: number) => void;
  onScore: (rate: number, transcript: string) => void;
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
  const [speechOK, setSpeechOK] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  const toggleScore = () => {
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
      return;
    }
    // One mic owner at a time: stop the recorder before STT starts.
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
      setTranscript("");
      setRate(null);
      setListening(true);
      rec.onresult = (e) => {
        try {
          const last = e.results[e.results.length - 1];
          const text = last && last[0] ? last[0].transcript : "";
          if (text.trim()) {
            setTranscript(text.trim());
            const r = wordHitRate(sentence, text);
            setRate(r);
            onScore(r, text.trim());
          }
        } catch {
          // ignore
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

  const playMine = () => {
    try {
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = 0;
      void el.play();
    } catch {
      // ignore
    }
  };

  const want = contentWords(sentence).length;
  const secs = `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, "0")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="sidebar-btn small" onClick={() => onSpeak()} style={{ width: "auto" }} title={L("lnHearFirst", "Hear it first")}>
          🔊 {L("lnListen", "Listen")}
        </button>
        <button className="sidebar-btn small" onClick={() => onSpeak(0.7)} style={{ width: "auto" }} title={L("lnSlowModel", "Slow model")}>
          🐢 {L("lnSlow", "Slow")}
        </button>
        {recorder.supported ? (
          <button
            className={`sidebar-btn small${recorder.recording ? " secondary" : " primary"}`}
            onClick={() => {
              if (recorder.recording) recorder.stop();
              else void recorder.start();
            }}
            style={{ flex: 1 }}
            title={L("lnRecordTake", "Record your take (stays on your device)")}
          >
            {recorder.recording ? `${L("lnRecording", "⏺")} ${secs} — ${L("lnTapStop", "tap to stop")}` : L("lnRecordMyTake", "🎙️ Record my take")}
          </button>
        ) : null}
        <button
          className="sidebar-btn small"
          onClick={toggleScore}
          disabled={!speechOK}
          style={{ flex: 1 }}
          title={speechOK ? L("lnRepeatMic", "Repeat the sentence into your mic") : L("lnAutoScoreChrome", "Auto-scoring needs desktop Chrome")}
        >
          {listening ? L("lnListening", "⏺ Listening… tap to stop") : L("lnScoreIt", "🎤 Score it")}
        </button>
      </div>

      {recorder.error ? <div style={{ fontSize: 12, opacity: 0.85 }}>⚠️ {recorder.error}</div> : null}

      {recorder.url ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="sidebar-btn small" onClick={playMine} style={{ width: "auto", fontSize: 12 }} title={L("lnPlayRecording", "Play your recording")}>
            ▶️ {L("lnHearMe", "Hear me")}
          </button>
          <button className="sidebar-btn small" onClick={() => recorder.clear()} style={{ width: "auto", fontSize: 12 }} title={L("lnRetake", "Retake")}>
            🗑️ {L("lnRetakeBtn", "Retake")}
          </button>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {L("lnCompareModel", "Compare: 🐢 model, then your take — " + recorder.seconds + "s clip, never uploaded.")}
          </span>
          <audio ref={audioRef} src={recorder.url} preload="auto" style={{ display: "none" }} />
        </div>
      ) : null}

      {!recorder.supported ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {L("lnRecNeedModern", "Recording needs a modern browser — " + (speechOK ? L("lnScoreWorks", "scoring still works here.") : L("lnDictateWorks", "dictation still works everywhere.")))}
        </div>
      ) : null}
      {!speechOK ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>L("lnAutoScoreChromeNote", "Auto-scoring (word hits) needs desktop Chrome — record & compare works everywhere.")</div>
      ) : null}

      {transcript ? (
        <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
          <div style={{ opacity: 0.8 }}>
            {t("lnHeard", { t: transcript })}</div>
          {rate !== null ? (
            <div style={{ fontWeight: 800, marginTop: 2 }}>
              {rate >= 0.8 ? "🌟 " : rate >= 0.5 ? "💪 " : "🍀 "}
              {t("lnKeyWords", { pct: Math.round(rate * 100), want })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
