-- Canary Gemma: English Learning Mode (free-tier safe).
-- Run in Supabase Dashboard > SQL Editor (one-time, after 002_preferences.sql).
--
-- Cost design: 1 row/user in learn_profiles + 1 row/user/DAY in learn_days.
-- A 10-member app writes ~3.6k tiny rows/year. No per-question rows, no
-- realtime, no storage — stays far under the 500MB / 5GB free quotas.
-- Guests use localStorage only (lib/learn-store.ts) and never touch these.

-- 1. Per-member headline stats for the global leaderboard.
create table if not exists public.learn_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nickname text not null default '',
  xp integer not null default 0 check (xp >= 0),
  level text not null default '' check (level in ('', 'A1', 'A2', 'B1', 'B2')),
  updated_at timestamptz not null default now()
);

-- 2. One aggregate row per user per day (upsert from the client).
create table if not exists public.learn_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  xp integer not null default 0 check (xp >= 0),
  lessons integer not null default 0 check (lessons >= 0),
  correct integer not null default 0 check (correct >= 0),
  asked integer not null default 0 check (asked >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists learn_days_day_xp_idx
  on public.learn_days (day desc, xp desc);
create index if not exists learn_profiles_xp_idx
  on public.learn_profiles (xp desc);

-- 3. RLS: members read everyone's board, write only their own rows
-- (server uses service_role and bypasses RLS; anon-key access is scoped here).
alter table public.learn_profiles enable row level security;
alter table public.learn_days enable row level security;

drop policy if exists "board readable" on public.learn_profiles;
create policy "board readable" on public.learn_profiles
  for select using (true);

drop policy if exists "own learn profile" on public.learn_profiles;
create policy "own learn profile" on public.learn_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "board days readable" on public.learn_days;
create policy "board days readable" on public.learn_days
  for select using (true);

drop policy if exists "own learn days" on public.learn_days;
create policy "own learn days" on public.learn_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
