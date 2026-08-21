-- ============================================================
--  After-party shuttle — adds 6 van-runs (3 vans × 2 evening trips).
--  Itogon Mountain Village → single drop-off point.
--  Run once in the Supabase SQL editor (after 0001_init.sql).
--  Idempotent: on conflict do nothing.
--
--  Keep in sync with the "afterparty" service in src/config.js.
-- ============================================================

insert into van_runs
  (id, point_id, point_name, point_note, van_id, van_name, trip_id, trip_label, trip_time)
values
  ('a1-at1','D','Drop-off Point','To be announced','a1','Van 1','at1','First Trip','10:00 PM'),
  ('a1-at2','D','Drop-off Point','To be announced','a1','Van 1','at2','Second Trip','11:30 PM'),
  ('a2-at1','D','Drop-off Point','To be announced','a2','Van 2','at1','First Trip','10:00 PM'),
  ('a2-at2','D','Drop-off Point','To be announced','a2','Van 2','at2','Second Trip','11:30 PM'),
  ('a3-at1','D','Drop-off Point','To be announced','a3','Van 3','at1','First Trip','10:00 PM'),
  ('a3-at2','D','Drop-off Point','To be announced','a3','Van 3','at2','Second Trip','11:30 PM')
on conflict (id) do nothing;
