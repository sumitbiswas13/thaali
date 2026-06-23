import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Reports client layer. Filing a report goes through the Function (which
// verifies the caller, writes the row under RLS, and emails the admin) — same
// shape as account deletion. No direct table write from the browser, so the
// admin notification always fires server-side.
// ---------------------------------------------------------------------------

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or junk' },
  { value: 'inappropriate', label: 'Inappropriate or offensive' },
  { value: 'copyright', label: 'Copyright concern' },
  { value: 'other', label: 'Something else' },
];

// File a report. `reason` is one of REPORT_REASONS values; `note` is optional.
// Resolves on success; throws with a friendly message (including the
// already-reported and self-report cases).
export async function reportRecipe(recipeId, reason, note) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  let resp;
  try {
    resp = await fetch('/api/report-recipe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ recipe_id: recipeId, reason, note: note || '' }),
    });
  } catch {
    throw new Error('Network error — please try again.');
  }

  let payload = {};
  try {
    payload = await resp.json();
  } catch {
    /* non-JSON error body */
  }

  if (!resp.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not file your report. Please try again.');
  }
  return payload;
}
