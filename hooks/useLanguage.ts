"use client";

import { useCallback, useEffect, useState } from "react";
import { isLang, makeT, type Lang, type TFn } from "@/lib/i18n";

const LANG_KEY = "canary-lang";
export const DEFAULT_LANG: Lang = "ko";

/** Korean default. A stored choice (user-picked) wins; otherwise Korean —
 * no browser sniffing on startup. */
export function useLanguage(): { lang: Lang; setLang: (l: Lang) => void; t: TFn } {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (isLang(stored)) {
        setLangState(stored);
      } else {
        localStorage.setItem(LANG_KEY, DEFAULT_LANG);
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
