"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPreferences, savePreferences } from "@/lib/preferences";

// Device-local mirror of the AI instructions (source of truth for
// visitors; members sync this with Supabase — see below).
const INSTR_KEY = "canary-custom-instructions";
const MAX_LEN = 2000;

export interface InstructionSaveState {
  status: "saved" | "dirty" | "saving" | "error";
  /** Where the last confirmed save landed. */
  scope: "device" | "account";
  /** Last change/confirmation time (null = untouched this session). */
  at: number | null;
}

/**
 * User-written standing guidelines for the AI. Visitors keep them in
 * localStorage; members sync per-account via Supabase (server wins on
 * login, the local copy is pushed up when the server row is still empty,
 * logged-out falls back to the device copy). saveState drives the
 * "saved / syncing / failed" line so autosave never feels silent.
 */
export function useCustomInstructions(member: boolean) {
  const [customInstructions, setCustomInstructionsState] = useState("");
  const [saveState, setSaveState] = useState<InstructionSaveState>(() => ({
    status: "saved",
    scope: member ? "account" : "device",
    at: null,
  }));
  const memberPrevRef = useRef(member);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef("");

  useEffect(() => {
    textRef.current = customInstructions;
  }, [customInstructions]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(INSTR_KEY);
      if (typeof stored === "string" && stored)
        setCustomInstructionsState(stored.slice(0, MAX_LEN));
    } catch {
      // storage unavailable — keep default
    }
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const pushToServer = useCallback(async (clean: string) => {
    setSaveState((s) => ({ ...s, status: "saving", scope: "account" }));
    try {
      await savePreferences(clean);
      setSaveState({ status: "saved", scope: "account", at: Date.now() });
    } catch (e) {
      console.error("Auto-save instructions failed:", e);
      setSaveState({ status: "error", scope: "account", at: Date.now() });
    }
  }, []);

  const retrySave = useCallback(() => {
    void pushToServer(textRef.current);
  }, [pushToServer]);

  const setCustomInstructions = useCallback(
    (next: string) => {
      const clean = next.slice(0, MAX_LEN);
      setCustomInstructionsState(clean);
      try {
        if (clean) localStorage.setItem(INSTR_KEY, clean);
        else localStorage.removeItem(INSTR_KEY);
      } catch {
        // ignore
      }
      if (member) {
        // Members persist per-account (debounced — typing shouldn't spam PUTs).
        setSaveState({ status: "dirty", scope: "account", at: Date.now() });
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void pushToServer(clean);
        }, 800);
      } else {
        setSaveState({ status: "saved", scope: "device", at: Date.now() });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [member, pushToServer],
  );

  useEffect(() => {
    const was = memberPrevRef.current;
    memberPrevRef.current = member;
    if (!member) {
      if (was) {
        // Logged out: fall back to the device-local copy.
        try {
          setCustomInstructionsState(
            (localStorage.getItem(INSTR_KEY) ?? "").slice(0, MAX_LEN),
          );
        } catch {
          // keep current text
        }
        setSaveState({ status: "saved", scope: "device", at: Date.now() });
      }
      return;
    }
    if (was) return;
    // Just logged in: server wins; push the local copy up when the
    // server row is still empty so nothing typed as a visitor is lost.
    void (async () => {
      let server = "";
      try {
        server = await loadPreferences();
      } catch {
        return; // backend unreachable — keep the local copy
      }
      if (server) {
        setCustomInstructionsState(server);
        try {
          localStorage.setItem(INSTR_KEY, server);
        } catch {
          // ignore
        }
        setSaveState({ status: "saved", scope: "account", at: Date.now() });
      } else {
        try {
          const local = localStorage.getItem(INSTR_KEY) ?? "";
          if (local.trim()) await pushToServer(local.slice(0, MAX_LEN));
        } catch {
          // keep the local copy
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, pushToServer]);

  return { customInstructions, setCustomInstructions, saveState, retrySave };
}
