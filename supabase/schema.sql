create table if not exists public.timeblock_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.timeblock_states enable row level security;

revoke all on table public.timeblock_states from anon;
grant select, insert, update on table public.timeblock_states to authenticated;

drop policy if exists "Users can read their own Timeblock state" on public.timeblock_states;
create policy "Users can read their own Timeblock state"
on public.timeblock_states for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own Timeblock state" on public.timeblock_states;
create policy "Users can insert their own Timeblock state"
on public.timeblock_states for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Timeblock state" on public.timeblock_states;
create policy "Users can update their own Timeblock state"
on public.timeblock_states for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.set_timeblock_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_timeblock_updated_at on public.timeblock_states;
create trigger set_timeblock_updated_at
before update on public.timeblock_states
for each row execute function public.set_timeblock_updated_at();
