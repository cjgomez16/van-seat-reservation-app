-- ============================================================
--  Van Seat Reservation — full backend schema
--  Run once in the Supabase SQL editor (or via `supabase db push`).
--  Safe to re-run: idempotent where practical.
--
--  What this sets up:
--    - van_runs : fixed catalogue of the 8 van-runs (seeded)
--    - bookings : one row per group booking (with a public `ref`)
--    - seats_left : live seats-remaining view (counts only)
--    - book_seats() : ATOMIC booking, prevents overbooking
--    - find_booking() / update_booking() / cancel_booking() :
--        guest self-service, scoped to a known booking reference
--    - list_bookings() : organizer list, gated by a passcode
--    - Row-Level Security so the anon key can't read raw bookings
-- ============================================================

-- 1. Catalogue of van-runs -----------------------------------
create table if not exists van_runs (
  id          text primary key,          -- e.g. 'v1-t1'
  point_id    text not null,
  point_name  text not null,
  point_note  text not null,
  van_id      text not null,
  van_name    text not null,
  trip_id     text not null,
  trip_label  text not null,
  trip_time   text not null,
  capacity    int  not null default 10
);

-- 2. Bookings ------------------------------------------------
create table if not exists bookings (
  id           uuid primary key default gen_random_uuid(),
  ref          text unique not null,      -- shown to the guest, used for lookup
  run_id       text not null references van_runs(id),
  booker_name  text not null,
  booker_phone text not null,
  booker_email text,
  passengers   text[] not null,
  seats        int  not null,             -- = array_length(passengers, 1)
  created_at   timestamptz not null default now()
);
create index if not exists bookings_run_id_idx on bookings(run_id);

-- 3. Seed the 8 runs (idempotent) ----------------------------
--    Keep these in sync with src/config.js. Names/notes/times are
--    placeholders per the handoff — edit before launch.
insert into van_runs
  (id, point_id, point_name, point_note, van_id, van_name, trip_id, trip_label, trip_time)
values
  ('v1-t1','A','Pickup Point A','Hotel Lobby','v1','Van 1','t1','First Trip','11:15 – 11:30 AM'),
  ('v1-t2','A','Pickup Point A','Hotel Lobby','v1','Van 1','t2','Second Trip','12:15 – 12:30 PM'),
  ('v2-t1','A','Pickup Point A','Hotel Lobby','v2','Van 2','t1','First Trip','11:15 – 11:30 AM'),
  ('v2-t2','A','Pickup Point A','Hotel Lobby','v2','Van 2','t2','Second Trip','12:15 – 12:30 PM'),
  ('v3-t1','B','Pickup Point B','Church Courtyard','v3','Van 3','t1','First Trip','11:15 – 11:30 AM'),
  ('v3-t2','B','Pickup Point B','Church Courtyard','v3','Van 3','t2','Second Trip','12:15 – 12:30 PM'),
  ('v4-t1','B','Pickup Point B','Church Courtyard','v4','Van 4','t1','First Trip','11:15 – 11:30 AM'),
  ('v4-t2','B','Pickup Point B','Church Courtyard','v4','Van 4','t2','Second Trip','12:15 – 12:30 PM')
on conflict (id) do nothing;

-- 4. Live seats-left view (aggregate counts only, no personal data) ----
create or replace view seats_left as
select
  r.id                                   as run_id,
  r.capacity,
  r.capacity - coalesce(sum(b.seats), 0) as left
from van_runs r
left join bookings b on b.run_id = r.id
group by r.id, r.capacity;

-- 5. Organizer passcode -------------------------------------
--    Single-row table. Set the passcode privately AFTER running this
--    file (do NOT commit the value):
--      insert into admin_config (id, passcode) values (1, 'your-secret')
--      on conflict (id) do update set passcode = excluded.passcode;
create table if not exists admin_config (
  id       int primary key default 1,
  passcode text not null,
  constraint admin_config_singleton check (id = 1)
);

-- 6. Helpers ------------------------------------------------
-- Per-booker cap. Keep in sync with MAX_PER_BOOKER in src/config.js.
-- 10 = the run capacity, so it imposes no extra limit.
create or replace function _max_per_booker() returns int
language sql immutable as $$ select 10 $$;

-- Generate a unique, human-friendly booking reference.
create or replace function gen_booking_ref() returns text
language plpgsql as $$
declare
  v_ref text;
begin
  loop
    v_ref := 'VAN-' || upper(substr(md5(random()::text), 1, 5));
    exit when not exists (select 1 from bookings where ref = v_ref);
  end loop;
  return v_ref;
end;
$$;

-- 7. Atomic booking (prevents overbooking) ------------------
--    Locks the run row so concurrent bookings serialize.
create or replace function book_seats(
  p_run_id       text,
  p_booker_name  text,
  p_booker_phone text,
  p_booker_email text,
  p_passengers   text[]
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap    int;
  v_taken  int;
  v_seats  int := array_length(p_passengers, 1);
  v_row    bookings;
begin
  if v_seats is null or v_seats < 1 then
    raise exception 'NO_PASSENGERS';
  end if;
  if v_seats > _max_per_booker() then
    raise exception 'OVER_BOOKER_CAP: % max', _max_per_booker();
  end if;

  select capacity into v_cap from van_runs where id = p_run_id for update;
  if v_cap is null then
    raise exception 'RUN_NOT_FOUND';
  end if;

  select coalesce(sum(seats), 0) into v_taken from bookings where run_id = p_run_id;
  if v_taken + v_seats > v_cap then
    raise exception 'NOT_ENOUGH_SEATS: % left', v_cap - v_taken;
  end if;

  insert into bookings (ref, run_id, booker_name, booker_phone, booker_email, passengers, seats)
  values (gen_booking_ref(), p_run_id, p_booker_name, p_booker_phone,
          nullif(p_booker_email, ''), p_passengers, v_seats)
  returning * into v_row;

  return v_row;
end;
$$;

-- 8. Guest self-service (scoped to a known reference) -------
create or replace function find_booking(p_ref text) returns bookings
language sql
security definer
set search_path = public
as $$
  select * from bookings where ref = upper(trim(p_ref)) limit 1;
$$;

create or replace function update_booking(
  p_ref          text,
  p_booker_name  text,
  p_booker_phone text,
  p_booker_email text,
  p_passengers   text[]
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref   text := upper(trim(p_ref));
  v_run   text;
  v_cap   int;
  v_taken int;
  v_seats int := array_length(p_passengers, 1);
  v_row   bookings;
begin
  if v_seats is null or v_seats < 1 then
    raise exception 'NO_PASSENGERS';
  end if;
  if v_seats > _max_per_booker() then
    raise exception 'OVER_BOOKER_CAP: % max', _max_per_booker();
  end if;

  select run_id into v_run from bookings where ref = v_ref;
  if v_run is null then
    raise exception 'NOT_FOUND';
  end if;

  select capacity into v_cap from van_runs where id = v_run for update;
  -- exclude this booking's own seats from the taken count
  select coalesce(sum(seats), 0) into v_taken
    from bookings where run_id = v_run and ref <> v_ref;
  if v_taken + v_seats > v_cap then
    raise exception 'NOT_ENOUGH_SEATS: % left', v_cap - v_taken;
  end if;

  update bookings set
    booker_name  = p_booker_name,
    booker_phone = p_booker_phone,
    booker_email = nullif(p_booker_email, ''),
    passengers   = p_passengers,
    seats        = v_seats
  where ref = v_ref
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function cancel_booking(p_ref text) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  delete from bookings where ref = upper(trim(p_ref));
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'NOT_FOUND';
  end if;
  return true;
end;
$$;

-- 9. Organizer list (passcode-gated) ------------------------
create or replace function list_bookings(p_passcode text) returns setof bookings
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_passcode is null
     or p_passcode <> coalesce((select passcode from admin_config where id = 1), '\x00') then
    raise exception 'FORBIDDEN';
  end if;
  return query select * from bookings order by run_id, created_at;
end;
$$;

-- 10. Row-Level Security ------------------------------------
alter table van_runs     enable row level security;
alter table bookings     enable row level security;
alter table admin_config enable row level security;

-- Anyone may read the run catalogue.
drop policy if exists "read runs" on van_runs;
create policy "read runs" on van_runs for select using (true);

-- No policies on bookings / admin_config => the anon key gets NO direct
-- row access. All reads/writes go through the SECURITY DEFINER functions,
-- which run as the function owner and bypass RLS in a controlled way.

-- 11. Grants ------------------------------------------------
grant select on van_runs   to anon, authenticated;
grant select on seats_left to anon, authenticated;

grant execute on function book_seats(text, text, text, text, text[]) to anon, authenticated;
grant execute on function find_booking(text)                          to anon, authenticated;
grant execute on function update_booking(text, text, text, text, text[]) to anon, authenticated;
grant execute on function cancel_booking(text)                        to anon, authenticated;
grant execute on function list_bookings(text)                         to anon, authenticated;
