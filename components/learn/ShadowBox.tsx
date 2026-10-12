"use client";

import { useEffect, useRef, useState } from "react";
import { contentWords, wordHitRate } from "@/lib/learn-listen";

/**
 * Shadowing: listen → repeat into the mic → word-hit score.
 * Plain Web Speech API, no deps; unsupported browsers get an honest note
 * instead of a dead button. Key by sentence to reset per round.
 */
export default function ShadowBox({
  sentence,
  onSpeak,
  onScore,
}: {
  sentence: string;
  onSpeak: () => void;
  onScore: (rate: number, transcript: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    try {
      const SR =
        (window as unknown as {
          SpeechRecognition?: new () => unknown;
          webkitSpeechRecognition?: new () => unknown;
        }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
      setSupported(!!SR);
    } catch {
      setSupported(false);
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

  const toggle = () => {
    if (listening) {
      try {
        recRef.current?.stop();
      } catch {
        // ignore
      }
      return;
    }
    try {
      const SR =
        (window as unknown as {
          SpeechRecognition?: new () => unknown;
          webkitSpeechRecognition?: new () => unknown;
        }).SpeechRecognition ??
        (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR() as unknown as {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
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

  const want = contentWords(sentence).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="sidebar-btn small" onClick={onSpeak} style={{ width: "auto" }} title="Hear it first">
          🔊 Listen
        </button>
        <button
          className="sidebar-btn small primary"
          onClick={toggle}
          disabled={!supported}
          style={{ flex: 1 }}
          title={supported ? "Repeat the sentence into your mic" : "Mic recognition needs desktop Chrome"}
        >
          {listening ? "⏺ Listening… tap to stop" : "🎤 Repeat it!"}
        </button>
      </div>
      {!supported ? (
        <div style={{ fontSize: 12, opacity: 0.7 }}>Mic scoring needs desktop Chrome — dictation still works everywhere.</div>
      ) : null}
      {transcript ? (
        <div style={{ fontSize: 13, background: "var(--border)", borderRadius: 6, padding: 8 }}>
          <div style={{ opacity: 0.8 }}>Heard: <i>"{transcript}"</i></div>
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
