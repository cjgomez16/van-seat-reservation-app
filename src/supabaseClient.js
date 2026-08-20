import { createClient } from "@supabase/supabase-js";

/*
  Supabase client. Reads Vite env vars (see .env.example). If either is
  missing, the app falls back to the in-memory store (src/store.memory.js)
  so it still runs for local demos without a backend.
*/

const url = import.meta.env.VITE_SUPABASE_URL;
// Accepts either Supabase's new publishable key (sb_publishable_...) or the
// legacy anon key — both are browser-safe with RLS enabled.
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = isSupabaseConfigured ? createClient(url, key) : null;
