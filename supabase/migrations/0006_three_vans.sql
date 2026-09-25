-- ============================================================
--  0006 — Arrival drops from 4 to 3 vans per pickup time.
--  Per-slot capacity 40 → 30 (3 vans × 10). Keep in sync with
--  vansPerSlot: 3 in src/config.js. Both arrival times kept (1:15 / 1:45 PM).
--  After-party is unchanged. Run once in the Supabase SQL editor.
--  Safe: existing arrival bookings (≤ 30 per slot) are unaffected.
-- ============================================================

update van_runs set capacity = 30 where id in ('arr-115', 'arr-145');
