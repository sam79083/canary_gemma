"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_KEY, isTheme, type Theme } from "@/lib/theme";

/** App theme (body dataset + localStorage). Shared by chat + settings. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (isTheme(stored)) setThemeState(stored);
    } catch {
      // storage unavailable — keep default
    }
  }, []);

  useEffect(() => {
    document.body.classList.remove("dark");
    document.body.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return { theme, setTheme };
}
