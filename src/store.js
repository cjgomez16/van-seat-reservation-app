/*
  BACKEND SELECTOR — the single import components use for booking data.
  Picks Supabase when env vars are present (src/store.supabase.js),
  otherwise the in-memory fallback (src/store.memory.js). Both expose
  the identical async, ref-keyed API, so App.jsx never branches on it.
*/

import { isSupabaseConfigured } from "./supabaseClient.js";
import { useMemoryBookings } from "./store.memory.js";
import { useSupabaseBookings } from "./store.supabase.js";

export const BACKEND = isSupabaseConfigured ? "supabase" : "memory";

export const useBookings = isSupabaseConfigured
  ? useSupabaseBookings
  : useMemoryBookings;
