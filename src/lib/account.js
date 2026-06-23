import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Account-deletion client layer.
//
// Deletion is a REQUEST, not an instant action. The cook submits a request;
// it goes to a queue and the admin actions it by hand after a grace window.
// The cook keeps full site access while a request is pending and can cancel.
//
//   requestDeletion()      → POST /api/request-deletion (server verifies JWT,
//                            records the row, emails the admin)
//   fetchPendingDeletion() → the caller's current pending request, or null
//   cancelDeletion()       → flip the caller's pending request to 'cancelled'
//
// The two read/cancel helpers talk to Supabase directly under RLS (the cook
// can only see / cancel their own row). Only the create path goes through the
// Function, because that's where the admin notification email is sent.
// ---------------------------------------------------------------------------

// Submit a deletion request. `deleteRecipes` true = wipe their recipes too;
// false = keep them, reattributed to "A Thaali cook".
// Returns { ok, grace_hours, contact_email } on success; throws on failure
// (with a friendly message, including the "already pending" case).
export async function requestDeletion(deleteRecipes) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  let resp;
  try {
    resp = await fetch('/api/request-deletion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ delete_recipes: deleteRecipes === true }),
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
    throw new Error(payload.error || 'Could not submit your request. Please try again.');
  }
  return payload;
}

// The caller's current PENDING deletion request, or null. RLS guarantees a
// cook only ever sees their own rows.
export async function fetchPendingDeletion() {
  if (!isSupabaseReady()) return null;
  const user = currentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('deletion_requests')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Cancel the caller's pending request (pending → cancelled). RLS only allows a
// cook to set their own row to 'cancelled'.
export async function cancelDeletion(requestId) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');

  const { error } = await supabase
    .from('deletion_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('user_id', user.id)
    .eq('status', 'pending');
  if (error) throw error;
}
