// Supabase client — wired at the Supabase stage (handoff step 4).
//
// Until you add real keys to a .env file, this stays inert and the app runs
// on mock data (see src/lib/mockData.js). When you're ready:
//
//   1. Create a .env file (copy .env.example)
//   2. Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
//   3. Set USE_SUPABASE to true below
//
// IMPORTANT: only the anon (public) key belongs here. The service-role key
// must NEVER be VITE_-prefixed or shipped to the browser — it goes only in a
// Cloudflare Pages Function / Supabase Edge Function.

import { createClient } from '@supabase/supabase-js';

export const USE_SUPABASE = false;

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  USE_SUPABASE && url && anonKey ? createClient(url, anonKey) : null;
