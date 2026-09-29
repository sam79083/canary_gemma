// Read-aloud (TTS) via the built-in browser speech engine — free,
// on-device voices, no API key. One message at a time, split into short
// chunks so long texts aren't cut off mid-way.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { toSpokenText } from "@/lib/markdown";
import {
  detectSpeechLang,
  pickSpeechVoice,
  speechLang,
  splitSpeechChunks,
} from "@/lib/speech";

/** Resolve once voices are loaded (Chrome fills the list asynchronously). */
function awaitVoices(timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (synth.getVoices().length > 0) {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          synth.removeEventListener("voiceschanged", finish);
        } catch {
          // ignore
        }
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      synth.addEventListener("voiceschanged", finish);
    } catch {
      resolve();
    }
  });
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  /** Message index currently being read (null = silent). */
  const [speakingKey, setSpeakingKey] = useState<number | null>(null);
  const keyRef = useRef<number | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    let ok = false;
    try {
      ok = "speechSynthesis" in window;
    } catch {
      ok = false;
    }
    setSupported(ok);
    if (!ok) return;
    // Warm the voice list early: Chrome populates it asynchronously, so a
    // first click often saw an empty list and fell back to the wrong voice.
    const load = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices();
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
    return () => {
      try {
        window.speechSynthesis.removeEventListener("voiceschanged", load);
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
      keyRef.current = key;
      setSpeakingKey(key);
      void (async () => {
        const done = () => {
          if (keyRef.current === key) {
            keyRef.current = null;
            setSpeakingKey(null);
          }
        };
        try {
          const synth = window.speechSynthesis;
          synth.cancel();
          // Wait (bounded) for the voice list — otherwise Korean falls
          // back to the default, usually English, voice.
          await awaitVoices();
          if (keyRef.current !== key) return;
          try {
            voicesRef.current = synth.getVoices();
          } catch {
            // keep warmed list
          }
          const chunks = splitSpeechChunks(text);
          chunks.forEach((part, i) => {
            // Voice follows the chunk's own language, never the UI
            // language: the top picker only switches UI text.
            const chunkLang = detectSpeechLang(part, lang);
            const voice = pickSpeechVoice(voicesRef.current, chunkLang);
            const u = new SpeechSynthesisUtterance(part);
            u.lang = speechLang(chunkLang);
            if (voice) {
              const real = voicesRef.current.find(
                (v) => v.name === voice.name && v.lang === voice.lang,
              );
              if (real) u.voice = real;
            }
            u.rate = 1;
            if (i === chunks.length - 1) {
              u.onend = done;
              u.onerror = done;
            }
            synth.speak(u);
          });
        } catch {
          done();
        }
      })();
    },
    [],
  );

  return { supported, speakingKey, speak, stop };
}

export type SpeechApi = ReturnType<typeof useSpeech>;
