-- Canary Gemma: member accounts (max 10), per-account chat history.
-- Run in Supabase Dashboard > SQL Editor (one-time).

-- 1. Profiles: one row per auth.users row, created automatically.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Chat sessions owned by a member.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sessions_user_updated_idx
  on public.sessions (user_id, updated_at desc);

-- 3. Messages inside a session.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx
  on public.messages (session_id, id);

-- 4. Auto-create profile on signup + enforce the 10-member cap.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from public.profiles) >= 10 then
    raise exception 'member-full';
  end if;
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. RLS: users touch only their own rows (server uses service_role and
-- bypasses RLS; these policies protect direct anon-key access).
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.messages enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id);

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all using (auth.uid() = user_id);

drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all using (
    auth.uid() = (select user_id from public.sessions where id = session_id)
  );

-- 6. Promote the owner (run after YOUR first signup, with your email):
-- update public.profiles set is_owner = true where email = 'you@example.com';
