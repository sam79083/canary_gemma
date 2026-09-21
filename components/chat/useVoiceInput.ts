"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type SpeechCtor = new () => SpeechRec;

function speechLang(lang: Lang): string {
  switch (lang) {
    case "ko": return "ko-KR";
    case "en": return "en-US";
    case "ja": return "ja-JP";
    case "zh": return "zh-CN";
    case "es": return "es-ES";
  }
}

export function useVoiceInput({
  input,
  setInput,
  lang,
  streaming,
}: {
  input: string;
  setInput: (v: string) => void;
  lang: Lang;
  streaming: boolean;
}) {
  const [speechOK, setSpeechOK] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SpeechRec | null>(null);
  const recogBase = useRef("");

  useEffect(() => {
    // Mount-gated: window sniffing during render would hydrate-mismatch.
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    setSpeechOK(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        // already stopped
      }
      recogRef.current = null;
    };
  }, []);

  const toggleVoice = useCallback(() => {
    if (recogRef.current) {
      try {
        recogRef.current.stop();
      } catch {
        // ignore
      }
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor || streaming) return;
    const rec = new Ctor();
    rec.lang = speechLang(lang);
    rec.interimResults = true;
    rec.continuous = false;
    recogBase.current = input;
    rec.onresult = (ev) => {
      let text = recogBase.current;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const alt = ev.results[i]?.[0];
        if (!alt) continue;
        text += (text && !text.endsWith(" ") ? " " : "") + alt.transcript;
      }
      setInput(text);
    };
    rec.onend = () => {
      recogRef.current = null;
      setListening(false);
    };
    rec.onerror = () => {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    };
    recogRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recogRef.current = null;
      setListening(false);
    }
  }, [input, setInput, lang, streaming]);

  return { speechOK, listening, toggleVoice };
}
