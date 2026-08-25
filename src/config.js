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
    vansPerSlot: 4, // head assigns Van 1..N; sets the per-slot seat cap
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
    model: "vans",
    locationRole: "Drop-off",
    trips: [
      { id: "at1", label: "First Trip", time: "10:00 PM" },
      { id: "at2", label: "Second Trip", time: "11:30 PM" },
    ],
    points: [
      {
        id: "D",
        name: "Drop-off Point",
        note: "To be announced",
        vans: [
          { id: "a1", name: "Van 1", plate: null },
          { id: "a2", name: "Van 2", plate: null },
          { id: "a3", name: "Van 3", plate: null },
        ],
      },
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
  return service.points.flatMap((point) =>
    point.vans.flatMap((van) =>
      service.trips.map((trip) => ({
        runId: runKey(van.id, trip.id),
        capacity: SEATS_PER_RUN,
        service,
        point,
        van,
        trip,
      }))
    )
  );
});

const RUN_BY_ID = new Map(ALL_RUNS.map((r) => [r.runId, r]));

// runId -> { service, capacity, slot | (point, van, trip) } for display.
export function findRunContext(runId) {
  return RUN_BY_ID.get(runId) || null;
}

export function runCapacity(runId) {
  return RUN_BY_ID.get(runId)?.capacity ?? SEATS_PER_RUN;
}
