"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PersonalVocab = {
  id: string;
  user_id: string;
  term: string;
  meaning: string;
  example?: string | null;
  tags: string[];
  source: string;
  difficulty: 1 | 2 | 3;
  created_at: string;
  updated_at: string;
};

function getSb(): SupabaseClient {
  return createBrowserClient();
}

export async function listPersonalVocab(
  userId: string,
  opts?: { tag?: string; search?: string; limit?: number; offset?: number }
): Promise<PersonalVocab[]> {
  const sb = getSb();
  let q = sb.from("personal_vocab").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (opts?.tag) q = q.contains("tags", [opts.tag]);
  if (opts?.search) q = q.ilike("term", `%${opts.search}%`);
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.offset) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createPersonalVocab(
  userId: string,
  payload: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at">
): Promise<PersonalVocab> {
  const sb = getSb();
  const { data, error } = await sb
    .from("personal_vocab")
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePersonalVocab(
  id: string,
  payload: Partial<Omit<PersonalVocab, "id" | "user_id" | "created_at">>
): Promise<PersonalVocab> {
  const sb = getSb();
  const { data, error } = await sb
    .from("personal_vocab")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePersonalVocab(id: string): Promise<void> {
  const sb = getSb();
  const { error } = await sb.from("personal_vocab").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertPersonalVocab(
  userId: string,
  payload: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at"> & { term: string }
): Promise<PersonalVocab> {
  const sb = getSb();
  const { data, error } = await sb
    .from("personal_vocab")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,term" })
    .select()
    .single();
  if (error) throw error;
  return data;
}