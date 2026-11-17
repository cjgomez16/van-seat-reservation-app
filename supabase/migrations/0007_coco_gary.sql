-- ============================================================
--  0007 — Reset for the Nicole (Coco) & Roland (Gary) wedding.
--  Reuses the same project in place: clears the previous event's bookings and
--  run catalogue, then installs the new runs. Both services are fixed-location
--  "pick a time" (Grand Sierra ↔ Itogon Mountain Village); van is fixed per
--  time. Keep in sync with src/config.js. Run once in the Supabase SQL editor.
--
--  ⚠️ Destructive: DELETEs all bookings and van_runs. (Old bookings were backed
--  up locally before this was run.) The admin_config passcode is left as-is.
-- ============================================================

delete from bookings;   -- clear the previous event's bookings (FK parent of van_runs)
delete from van_runs;   -- clear the old run catalogue

insert into van_runs
  (id, point_id, point_name, point_note, van_id, van_name, trip_id, trip_label, trip_time, capacity)
values
  -- To the venue (Grand Sierra → IMV). 1:00 and 2:30 PM are the same van.
  ('arr-1300','GS','Grand Sierra','','v1','Van 1','t1300','','1:00 PM', 10),
  ('arr-1400','GS','Grand Sierra','','v2','Van 2','t1400','','2:00 PM', 10),
  ('arr-1430','GS','Grand Sierra','','v1','Van 1','t1430','','2:30 PM', 10),
  -- From the venue (IMV → Grand Sierra). Two separate vans.
  ('ap-2130','GS','Grand Sierra','','v1','Van 1','t2130','','9:30 PM', 10),
  ('ap-2230','GS','Grand Sierra','','v2','Van 2','t2230','','10:30 PM', 10);
