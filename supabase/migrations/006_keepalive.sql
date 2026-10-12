-- Canary Gemma: keepalive against the free-tier 7-day pause.
-- Run in Supabase Dashboard > SQL Editor (one-time, after 005_learn_c2.sql).
--
-- Supabase pauses free projects after 7 days without Postgres queries
-- (Auth-only traffic does NOT count). A scheduled GitHub Actions workflow
-- (.github/workflows/supabase-keepalive.yml) SELECTs this single row twice
-- a week with the SERVICE_ROLE key, which resets the inactivity clock.
--
-- Least privilege: RLS is on with NO anon/authenticated policies, so only
-- the service_role key (used by the cron, kept in GitHub Secrets) can read
-- it. The app's anon-key client cannot see this table at all.

create table if not exists public.keepalive (
  id int primary key,
  pinged_at timestamptz not null default now()
);

insert into public.keepalive (id) values (1)
on conflict (id) do nothing;

alter table public.keepalive enable row level security;
