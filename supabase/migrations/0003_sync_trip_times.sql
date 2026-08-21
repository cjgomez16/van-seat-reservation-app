-- ============================================================
--  Sync van_runs.trip_time with src/config.js (single departure times).
--  Run once in the Supabase SQL editor. Needed because the email Edge
--  Function reads trip_time from van_runs, so it must match what the app
--  shows. The app itself reads times from config.js and is unaffected.
-- ============================================================

update van_runs set trip_time = '11:30 AM' where trip_id = 't1';
update van_runs set trip_time = '12:30 PM' where trip_id = 't2';
-- after-party trips (at1 = 10:00 PM, at2 = 11:30 PM) already match.
