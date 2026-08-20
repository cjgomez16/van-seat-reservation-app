/*
  SUPABASE STORE (used when VITE_SUPABASE_URL + ANON_KEY are set).
  ------------------------------------------------------------------
  Same async, ref-keyed API as src/store.memory.js. All capacity
  enforcement is server-side in the Postgres RPCs (see
  supabase/migrations/0001_init.sql) — the client is never trusted to
  do the seat math. Live seat counts come from the `seats_left` view
  plus a realtime subscription on the `bookings` table.
*/

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import { SEATS_PER_RUN, runKey } from "./config.js";

function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    runId: row.run_id,
    bookerName: row.booker_name,
    bookerPhone: row.booker_phone,
    bookerEmail: row.booker_email || "",
    passengers: row.passengers || [],
    seats: row.seats,
    createdAt: row.created_at,
  };
}

// Turn a Postgres RAISE message into the app's { ok:false, code, ... } shape.
function mapRpcError(error) {
  const msg = error?.message || "";
  if (msg.includes("NOT_ENOUGH_SEATS")) {
    const m = msg.match(/(\d+)\s*left/);
    return { ok: false, code: "NOT_ENOUGH_SEATS", left: m ? Number(m[1]) : 0 };
  }
  if (msg.includes("OVER_BOOKER_CAP")) {
    const m = msg.match(/(\d+)\s*max/);
    return { ok: false, code: "OVER_BOOKER_CAP", cap: m ? Number(m[1]) : undefined };
  }
  if (msg.includes("NO_PASSENGERS")) return { ok: false, code: "NO_PASSENGERS" };
  if (msg.includes("NOT_FOUND")) return { ok: false, code: "NOT_FOUND" };
  if (msg.includes("FORBIDDEN")) return { ok: false, code: "FORBIDDEN" };
  return { ok: false, code: "ERROR", message: msg };
}

export function useSupabaseBookings() {
  const [seatsMap, setSeatsMap] = useState({});
  const [loading, setLoading] = useState(true);

  const refreshSeats = useCallback(async () => {
    const { data, error } = await supabase
      .from("seats_left")
      .select("run_id,left");
    if (!error && data) {
      setSeatsMap(Object.fromEntries(data.map((r) => [r.run_id, r.left])));
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await refreshSeats();
      if (active) setLoading(false);
    })();

    // Keep seat counts fresh across users. We poll the seats_left view
    // (counts only) rather than subscribing to `bookings` over Realtime:
    // RLS hides raw bookings from the anon key, so Realtime would deliver
    // no events to anon clients anyway. Polling + refresh-on-focus is
    // simpler and respects the same privacy model. Mutations also call
    // refreshSeats() immediately, so the booker sees their own change now.
    const POLL_MS = 15000;
    const timer = setInterval(refreshSeats, POLL_MS);
    const onFocus = () => refreshSeats();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshSeats]);

  const seatsLeft = useCallback(
    (vanId, tripId) => seatsMap[runKey(vanId, tripId)] ?? SEATS_PER_RUN,
    [seatsMap]
  );

  const createBooking = useCallback(
    async ({ runId, bookerName, bookerPhone, bookerEmail, passengers }) => {
      const { data, error } = await supabase.rpc("book_seats", {
        p_run_id: runId,
        p_booker_name: bookerName,
        p_booker_phone: bookerPhone,
        p_booker_email: bookerEmail || null,
        p_passengers: passengers,
      });
      if (error) return mapRpcError(error);
      await refreshSeats();
      return { ok: true, booking: rowToBooking(data) };
    },
    [refreshSeats]
  );

  const updateBooking = useCallback(
    async (ref, { bookerName, bookerPhone, bookerEmail, passengers }) => {
      const { data, error } = await supabase.rpc("update_booking", {
        p_ref: ref,
        p_booker_name: bookerName,
        p_booker_phone: bookerPhone,
        p_booker_email: bookerEmail || null,
        p_passengers: passengers,
      });
      if (error) return mapRpcError(error);
      await refreshSeats();
      return { ok: true, booking: rowToBooking(data) };
    },
    [refreshSeats]
  );

  const cancelBooking = useCallback(
    async (ref) => {
      const { error } = await supabase.rpc("cancel_booking", { p_ref: ref });
      if (error) return mapRpcError(error);
      await refreshSeats();
      return { ok: true };
    },
    [refreshSeats]
  );

  const findByRef = useCallback(async (ref) => {
    const { data, error } = await supabase.rpc("find_booking", { p_ref: ref });
    if (error || !data) return null;
    return rowToBooking(data);
  }, []);

  const listBookings = useCallback(async (passcode) => {
    const { data, error } = await supabase.rpc("list_bookings", {
      p_passcode: passcode,
    });
    if (error) return mapRpcError(error);
    return { ok: true, bookings: (data || []).map(rowToBooking) };
  }, []);

  return {
    backend: "supabase",
    loading,
    seatsMap,
    seatsLeft,
    createBooking,
    updateBooking,
    cancelBooking,
    findByRef,
    listBookings,
  };
}
