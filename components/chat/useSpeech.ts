// Read-aloud (TTS) via the built-in browser speech engine — free,
// on-device voices, no API key. One utterance at a time.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { toSpokenText } from "@/lib/markdown";
import { speechLang } from "@/components/chat/useVoiceInput";

interface SpeechVoice {
  lang: string;
  name: string;
}

function pickVoice(lang: Lang): SpeechVoice | null {
  try {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    if (voices.length === 0) return null;
    const want = speechLang(lang).toLowerCase();
    const prefix = want.split("-")[0];
    return (
      voices.find((v) => v.lang.toLowerCase() === want) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
      null
    );
  } catch {
    return null;
  }
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  /** Message index currently being read (null = silent). */
  const [speakingKey, setSpeakingKey] = useState<number | null>(null);
  const keyRef = useRef<number | null>(null);

  useEffect(() => {
    let ok = false;
    try {
      ok = "speechSynthesis" in window;
    } catch {
      ok = false;
    }
    setSupported(ok);
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      keyRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    keyRef.current = null;
    setSpeakingKey(null);
  }, []);

  const speak = useCallback(
    (key: number, markdown: string, lang: Lang) => {
      const text = toSpokenText(markdown);
      if (!text) return;
      try {
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = speechLang(lang);
        const voice = pickVoice(lang);
        if (voice) {
          const real = synth
            .getVoices()
            .find((v) => v.name === voice.name && v.lang === voice.lang);
          if (real) u.voice = real;
        }
        u.rate = 1;
        const done = () => {
          if (keyRef.current === key) {
            keyRef.current = null;
            setSpeakingKey(null);
          }
        };
        u.onend = done;
        u.onerror = done;
        keyRef.current = key;
        setSpeakingKey(key);
        synth.speak(u);
      } catch {
        keyRef.current = null;
        setSpeakingKey(null);
      }
    },
    [],
  );

  return { supported, speakingKey, speak, stop };
}

export type SpeechApi = ReturnType<typeof useSpeech>;
