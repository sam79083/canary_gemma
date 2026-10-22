"use client";

import { useCallback, useEffect, useState } from "react";
import type { PersonalVocab } from "@/lib/personal-vocab";
import {
  listPersonalVocab,
  createPersonalVocab,
  updatePersonalVocab,
  deletePersonalVocab,
  upsertPersonalVocab,
} from "@/lib/personal-vocab";

export function usePersonalVocab(userId: string | null, tag?: string): {
  items: PersonalVocab[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (v: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at">) => Promise<PersonalVocab>;
  upsert: (v: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at"> & { term: string }) => Promise<PersonalVocab>;
  update: (id: string, patch: Partial<PersonalVocab>) => Promise<PersonalVocab>;
  remove: (id: string) => Promise<void>;
} {
  const [items, setItems] = useState<PersonalVocab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await listPersonalVocab(userId, { tag, limit: 200 });
      setItems(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vocab");
    } finally {
      setLoading(false);
    }
  }, [userId, tag]);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (v: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at">) => {
    if (!userId) throw new Error("Not signed in");
    const created = await createPersonalVocab(userId, v);
    setItems((prev) => [created, ...prev]);
    return created;
  }, [userId]);

  const upsert = useCallback(async (v: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at"> & { term: string }) => {
    if (!userId) throw new Error("Not signed in");
    const created = await upsertPersonalVocab(userId, v);
    setItems((prev) => {
      const i = prev.findIndex((x) => x.term === v.term);
      if (i >= 0) { const n = [...prev]; n[i] = created; return n; }
      return [created, ...prev];
    });
    return created;
  }, [userId]);

  const update = useCallback(async (id: string, patch: Partial<PersonalVocab>) => {
    const updated = await updatePersonalVocab(id, patch);
    setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deletePersonalVocab(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return { items, loading, error, refresh: load, add, upsert, update, remove } satisfies {
  items: PersonalVocab[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (v: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at">) => Promise<PersonalVocab>;
  upsert: (v: Omit<PersonalVocab, "id" | "user_id" | "created_at" | "updated_at"> & { term: string }) => Promise<PersonalVocab>;
  update: (id: string, patch: Partial<PersonalVocab>) => Promise<PersonalVocab>;
  remove: (id: string) => Promise<void>;
};
}