-- Canary Gemma: English Learning Mode, per-member cloud save (free-tier safe).
-- Run in Supabase Dashboard > SQL Editor (one-time, after 003_learn.sql).
--
-- learn_state holds ONE small JSONB row per member (level, XP, per-skill
-- stats, per-day aggregates, SRS cards — typically 2–20 KB). Guests keep
-- using localStorage only and never touch this table.

-- 1. Extend the level check for the C1 tier (constraint name is the
-- Postgres default {table}_{column}_check).
alter table public.learn_profiles
  drop constraint if exists learn_profiles_level_check;
alter table public.learn_profiles
  add constraint learn_profiles_level_check
  check (level in ('', 'A1', 'A2', 'B1', 'B2', 'C1'));

-- 2. Whole learning progress, one row per member (upsert from the client).
create table if not exists public.learn_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. RLS: members write only their own row (server uses service_role and
-- bypasses RLS; this scopes direct anon-key access).
alter table public.learn_state enable row level security;

drop policy if exists "own learn state" on public.learn_state;
create policy "own learn state" on public.learn_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
