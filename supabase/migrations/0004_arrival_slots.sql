-- ============================================================
--  0004 — Arrival becomes time-slot based.
--  Guests pick a pickup TIME and type their own pickup LOCATION; the head
--  driver assigns each booking to a van afterward. After-party is unchanged.
--  Run once in the Supabase SQL editor (after 0001–0003).
--
--  Safe on a clean bookings table. If you have live arrival bookings against
--  the old v1..v4 runs, cancel/migrate them first (the delete below is FK-guarded).
-- ============================================================

-- 1. New booking columns -------------------------------------
alter table bookings add column if not exists pickup_location text;
alter table bookings add column if not exists assigned_van   text;

-- 2. Replace the 8 arrival van-runs with two time-slot runs (capacity 40 each)
delete from van_runs where van_id in ('v1', 'v2', 'v3', 'v4');

insert into van_runs
  (id, point_id, point_name, point_note, van_id, van_name, trip_id, trip_label, trip_time, capacity)
values
  ('arr-115','ARR','Arrival','Guest pickup in town','arr','Arrival','arr-115','First pickup','1:15 PM', 40),
  ('arr-145','ARR','Arrival','Guest pickup in town','arr','Arrival','arr-145','Second pickup','1:45 PM', 40)
on conflict (id) do update
  set trip_label = excluded.trip_label,
      trip_time  = excluded.trip_time,
      capacity   = excluded.capacity;

-- 3. book_seats — add a 6-arg overload with p_pickup_location.
--    The old 5-arg version is left in place so the currently-deployed site
--    keeps booking (after-party) while you roll this out. Both can coexist;
--    a later migration may drop the 5-arg one once the new app is live.
create or replace function book_seats(
  p_run_id          text,
  p_booker_name     text,
  p_booker_phone    text,
  p_booker_email    text,
  p_pickup_location text,
  p_passengers      text[]
) returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
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

  select capacity into v_cap from van_runs where id = p_run_id for update;
  if v_cap is null then
    raise exception 'RUN_NOT_FOUND';
  end if;

  select coalesce(sum(seats), 0) into v_taken from bookings where run_id = p_run_id;
  if v_taken + v_seats > v_cap then
    raise exception 'NOT_ENOUGH_SEATS: % left', v_cap - v_taken;
  end if;

  insert into bookings
    (ref, run_id, booker_name, booker_phone, booker_email, pickup_location, passengers, seats)
  values
    (gen_booking_ref(), p_run_id, p_booker_name, p_booker_phone,
     nullif(p_booker_email, ''), nullif(p_pickup_location, ''), p_passengers, v_seats)
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function book_seats(text, text, text, text, text, text[]) to anon, authenticated;

-- 4. update_booking — add a 6-arg overload with p_pickup_location (keeps the
--    existing location if null/empty). Old 5-arg version left in place too.
create or replace function update_booking(
  p_ref             text,
  p_booker_name     text,
  p_booker_phone    text,
  p_booker_email    text,
  p_pickup_location text,
  p_passengers      text[]
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
  select coalesce(sum(seats), 0) into v_taken
    from bookings where run_id = v_run and ref <> v_ref;
  if v_taken + v_seats > v_cap then
    raise exception 'NOT_ENOUGH_SEATS: % left', v_cap - v_taken;
  end if;

  update bookings set
    booker_name     = p_booker_name,
    booker_phone    = p_booker_phone,
    booker_email    = nullif(p_booker_email, ''),
    pickup_location = coalesce(nullif(p_pickup_location, ''), pickup_location),
    passengers      = p_passengers,
    seats           = v_seats
  where ref = v_ref
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function update_booking(text, text, text, text, text, text[]) to anon, authenticated;

-- 5. assign_van — head driver assigns a booking to a van (passcode-gated) ------
create or replace function assign_van(p_passcode text, p_ref text, p_van text)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row bookings;
begin
  if p_passcode is null
     or p_passcode <> coalesce((select passcode from admin_config where id = 1), '\x00') then
    raise exception 'FORBIDDEN';
  end if;
  update bookings set assigned_van = nullif(p_van, '')
    where ref = upper(trim(p_ref))
    returning * into v_row;
  if v_row.ref is null then
    raise exception 'NOT_FOUND';
  end if;
  return v_row;
end;
$$;
grant execute on function assign_van(text, text, text) to anon, authenticated;

-- find_booking / list_bookings already return setof bookings, so the new
-- pickup_location + assigned_van columns flow through automatically.
