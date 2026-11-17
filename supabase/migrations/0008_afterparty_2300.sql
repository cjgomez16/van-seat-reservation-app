-- ============================================================
--  0008 — Add an 11:00 PM after-party departure (Van 1).
--  Van 1 returns from the 9:30 PM run in time for an 11:00 PM departure.
--  Additive and safe to run anytime. Keep in sync with src/config.js.
-- ============================================================

insert into van_runs
  (id, point_id, point_name, point_note, van_id, van_name, trip_id, trip_label, trip_time, capacity)
values
  ('ap-2300','GS','Grand Sierra','','v1','Van 1','t2300','','11:00 PM', 10)
on conflict (id) do nothing;
