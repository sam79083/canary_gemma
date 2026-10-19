"use client";

import { useEffect, useRef, useState } from "react";
import { contentWords, wordHitRate } from "@/lib/learn-listen";
import { useAudioRecorder } from "@/components/learn/useAudioRecorder";

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
        <button className="sidebar-btn small" onClick={() => onSpeak()} style={{ width: "auto" }} title="Hear it first">
          🔊 Listen
        </button>
        <button className="sidebar-btn small" onClick={() => onSpeak(0.7)} style={{ width: "auto" }} title="Slow model">
          🐢 Slow
        </button>
        {recorder.supported ? (
          <button
            className={`sidebar-btn small${recorder.recording ? " secondary" : " primary"}`}
            onClick={() => {
              if (recorder.recording) recorder.stop();
              else void recorder.start();
            }}
            style={{ flex: 1 }}
            title="Record your take (stays on your device)"
          >
            {recorder.recording ? `⏺ ${secs} — tap to stop` : "🎙️ Record my take"}
          </button>
        ) : null}
        <button
          className="sidebar-btn small"
          onClick={toggleScore}
          disabled={!speechOK}
          style={{ flex: 1 }}
          title={speechOK ? "Repeat the sentence into your mic" : "Auto-scoring needs desktop Chrome"}
        >
          {listening ? "⏺ Listening… tap to stop" : "🎤 Score it"}
        </button>
      </div>

      {recorder.error ? <div style={{ fontSize: 12, opacity: 0.85 }}>⚠️ {recorder.error}</div> : null}

      {recorder.url ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="sidebar-btn small" onClick={playMine} style={{ width: "auto", fontSize: 12 }} title="Play your recording">
            ▶️ Hear me
          </button>
          <button className="sidebar-btn small" onClick={() => recorder.clear()} style={{ width: "auto", fontSize: 12 }} title="Retake">
            🗑️ Retake
          </button>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Compare: 🐢 model, then your take — {recorder.seconds}s clip, never uploaded.
          </span>
          <audio ref={audioRef} src={recorder.url} preload="auto" style={{ display: "none" }} />
        </div>
      ) : null}

      {!recorder.supported ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Recording needs a modern browser — {speechOK ? "scoring still works here." : "dictation still works everywhere."}
        </div>
      ) : null}
      {!speechOK ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>Auto-scoring (word hits) needs desktop Chrome — record &amp; compare works everywhere.</div>
      ) : null}

      {transcript ? (
        <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
          <div style={{ opacity: 0.8 }}>
            Heard: <i>&quot;{transcript}&quot;</i>
          </div>
          {rate !== null ? (
            <div style={{ fontWeight: 800, marginTop: 2 }}>
              {rate >= 0.8 ? "🌟 " : rate >= 0.5 ? "💪 " : "🍀 "}
              {Math.round(rate * 100)}% of key words ({want} to catch)
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
