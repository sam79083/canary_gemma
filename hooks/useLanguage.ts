"use client";

import { useCallback, useEffect, useState } from "react";
import { isLang, makeT, type Lang, type TFn } from "@/lib/i18n";

const LANG_KEY = "canary-lang";
export const DEFAULT_LANG: Lang = "ko";

/** First visit: guess from the browser, fall back to Korean. */
function detectBrowserLang(): Lang {
  try {
    const b = (navigator.language || "").toLowerCase();
    if (b.startsWith("ko")) return "ko";
    if (b.startsWith("en")) return "en";
    if (b.startsWith("ja")) return "ja";
    if (b.startsWith("zh")) return "zh";
    if (b.startsWith("es")) return "es";
    if (b.startsWith("fr")) return "fr";
    if (b.startsWith("de")) return "de";
    if (b.startsWith("pt")) return "pt";
    if (b.startsWith("vi")) return "vi";
    if (b.startsWith("id")) return "id";
  } catch {
    // ignore
  }
  return DEFAULT_LANG;
}

export function useLanguage(): { lang: Lang; setLang: (l: Lang) => void; t: TFn } {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (isLang(stored)) {
        setLangState(stored);
      } else {
        // First visit — adopt the browser language (Korean fallback).
        const detected = detectBrowserLang();
        setLangState(detected);
        localStorage.setItem(LANG_KEY, detected);
      }
    } catch {
      // storage unavailable — keep default
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  return { lang, setLang, t: makeT(lang) };
}
