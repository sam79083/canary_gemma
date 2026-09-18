-- Canary Gemma: per-member preferences (custom AI instructions).
-- Run in Supabase Dashboard > SQL Editor (one-time, after 001_members.sql).

-- 1. Preferences: one row per member, created on first save (upsert).
create table if not exists public.preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  custom_instructions text not null default '',
  updated_at timestamptz not null default now()
);

-- 2. RLS: users touch only their own row (server uses the anon key with
-- the caller's cookies, so RLS is enforced; same pattern as sessions).
alter table public.preferences enable row level security;

drop policy if exists "own preferences" on public.preferences;
create policy "own preferences" on public.preferences
  for all using (auth.uid() = user_id);
