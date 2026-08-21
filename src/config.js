/*
  EVENT CONFIG — the only file you edit to change event details.
  ------------------------------------------------------------------
  Pickup point names/notes and the trip times below are PLACEHOLDERS
  (per the handoff, section 9). Replace the strings with the real
  wedding details when ready. Structure (4 vans, 2 trips) is fixed and
  mirrors the Supabase `van_runs` catalogue in VAN-RESERVATION-HANDOFF.md.
*/

// Wedding details shown in the header. Set EVENT_DATE to null to hide the date.
export const COUPLE = "Candy Gamos & Jonas Vergara";
export const VENUE = "Itogon Mountain Village (IMV)";
export const EVENT_DATE = "October 1, 2026";

export const SEATS_PER_RUN = 10;

// Max seats one booker may reserve on a single van-run.
// Currently 10 = the run capacity, so it imposes no extra limit.
// Lower it (e.g. 6) to cap group size per booker.
export const MAX_PER_BOOKER = 10;

export const TRIPS = [
  { id: "t1", label: "First Trip", time: "11:15 – 11:30 AM" },
  { id: "t2", label: "Second Trip", time: "12:15 – 12:30 PM" },
];

export const POINTS = [
  {
    id: "A",
    name: "Pickup Point A",
    note: "Hotel Lobby",
    vans: [
      { id: "v1", name: "Van 1" },
      { id: "v2", name: "Van 2" },
    ],
  },
  {
    id: "B",
    name: "Pickup Point B",
    note: "Church Courtyard",
    vans: [
      { id: "v3", name: "Van 3" },
      { id: "v4", name: "Van 4" },
    ],
  },
];

// key for a van-run: `${vanId}-${tripId}` — matches van_runs.id in Supabase.
export function runKey(vanId, tripId) {
  return `${vanId}-${tripId}`;
}

// Lookups used across the UI.
export function findPoint(pointId) {
  return POINTS.find((p) => p.id === pointId) || null;
}
export function findTrip(tripId) {
  return TRIPS.find((t) => t.id === tripId) || null;
}
export function findVanPoint(vanId) {
  for (const p of POINTS) {
    const v = p.vans.find((x) => x.id === vanId);
    if (v) return { point: p, van: v };
  }
  return null;
}
