"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { LearnState } from "@/lib/learn-store";
import { loadLearnStateFromCloud, saveLearnStateToCloud, mergeLearnState } from "@/lib/learn-cloud-sync";

export function useLearnCloudSync(
  localState: LearnState,
  setLocalState: (state: LearnState | ((prev: LearnState) => LearnState)) => void
) {
  const { user } = useAuth();
  const syncingRef = useRef(false);
  const lastSavedRef = useRef<string>("");
  const lastMergedRef = useRef<string>("");

  const userId = user?.id ?? null;
  const push = useCallback(async () => {
    if (!userId || syncingRef.current) return;
    try {
      syncingRef.current = true;
      await saveLearnStateToCloud(userId, localState);
      lastSavedRef.current = JSON.stringify(localState);
    } catch (e) {
      console.warn("Cloud save failed:", e);
    } finally {
      syncingRef.current = false;
    }
  }, [localState, userId]);

  const pull = useCallback(async () => {
    if (!userId || syncingRef.current) return;
    try {
      syncingRef.current = true;
      const cloud = await loadLearnStateFromCloud(userId);
      if (cloud) {
        const cloudKey = JSON.stringify(cloud);
        if (cloudKey !== lastMergedRef.current) {
          const merged = await mergeLearnState(localState, cloud);
          setLocalState(merged);
          lastMergedRef.current = cloudKey;
        }
      }
    } catch (e) {
      console.warn("Cloud load failed:", e);
    } finally {
      syncingRef.current = false;
    }
  }, [localState, userId]);

  // Initial pull on mount / user change
  useEffect(() => {
    pull();
  }, [pull]);

  // Auto-push on local changes (debounced)
  useEffect(() => {
    const key = JSON.stringify(localState);
    if (key === lastSavedRef.current) return;
    const timer = setTimeout(push, 2000);
    return () => clearTimeout(timer);
  }, [localState, push]);

  // Periodic pull
  useEffect(() => {
    const interval = setInterval(pull, 60_000);
    return () => clearInterval(interval);
  }, [pull]);

  return { push, pull };
}