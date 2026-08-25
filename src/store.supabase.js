/*
  SUPABASE STORE (used when VITE_SUPABASE_URL + ANON/PUBLISHABLE key are set).
  ------------------------------------------------------------------
  Same async API as src/store.memory.js. All capacity enforcement is
  server-side in the Postgres RPCs. Live seat counts come from the
  `seats_left` view, refreshed by polling + on window focus.
*/

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import { runKey, runCapacity } from "./config.js";

function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref,
    runId: row.run_id,
    bookerName: row.booker_name,
    bookerPhone: row.booker_phone,
    bookerEmail: row.booker_email || "",
    pickupLocation: row.pickup_location || "",
    assignedVan: row.assigned_van || null,
    passengers: row.passengers || [],
    seats: row.seats,
    createdAt: row.created_at,
  };
}

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
  if (msg.includes("RUN_NOT_FOUND")) return { ok: false, code: "RUN_NOT_FOUND" };
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

  const seatsLeftByRun = useCallback(
    (runId) => seatsMap[runId] ?? runCapacity(runId),
    [seatsMap]
  );
  const seatsLeft = useCallback(
    (vanId, tripId) => seatsLeftByRun(runKey(vanId, tripId)),
    [seatsLeftByRun]
  );

  const createBooking = useCallback(
    async ({ runId, bookerName, bookerPhone, bookerEmail, pickupLocation, passengers }) => {
      const { data, error } = await supabase.rpc("book_seats", {
        p_run_id: runId,
        p_booker_name: bookerName,
        p_booker_phone: bookerPhone,
        p_booker_email: bookerEmail || null,
        p_pickup_location: pickupLocation || null,
        p_passengers: passengers,
      });
      if (error) return mapRpcError(error);
      await refreshSeats();
      return { ok: true, booking: rowToBooking(data) };
    },
    [refreshSeats]
  );

  const updateBooking = useCallback(
    async (ref, { bookerName, bookerPhone, bookerEmail, pickupLocation, passengers }) => {
      const { data, error } = await supabase.rpc("update_booking", {
        p_ref: ref,
        p_booker_name: bookerName,
        p_booker_phone: bookerPhone,
        p_booker_email: bookerEmail || null,
        p_pickup_location: pickupLocation ?? null,
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

  const assignVan = useCallback(async (ref, van, passcode) => {
    const { data, error } = await supabase.rpc("assign_van", {
      p_passcode: passcode,
      p_ref: ref,
      p_van: van || null,
    });
    if (error) return mapRpcError(error);
    return { ok: true, booking: rowToBooking(data) };
  }, []);

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
    seatsLeftByRun,
    createBooking,
    updateBooking,
    cancelBooking,
    assignVan,
    findByRef,
    listBookings,
  };
}
