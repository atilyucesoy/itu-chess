-- Run once in the Supabase SQL editor. Never expose the service-role key to the browser.
create table if not exists public.club_state (
  id integer primary key check (id = 1),
  revision integer not null default 0,
  state jsonb not null
);
alter table public.club_state enable row level security;
revoke all on public.club_state from anon, authenticated;
insert into public.club_state(id, state) values (1,
  '{"players":[],"tournaments":[],"overrides":[],"audit":[],"managers":[],"policy":{"reference":1500,"initialMethod":"performance","provisionalGames":30,"provisionalK":40,"establishedK":20}}'
) on conflict do nothing;
create or replace function public.save_club_state(expected_revision integer, new_state jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update public.club_state set state = new_state, revision = revision + 1
    where id = 1 and revision = expected_revision;
  return found;
end;
$$;
revoke all on function public.save_club_state(integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_club_state(integer, jsonb) to service_role;
grant all on public.club_state to service_role;
