-- Dagräknare: vanor, dagposter och widget-nyckel.
--
-- Körs för hand i Supabase Studio (SQL Editor). Mappen ligger medvetet under
-- dagraknare/ och inte i repots supabase/migrations/, så att Matlistans
-- migrate.yml aldrig kör den. Filen är idempotent och kan köras om.

-- ── Vanor ───────────────────────────────────────────────────────────────
create table if not exists public.habits (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  start_date    date not null,
  goal          integer not null default 100 check (goal between 1 and 10000),
  goal_mode     text not null default 'streak' check (goal_mode in ('streak', 'total')),
  color         text not null default '#1c7c5d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  rollover_hour smallint not null default 0 check (rollover_hour between 0 and 6),
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  -- Klientens ändringstid. Den som är nyast vinner vid synk (se upsert_habits).
  updated_at    timestamptz not null default now(),
  -- Serverns tid, sätts av triggern. Klienten hämtar bara rader nyare än sist.
  server_ts     timestamptz not null default now()
);

-- ── Dagposter: en rad per vana och dag ──────────────────────────────────
-- 'none' lagras med flit. Att rensa en dag är en ändring som ska nå andra
-- enheter; en raderad rad hade inte gjort det.
create table if not exists public.habit_days (
  habit_id   uuid not null references public.habits (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  status     text not null check (status in ('done', 'miss', 'none')),
  updated_at timestamptz not null default now(),
  server_ts  timestamptz not null default now(),
  primary key (habit_id, day)
);

create index if not exists habits_user_ts_idx on public.habits (user_id, server_ts);
create index if not exists habit_days_user_ts_idx on public.habit_days (user_id, server_ts);

create or replace function public.habit_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.server_ts := now();
  return new;
end $$;

drop trigger if exists habits_touch on public.habits;
create trigger habits_touch before insert or update on public.habits
  for each row execute function public.habit_touch();

drop trigger if exists habit_days_touch on public.habit_days;
create trigger habit_days_touch before insert or update on public.habit_days
  for each row execute function public.habit_touch();

-- ── Widget-nyckel ───────────────────────────────────────────────────────
-- Scriptable-widgeten loggar inte in. Den visar sin data med en lång slumpad
-- nyckel och kan bara LÄSA. Byts nyckeln slutar den gamla fungera direkt.
create table if not exists public.habit_widget_tokens (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.habits enable row level security;
alter table public.habit_days enable row level security;
alter table public.habit_widget_tokens enable row level security;

drop policy if exists "habits: egna" on public.habits;
create policy "habits: egna" on public.habits
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- WITH CHECK-ledet på habit_id hindrar att en dagpost hängs på någon annans vana.
drop policy if exists "habit_days: egna" on public.habit_days;
create policy "habit_days: egna" on public.habit_days
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and habit_id in (select id from public.habits where user_id = auth.uid())
  );

drop policy if exists "habit_widget_tokens: egen" on public.habit_widget_tokens;
create policy "habit_widget_tokens: egen" on public.habit_widget_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Synk: nyast vinner ──────────────────────────────────────────────────
-- security invoker (standard): RLS gäller även här. En rad vars id tillhör
-- någon annan får UPDATE nekad och hela anropet misslyckas.
create or replace function public.upsert_habits(rows jsonb) returns void
language plpgsql set search_path = public as $$
begin
  insert into public.habits as h (id, user_id, name, start_date, goal, goal_mode, color, rollover_hour, archived, created_at, updated_at)
  select (r->>'id')::uuid, auth.uid(), r->>'name', (r->>'start_date')::date, (r->>'goal')::int,
         r->>'goal_mode', r->>'color', (r->>'rollover_hour')::smallint, (r->>'archived')::boolean,
         (r->>'created_at')::timestamptz, (r->>'updated_at')::timestamptz
  from jsonb_array_elements(rows) r
  on conflict (id) do update set
    name = excluded.name, start_date = excluded.start_date, goal = excluded.goal,
    goal_mode = excluded.goal_mode, color = excluded.color, rollover_hour = excluded.rollover_hour,
    archived = excluded.archived, updated_at = excluded.updated_at
  where excluded.updated_at > h.updated_at;
end $$;

create or replace function public.upsert_habit_days(rows jsonb) returns void
language plpgsql set search_path = public as $$
begin
  insert into public.habit_days as d (habit_id, user_id, day, status, updated_at)
  select (r->>'habit_id')::uuid, auth.uid(), (r->>'day')::date, r->>'status', (r->>'updated_at')::timestamptz
  from jsonb_array_elements(rows) r
  on conflict (habit_id, day) do update set
    status = excluded.status, updated_at = excluded.updated_at
  where excluded.updated_at > d.updated_at;
end $$;

revoke all on function public.upsert_habits(jsonb) from public, anon;
revoke all on function public.upsert_habit_days(jsonb) from public, anon;
grant execute on function public.upsert_habits(jsonb) to authenticated;
grant execute on function public.upsert_habit_days(jsonb) to authenticated;

-- ── Widgetens läsning ───────────────────────────────────────────────────
-- security definer eftersom anropet är anonymt. Returnerar bara data för den
-- som äger nyckeln, och bara icke-arkiverade vanor. Dagar skickas som två
-- datumlistor per vana för att hålla svaret litet.
create or replace function public.habit_widget(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with u as (select user_id from public.habit_widget_tokens where token = p_token),
  h as (
    select * from public.habits
    where user_id = (select user_id from u) and not archived
  )
  select case when exists (select 1 from u) then jsonb_build_object(
    'habits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'startDate', start_date, 'goal', goal,
        'goalMode', goal_mode, 'color', color, 'rolloverHour', rollover_hour
      ) order by created_at) from h), '[]'::jsonb),
    'days', coalesce((
      select jsonb_object_agg(habit_id, d) from (
        select habit_id, jsonb_build_object(
          'done', coalesce(jsonb_agg(day order by day) filter (where status = 'done'), '[]'::jsonb),
          'miss', coalesce(jsonb_agg(day order by day) filter (where status = 'miss'), '[]'::jsonb)
        ) as d
        from public.habit_days
        where habit_id in (select id from h) and status <> 'none'
        group by habit_id
      ) x), '{}'::jsonb)
  ) else null end;
$$;

revoke all on function public.habit_widget(uuid) from public;
grant execute on function public.habit_widget(uuid) to anon, authenticated;
