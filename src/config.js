/*
  EVENT CONFIG — the only file you edit to change event details.
  ------------------------------------------------------------------
  Two shuttle SERVICES, each with a different booking MODEL:

    - "arrival"  (model: "slots") — guest picks a PICKUP TIME, then types
      their own pickup location. No fixed points, no guest-facing van pick.
      The head driver assigns each booking to a van afterward (admin panel).
      Capacity is per time slot = vansPerSlot × SEATS_PER_RUN.

    - "afterparty" (model: "vans") — guest picks a VAN + evening trip to a
      single drop-off point (unchanged).

  Run ids are unique across services: arrival slots are "arr-115"/"arr-145";
  after-party runs are "${vanId}-${tripId}" (a1-at1 …). Keep this file in sync
  with the seed rows in supabase/migrations/*.sql (the live DB books against
  van_runs, and the email reads labels from it).

  Each van has an optional `plate` (null until provided).
*/

export const SEATS_PER_RUN = 10;

// Max seats one booker may reserve at once. 10 = a full van.
export const MAX_PER_BOOKER = 10;

// Wedding details shown in the header. Set EVENT_DATE to null to hide the date.
export const COUPLE = "Candy Gamos & Jonas Vergara";
export const VENUE = "Itogon Mountain Village (IMV)";
export const EVENT_DATE = "October 1, 2026";

// Shown under the times and on the confirmation. Set to null to hide.
export const BOARDING_NOTE =
  "Please be at your pickup point 10–15 minutes before departure.";

export const SERVICES = [
  {
    id: "arrival",
    label: "To the venue",
    blurb: "Shuttle to Itogon Mountain Village — we'll pick you up in town.",
    icon: "☀",
    model: "slots",
    locationRole: "Pickup", // label for the location on tickets/emails
    vansPerSlot: 3, // head assigns Van 1..N; sets the per-slot seat cap
    slots: [
      { id: "arr-115", label: "First pickup", time: "1:15 PM" },
      { id: "arr-145", label: "Second pickup", time: "1:45 PM" },
    ],
  },
  {
    id: "afterparty",
    label: "From the venue",
    blurb: "Shuttle from Itogon Mountain Village to the drop-off point.",
    icon: "☾",
    model: "timelist", // guest picks a DEPARTURE TIME (van is fixed per time)
    locationRole: "Drop-off",
    dropoff: { name: "Drop-off Point", note: "To be announced" },
    // Physical vans — a plate here applies to all of that van's departures.
    vanPlates: { "Van 1": null, "Van 2": null, "Van 3": null },
    // Staggered departures: 3 vans × 3 trips, each offset 30 min, ~90 min
    // between a van's own trips. Each is one van-run of SEATS_PER_RUN seats.
    // Ids stay a{van}-at{trip} to match van_runs. Listed in time order.
    departures: [
      { id: "a1-at1", time: "10:00 PM", van: "Van 1" },
      { id: "a2-at1", time: "10:30 PM", van: "Van 2" },
      { id: "a3-at1", time: "11:00 PM", van: "Van 3" },
      { id: "a1-at2", time: "11:30 PM", van: "Van 1" },
      { id: "a2-at2", time: "12:00 AM", van: "Van 2" },
      { id: "a3-at2", time: "12:30 AM", van: "Van 3" },
      { id: "a1-at3", time: "1:00 AM", van: "Van 1" },
      { id: "a2-at3", time: "1:30 AM", van: "Van 2" },
      { id: "a3-at3", time: "2:00 AM", van: "Van 3" },
    ],
  },
];

// key for a van-run: `${vanId}-${tripId}` — matches van_runs.id in Supabase.
export function runKey(vanId, tripId) {
  return `${vanId}-${tripId}`;
}

export function getService(serviceId) {
  return SERVICES.find((s) => s.id === serviceId) || null;
}

export function findTrip(service, tripId) {
  return service?.trips ? service.trips.find((t) => t.id === tripId) || null : null;
}

// Vans the head can assign for a slots-model service (Van 1..vansPerSlot).
export function assignableVans(service) {
  const n = service?.vansPerSlot || 0;
  return Array.from({ length: n }, (_, i) => `Van ${i + 1}`);
}

// Flattened catalogue of every run across both services, with capacity.
export const ALL_RUNS = SERVICES.flatMap((service) => {
  if (service.model === "slots") {
    const capacity = service.vansPerSlot * SEATS_PER_RUN;
    return service.slots.map((slot) => ({
      runId: slot.id,
      capacity,
      service,
      slot,
    }));
  }
  // timelist: each departure is one van-run.
  return service.departures.map((dep) => ({
    runId: dep.id,
    capacity: SEATS_PER_RUN,
    service,
    departure: dep,
    van: { name: dep.van, plate: service.vanPlates?.[dep.van] ?? null },
    point: service.dropoff,
  }));
});

const RUN_BY_ID = new Map(ALL_RUNS.map((r) => [r.runId, r]));

// runId -> { service, capacity, slot | (point, van, trip) } for display.
export function findRunContext(runId) {
  return RUN_BY_ID.get(runId) || null;
}

export function runCapacity(runId) {
  return RUN_BY_ID.get(runId)?.capacity ?? SEATS_PER_RUN;
}
