import { createClient } from '@supabase/supabase-js';

// Flip to true once your .env has the two Supabase vars filled in.
export const USE_SUPABASE = true;

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only construct a real client when configured; otherwise auth.js falls back to mock.
export const supabase =
  USE_SUPABASE && url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // needed for magic-link + OAuth redirects
        },
      })
    : null;

export function isSupabaseReady() {
  return Boolean(supabase);
}
