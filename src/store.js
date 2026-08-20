/*
  DATA LAYER — in-memory booking store (the Supabase swap point).
  ------------------------------------------------------------------
  This hook is the ONLY place that knows how bookings are stored. Today
  it keeps them in React state (so everything resets on refresh and is
  NOT shared between users — matching the front-end-only build).

  To go live, replace the bodies below with the Supabase calls from
  VAN-RESERVATION-HANDOFF.md, keeping the same function signatures:

    - seatsLeftMap  ->  read the `seats_left` view (+ realtime subscription)
    - createBooking ->  supabase.rpc("book_seats", { ... })   (atomic, server-side)
    - updateBooking / cancelBooking -> RPCs or row updates behind RLS
    - findByRef     ->  a lookup RPC keyed by booking reference

  The components never see storage details — they only call these methods.
*/

import { useState, useCallback, useMemo } from "react";
import { SEATS_PER_RUN, MAX_PER_BOOKER, runKey } from "./config.js";

// Short, human-friendly booking reference, e.g. "VAN-7QK2".
function makeRef() {
  const s = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return "VAN-" + s.slice(0, 4).padEnd(4, "0");
}

export function useBookings() {
  const [bookings, setBookings] = useState([]); // array of booking records

  // Seats already taken on a run, optionally ignoring one booking (for edits).
  const seatsTaken = useCallback(
    (runId, excludeId = null) =>
      bookings
        .filter((b) => b.runId === runId && b.id !== excludeId)
        .reduce((sum, b) => sum + b.seats, 0),
    [bookings]
  );

  const seatsLeft = useCallback(
    (vanId, tripId, excludeId = null) =>
      SEATS_PER_RUN - seatsTaken(runKey(vanId, tripId), excludeId),
    [seatsTaken]
  );

  // Attempt a booking. Returns { ok, booking } or { ok:false, code, left }.
  // Mirrors the server-side book_seats RPC contract.
  const createBooking = useCallback(
    ({ runId, bookerName, bookerPhone, bookerEmail, passengers }) => {
      const seats = passengers.length;
      if (seats < 1) return { ok: false, code: "NO_PASSENGERS" };
      if (seats > MAX_PER_BOOKER)
        return { ok: false, code: "OVER_BOOKER_CAP", cap: MAX_PER_BOOKER };
      const left = SEATS_PER_RUN - seatsTaken(runId);
      if (seats > left) return { ok: false, code: "NOT_ENOUGH_SEATS", left };

      const booking = {
        id: crypto.randomUUID(),
        ref: makeRef(),
        runId,
        bookerName,
        bookerPhone,
        bookerEmail,
        passengers,
        seats,
        createdAt: new Date().toISOString(),
      };
      setBookings((prev) => [...prev, booking]);
      return { ok: true, booking };
    },
    [seatsTaken]
  );

  // Edit an existing booking's passengers/contact (capacity re-checked).
  const updateBooking = useCallback(
    (id, { bookerName, bookerPhone, bookerEmail, passengers }) => {
      const existing = bookings.find((b) => b.id === id);
      if (!existing) return { ok: false, code: "NOT_FOUND" };
      const seats = passengers.length;
      if (seats < 1) return { ok: false, code: "NO_PASSENGERS" };
      if (seats > MAX_PER_BOOKER)
        return { ok: false, code: "OVER_BOOKER_CAP", cap: MAX_PER_BOOKER };
      const left = SEATS_PER_RUN - seatsTaken(existing.runId, id);
      if (seats > left) return { ok: false, code: "NOT_ENOUGH_SEATS", left };

      const updated = {
        ...existing,
        bookerName,
        bookerPhone,
        bookerEmail,
        passengers,
        seats,
      };
      setBookings((prev) => prev.map((b) => (b.id === id ? updated : b)));
      return { ok: true, booking: updated };
    },
    [bookings, seatsTaken]
  );

  const cancelBooking = useCallback((id) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
    return { ok: true };
  }, []);

  const findByRef = useCallback(
    (ref) => {
      const norm = ref.trim().toUpperCase();
      return bookings.find((b) => b.ref === norm) || null;
    },
    [bookings]
  );

  const totalBooked = useMemo(
    () => bookings.reduce((sum, b) => sum + b.seats, 0),
    [bookings]
  );

  return {
    bookings,
    seatsLeft,
    createBooking,
    updateBooking,
    cancelBooking,
    findByRef,
    totalBooked,
  };
}
