-- Canary Gemma: English Learning Mode, C2 tier.
-- Run in Supabase Dashboard > SQL Editor (one-time, after 004_learn_state.sql).
-- Extends the level check for the C2 exam-arena tier (constraint name is the
-- Postgres default {table}_{column}_check).

alter table public.learn_profiles
  drop constraint if exists learn_profiles_level_check;
alter table public.learn_profiles
  add constraint learn_profiles_level_check
  check (level in ('', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
