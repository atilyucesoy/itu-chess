begin;

-- The visitor API reads only this table. Club state and publishing helpers
-- remain unavailable to both client roles.
create schema itu_chess_publication;
revoke all on schema itu_chess_publication from public, anon, authenticated;
grant usage on schema itu_chess_publication to service_role;

create table public.club_publication (
  id integer primary key check (id = 1),
  revision integer not null,
  state jsonb not null
);

alter table public.club_publication enable row level security;
revoke all on table public.club_publication from public, anon, authenticated, service_role;
grant select on table public.club_publication to anon, authenticated;
grant select, insert, update, delete on table public.club_publication to service_role;

create policy read_club_publication on public.club_publication
  for select to anon, authenticated using (id = 1);

create function itu_chess_publication.pick(source jsonb, variadic fields text[])
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(source) = 'object' then source else '{}'::jsonb end)
  where key = any(fields)
$$;

create function itu_chess_publication.items(source jsonb)
returns setof jsonb language sql immutable set search_path = pg_catalog as $$
  select value
  from jsonb_array_elements(case when jsonb_typeof(source) = 'array' then source else '[]'::jsonb end)
$$;

create function itu_chess_publication.rating_policy(source jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select itu_chess_publication.pick(source,
    'reference', 'initialMethod', 'provisionalGames', 'provisionalK',
    'establishedK', 'initialPerformanceCapEnabled', 'initialPerformanceCap')
$$;

create function itu_chess_publication.visitor_state(source jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'activeSemester', source -> 'activeSemester',
    'semesters', coalesce(source -> 'semesters', '[]'::jsonb),
    'policy', itu_chess_publication.rating_policy(source -> 'policy'),
    'players', coalesce((
      select jsonb_agg(itu_chess_publication.pick(p.value,
        'id', 'name', 'official', 'officialType', 'itu', 'games') order by p.position)
      from itu_chess_publication.items(source -> 'players') with ordinality as p(value, position)
      where p.value ->> 'archivedAt' is null
    ), '[]'::jsonb),
    'tournaments', coalesce((
      select jsonb_agg(itu_chess_publication.pick(t.value,
        'id', 'name', 'date', 'semester', 'roundsPlanned', 'timeControl', 'variant',
        'countsPoints', 'countsRating', 'status', 'initialColor', 'finalizedAt', 'lotOrder', 'createdAt')
        || jsonb_build_object(
          'policy', itu_chess_publication.rating_policy(t.value -> 'policy'),
          'entries', coalesce((
            select jsonb_agg(itu_chess_publication.pick(e.value,
              'playerId', 'name', 'official', 'officialType', 'itu', 'seed', 'number', 'withdrawn', 'joinedRound')
              order by e.position)
            from itu_chess_publication.items(t.value -> 'entries') with ordinality as e(value, position)
          ), '[]'::jsonb),
          'rounds', coalesce((
            select jsonb_agg(itu_chess_publication.pick(r.value, 'number')
              || jsonb_build_object(
                'trf', '',
                'engine', '',
                'games', coalesce((
                  select jsonb_agg(itu_chess_publication.pick(g.value, 'board', 'white', 'black', 'result')
                    order by g.position)
                  from itu_chess_publication.items(r.value -> 'games') with ordinality as g(value, position)
                ), '[]'::jsonb)
              ) order by r.position)
            from itu_chess_publication.items(t.value -> 'rounds') with ordinality as r(value, position)
          ), '[]'::jsonb),
          'ratingChanges', '[]'::jsonb
        ) order by t.position)
      from itu_chess_publication.items(source -> 'tournaments') with ordinality as t(value, position)
    ), '[]'::jsonb),
    'overrides', '[]'::jsonb,
    'audit', '[]'::jsonb
  )
$$;

create function itu_chess_publication.refresh()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then
    delete from public.club_publication where id = old.id;
    return old;
  end if;

  insert into public.club_publication(id, revision, state)
  values (new.id, new.revision, itu_chess_publication.visitor_state(new.state))
  on conflict (id) do update set revision = excluded.revision, state = excluded.state;
  return new;
end
$$;

revoke execute on all functions in schema itu_chess_publication from public, anon, authenticated;
grant execute on all functions in schema itu_chess_publication to service_role;

create trigger refresh_club_publication
  after insert or update of state or delete on public.club_state
  for each row execute function itu_chess_publication.refresh();

insert into public.club_publication(id, revision, state)
select id, revision, itu_chess_publication.visitor_state(state)
from public.club_state where id = 1;

commit;
