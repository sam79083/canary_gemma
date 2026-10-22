-- Supabase table for personal vocabulary (단어장)
create table if not exists personal_vocab (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null,
  meaning text not null,
  example text,
  tags text[] default '{}',
  source text default 'manual', -- manual, lesson, reading, idiom, etc.
  difficulty int default 1, -- 1=easy, 2=medium, 3=hard
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on personal_vocab (user_id, term);
create index on personal_vocab (user_id, created_at desc);
create index on personal_vocab (user_id, tags);

-- RLS
alter table personal_vocab enable row level security;

create policy "Users can CRUD their own vocab"
  on personal_vocab for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger for updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger update_personal_vocab_updated_at
  before update on personal_vocab
  for each row execute function update_updated_at();