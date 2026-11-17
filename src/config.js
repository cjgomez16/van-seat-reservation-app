/*
  EVENT CONFIG — the only file you edit to change event details.
  ------------------------------------------------------------------
  Two shuttle SERVICES, both "timelist": the guest picks a TIME from a flat
  list; the van is FIXED per time, and the pickup/drop-off is a single FIXED
  location (`fixedLocation`), so there is no guest location field and no
  head-driver van assignment.

    - "arrival"   ("To the venue"):    Grand Sierra → Itogon Mountain Village
    - "afterparty" ("From the venue"): Itogon Mountain Village → Grand Sierra

  Run ids encode the time: arrival "arr-HHMM", after-party "ap-HHMM". Keep this
  file in sync with the seed rows in supabase/migrations/*.sql (the live DB
  books against van_runs, and the email reads labels from it). Van plates are
  optional via vanPlates (a plate applies to all of that van's runs).
*/

export const SEATS_PER_RUN = 10;

// Max seats one booker may reserve at once. 10 = a full van.
export const MAX_PER_BOOKER = 10;

// Wedding details shown in the header. Set EVENT_DATE to null to hide the date.
export const COUPLE = "Nicole (Coco) & Roland (Gary)";
export const VENUE = "Itogon Mountain Village";
export const EVENT_DATE = "November 20, 2026";

// Shown under the times and on the confirmation. Set to null to hide.
export const BOARDING_NOTE =
  "Please be at your pickup point 10–15 minutes before departure.";

export const SERVICES = [
  {
    id: "arrival",
    label: "To the venue",
    blurb: "Shuttle from Grand Sierra up to Itogon Mountain Village.",
    icon: "☀",
    model: "timelist",
    locationRole: "Pickup",
    fixedLocation: "Grand Sierra",
    vanPlates: { "Van 1": null, "Van 2": null },
    // 1:00 PM and 2:30 PM are the same physical van (Van 1); 2:00 PM is Van 2.
    departures: [
      { id: "arr-1300", time: "1:00 PM", van: "Van 1" },
      { id: "arr-1400", time: "2:00 PM", van: "Van 2" },
      { id: "arr-1430", time: "2:30 PM", van: "Van 1" },
    ],
  },
  {
    id: "afterparty",
    label: "From the venue",
    blurb: "Shuttle from Itogon Mountain Village back to Grand Sierra.",
    icon: "☾",
    model: "timelist",
    locationRole: "Drop-off",
    fixedLocation: "Grand Sierra",
    vanPlates: { "Van 1": null, "Van 2": null },
    // Two separate vans, one per departure time.
    departures: [
      { id: "ap-2130", time: "9:30 PM", van: "Van 1" },
      { id: "ap-2230", time: "10:30 PM", van: "Van 2" },
      { id: "ap-2300", time: "11:00 PM", van: "Van 1" },
    ],
  },
];

// key for a van-run (kept for the stores' convenience helpers).
export function runKey(vanId, tripId) {
  return `${vanId}-${tripId}`;
}

export function getService(serviceId) {
  return SERVICES.find((s) => s.id === serviceId) || null;
}

// Flattened catalogue of every run across both services, with capacity.
export const ALL_RUNS = SERVICES.flatMap((service) =>
  service.departures.map((dep) => ({
    runId: dep.id,
    capacity: SEATS_PER_RUN,
    service,
    departure: dep,
    van: { name: dep.van, plate: service.vanPlates?.[dep.van] ?? null },
    location: service.fixedLocation,
  }))
);

const RUN_BY_ID = new Map(ALL_RUNS.map((r) => [r.runId, r]));

// runId -> { service, capacity, departure, van, location } for display.
export function findRunContext(runId) {
  return RUN_BY_ID.get(runId) || null;
}

export function runCapacity(runId) {
  return RUN_BY_ID.get(runId)?.capacity ?? SEATS_PER_RUN;
}
