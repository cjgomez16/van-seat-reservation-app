/*
  EVENT CONFIG — the only file you edit to change event details.
  ------------------------------------------------------------------
  Two shuttle SERVICES, each with its own trips and points:
    - "arrival"   : guests → the venue. 2 pickup points, 2 morning trips.
    - "afterparty": the venue → a single drop-off. 3 vans, 2 evening trips.

  A "point" is a pickup location (arrival) or a drop-off location (afterparty).
  Van ids and trip ids are UNIQUE across services, so run ids
  (`${vanId}-${tripId}`) never collide. Pickup/drop-off names are placeholders
  — replace them when confirmed. Keep this file in sync with the seed rows in
  supabase/migrations/*.sql (that's what the live database books against).
*/

export const SEATS_PER_RUN = 10;

// Max seats one booker may reserve on a single van-run.
// Currently 10 = the run capacity, so it imposes no extra limit.
export const MAX_PER_BOOKER = 10;

// Wedding details shown in the header. Set EVENT_DATE to null to hide the date.
export const COUPLE = "Candy Gamos & Jonas Vergara";
export const VENUE = "Itogon Mountain Village (IMV)";
export const EVENT_DATE = "October 1, 2026";

export const SERVICES = [
  {
    id: "arrival",
    label: "Arrival to the venue",
    blurb: "Shuttle from your pickup point to Itogon Mountain Village.",
    icon: "☀",
    pointRole: "Pickup", // label used on summaries/tickets
    pointStepLabel: "Choose your pickup point",
    trips: [
      { id: "t1", label: "First Trip", time: "11:15 – 11:30 AM" },
      { id: "t2", label: "Second Trip", time: "12:15 – 12:30 PM" },
    ],
    points: [
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
    ],
  },
  {
    id: "afterparty",
    label: "After-party departure",
    blurb: "Shuttle from Itogon Mountain Village to the drop-off point.",
    icon: "☾",
    pointRole: "Drop-off",
    pointStepLabel: null, // single drop-off → the point step is skipped
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
          { id: "a1", name: "Van 1" },
          { id: "a2", name: "Van 2" },
          { id: "a3", name: "Van 3" },
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

export function findPoint(service, pointId) {
  return service ? service.points.find((p) => p.id === pointId) || null : null;
}

export function findTrip(service, tripId) {
  return service ? service.trips.find((t) => t.id === tripId) || null : null;
}

// Flattened catalogue of every van-run across both services.
export const ALL_RUNS = SERVICES.flatMap((service) =>
  service.points.flatMap((point) =>
    point.vans.flatMap((van) =>
      service.trips.map((trip) => ({
        runId: runKey(van.id, trip.id),
        service,
        point,
        van,
        trip,
      }))
    )
  )
);

const RUN_BY_ID = new Map(ALL_RUNS.map((r) => [r.runId, r]));

// runId -> { service, point, van, trip } for display (admin, manage, tickets).
export function findRunContext(runId) {
  return RUN_BY_ID.get(runId) || null;
}
