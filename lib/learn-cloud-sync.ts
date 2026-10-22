"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearnState } from "@/lib/learn-store";

function getSb(): SupabaseClient {
  return createBrowserClient();
}

export async function loadLearnStateFromCloud(userId: string): Promise<LearnState | null> {
  const sb = getSb();
  const { data, error } = await sb
    .from("learn_state_sync")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.state ?? null;
}

export async function saveLearnStateToCloud(userId: string, state: LearnState): Promise<void> {
  const sb = getSb();
  const { error } = await sb
    .from("learn_state_sync")
    .upsert({ user_id: userId, state }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function mergeLearnState(local: LearnState, cloud: LearnState | null): Promise<LearnState> {
  if (!cloud) return local;
  // Use existing merge logic from learn-sync.ts
  const { mergeLearnState } = await import("@/lib/learn-sync");
  return mergeLearnState(local, cloud);
}