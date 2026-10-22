-- Supabase table for learn state sync
create table if not exists learn_state_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz default now()
);

create index on learn_state_sync (updated_at desc);

alter table learn_state_sync enable row level security;

create policy "Users can CRUD their own learn state"
  on learn_state_sync for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function update_learn_state_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger update_learn_state_updated_at
  before update on learn_state_sync
  for each row execute function update_learn_state_updated_at();