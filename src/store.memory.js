/*
  IN-MEMORY STORE (fallback when Supabase env vars are absent).
  ------------------------------------------------------------------
  Same async API as src/store.supabase.js so App.jsx is identical against
  either backend. State lives in React memory: resets on refresh, not shared.
*/

import { useState, useCallback, useMemo } from "react";
import { MAX_PER_BOOKER, ALL_RUNS, runKey, runCapacity } from "./config.js";

function randomRef() {
  const s = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return "VAN-" + s.slice(0, 5).padEnd(5, "0");
}
function uniqueRef(bookings) {
  let ref;
  do {
    ref = randomRef();
  } while (bookings.some((b) => b.ref === ref));
  return ref;
}

export function useMemoryBookings() {
  const [bookings, setBookings] = useState([]);

  const seatsMap = useMemo(() => {
    const m = {};
    for (const r of ALL_RUNS) m[r.runId] = r.capacity;
    for (const b of bookings) if (b.runId in m) m[b.runId] -= b.seats;
    return m;
  }, [bookings]);

  const seatsLeftByRun = useCallback(
    (runId) => seatsMap[runId] ?? runCapacity(runId),
    [seatsMap]
  );
  const seatsLeft = useCallback(
    (vanId, tripId) => seatsLeftByRun(runKey(vanId, tripId)),
    [seatsLeftByRun]
  );

  const seatsTaken = useCallback(
    (runId, excludeRef = null) =>
      bookings
        .filter((b) => b.runId === runId && b.ref !== excludeRef)
        .reduce((sum, b) => sum + b.seats, 0),
    [bookings]
  );

  const createBooking = useCallback(
    async ({ runId, bookerName, bookerPhone, bookerEmail, pickupLocation, passengers }) => {
      const seats = passengers.length;
      if (seats < 1) return { ok: false, code: "NO_PASSENGERS" };
      if (seats > MAX_PER_BOOKER)
        return { ok: false, code: "OVER_BOOKER_CAP", cap: MAX_PER_BOOKER };
      const left = runCapacity(runId) - seatsTaken(runId);
      if (seats > left) return { ok: false, code: "NOT_ENOUGH_SEATS", left };

      const booking = {
        id: crypto.randomUUID(),
        ref: uniqueRef(bookings),
        runId,
        bookerName,
        bookerPhone,
        bookerEmail: bookerEmail || "",
        pickupLocation: pickupLocation || "",
        assignedVan: null,
        passengers,
        seats,
        createdAt: new Date().toISOString(),
      };
      setBookings((prev) => [...prev, booking]);
      return { ok: true, booking };
    },
    [bookings, seatsTaken]
  );

  const updateBooking = useCallback(
    async (ref, { bookerName, bookerPhone, bookerEmail, pickupLocation, passengers }) => {
      const existing = bookings.find((b) => b.ref === ref);
      if (!existing) return { ok: false, code: "NOT_FOUND" };
      const seats = passengers.length;
      if (seats < 1) return { ok: false, code: "NO_PASSENGERS" };
      if (seats > MAX_PER_BOOKER)
        return { ok: false, code: "OVER_BOOKER_CAP", cap: MAX_PER_BOOKER };
      const left = runCapacity(existing.runId) - seatsTaken(existing.runId, ref);
      if (seats > left) return { ok: false, code: "NOT_ENOUGH_SEATS", left };

      const updated = {
        ...existing,
        bookerName,
        bookerPhone,
        bookerEmail: bookerEmail || "",
        pickupLocation:
          pickupLocation === undefined ? existing.pickupLocation : pickupLocation || "",
        passengers,
        seats,
      };
      setBookings((prev) => prev.map((b) => (b.ref === ref ? updated : b)));
      return { ok: true, booking: updated };
    },
    [bookings, seatsTaken]
  );

  const cancelBooking = useCallback(
    async (ref) => {
      if (!bookings.some((b) => b.ref === ref))
        return { ok: false, code: "NOT_FOUND" };
      setBookings((prev) => prev.filter((b) => b.ref !== ref));
      return { ok: true };
    },
    [bookings]
  );

  // Head-driver van assignment (passcode ignored in the local demo).
  const assignVan = useCallback(
    async (ref, van) => {
      const existing = bookings.find((b) => b.ref === ref);
      if (!existing) return { ok: false, code: "NOT_FOUND" };
      const updated = { ...existing, assignedVan: van || null };
      setBookings((prev) => prev.map((b) => (b.ref === ref ? updated : b)));
      return { ok: true, booking: updated };
    },
    [bookings]
  );

  const findByRef = useCallback(
    async (ref) => {
      const norm = ref.trim().toUpperCase();
      return bookings.find((b) => b.ref === norm) || null;
    },
    [bookings]
  );

  const listBookings = useCallback(async () => ({ ok: true, bookings }), [bookings]);

  return {
    backend: "memory",
    loading: false,
    seatsMap,
    seatsLeft,
    seatsLeftByRun,
    createBooking,
    updateBooking,
    cancelBooking,
    assignVan,
    findByRef,
    listBookings,
  };
}
