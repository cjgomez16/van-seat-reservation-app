-- ============================================================
--  0005 — Stagger the after-party departures and add a third trip per van.
--  3 vans, offset 30 min, ~90 min between a van's own trips → 9 departures.
--  Guests now pick a departure TIME (flat list); the van is fixed per time.
--  Run once in the Supabase SQL editor (after 0001–0004).
--  Keep in sync with the "afterparty" service in src/config.js.
-- ============================================================

-- Restagger the 6 existing runs (trip_label blanked — the app/email show the
-- time only for after-party departures).
update van_runs set trip_time = '10:00 PM', trip_label = '' where id = 'a1-at1';
update van_runs set trip_time = '10:30 PM', trip_label = '' where id = 'a2-at1';
update van_runs set trip_time = '11:00 PM', trip_label = '' where id = 'a3-at1';
update van_runs set trip_time = '11:30 PM', trip_label = '' where id = 'a1-at2';
update van_runs set trip_time = '12:00 AM', trip_label = '' where id = 'a2-at2';
update van_runs set trip_time = '12:30 AM', trip_label = '' where id = 'a3-at2';

-- Add the third trip for each van.
insert into van_runs
  (id, point_id, point_name, point_note, van_id, van_name, trip_id, trip_label, trip_time, capacity)
values
  ('a1-at3','D','Drop-off Point','To be announced','a1','Van 1','at3','','1:00 AM', 10),
  ('a2-at3','D','Drop-off Point','To be announced','a2','Van 2','at3','','1:30 AM', 10),
  ('a3-at3','D','Drop-off Point','To be announced','a3','Van 3','at3','','2:00 AM', 10)
on conflict (id) do update
  set trip_time = excluded.trip_time,
      trip_label = excluded.trip_label,
      capacity   = excluded.capacity;
