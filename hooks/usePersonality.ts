"use client";

import { useCallback, useEffect, useState } from "react";
import { isPersonalityId } from "@/lib/personalities";

const PERSONALITY_KEY = "canary-personality";

/** Reply-style persona (localStorage only — no account needed). */
export function usePersonality() {
  const [personality, setPersonalityState] = useState("default");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSONALITY_KEY);
      if (isPersonalityId(stored)) setPersonalityState(stored);
    } catch {
      // storage unavailable — keep default
    }
  }, []);

  const setPersonality = useCallback((next: string) => {
    if (!isPersonalityId(next)) return;
    setPersonalityState(next);
    try {
      localStorage.setItem(PERSONALITY_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return { personality, setPersonality };
}
