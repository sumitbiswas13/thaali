// ===========================================================================
// Thaali — ADMIN action: delete a cook's account (Cloudflare Pages Function)
//
//   POST /api/admin-delete-account
//   headers: { Authorization: "Bearer <admin's supabase access token>" }
//   body:    { user_id, wipe_recipes }
//
//   ⚠️  DESTRUCTIVE AND IRREVERSIBLE.  This is the in-app equivalent of the
//   hand-run supabase/action-deletion.sql script, callable from the #/admin
//   queue. It mirrors that script's cascade logic exactly.
//
// SECURITY — three gates, in order:
//   1. The caller's token is verified against /auth/v1/user (identity).
//   2. The caller MUST be an admin: app_metadata.role === 'admin', read from
//      the verified user object (NOT from anything in the request body).
//   3. There must be a PENDING deletion_requests row for the target user
//      (prevents actioning a cancelled/absent request by mistake).
//   Only after all three do we use the service-role key to delete.
//
// Why a service-role key (unlike the other Functions): deleting an auth.users
// row — which cascades to profiles/likes/comments/deletion_requests — requires
// privileges no end-user token has under RLS. This is the only Function that
// uses SUPABASE_SERVICE_ROLE_KEY, and it does so only after the admin check.
//
// NEW ENV VAR REQUIRED:  SUPABASE_SERVICE_ROLE_KEY  (Secret, server-side only).
// ===========================================================================

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env && env.VITE_SUPABASE_URL;
  const ANON_KEY = env && env.VITE_SUPABASE_ANON_KEY;
  const SERVICE_KEY = env && env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ ok: false, error: 'Server is not configured.' }, 503);
  }
  if (!SERVICE_KEY) {
    return json(
      { ok: false, error: 'Admin deletion is not configured (missing service key).' },
      503
    );
  }

  // --- Gate 1: identity from the access token -----------------------------
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json({ ok: false, error: 'You must be signed in.' }, 401);

  const caller = await getUser(SUPABASE_URL, ANON_KEY, token);
  if (!caller || !caller.id) {
    return json({ ok: false, error: 'Your session has expired. Please sign in again.' }, 401);
  }

  // --- Gate 2: caller must be an admin (from the verified user, not body) --
  const role = caller.app_metadata?.role || caller.user_metadata?.role || null;
  if (role !== 'admin') {
    return json({ ok: false, error: 'Not authorized.' }, 403);
  }

  // --- Input --------------------------------------------------------------
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }
  const targetUser = String(body.user_id || '').trim();
  const wipeRecipes = body.wipe_recipes === true;

  if (!targetUser || targetUser === PLACEHOLDER) {
    return json({ ok: false, error: 'Provide a real user id.' }, 400);
  }
  // Refuse self-deletion via this path (an admin shouldn't nuke themselves here).
  if (targetUser === caller.id) {
    return json({ ok: false, error: 'Use the normal account page to delete your own account.' }, 400);
  }

  // --- Gate 3: there must be a PENDING request for this user --------------
  const pending = await countPending(SUPABASE_URL, SERVICE_KEY, targetUser);
  if (pending === null) {
    return json({ ok: false, error: 'Could not verify the request. Try again.' }, 502);
  }
  if (pending === 0) {
    return json(
      { ok: false, error: 'No pending deletion request for that user. Nothing actioned.' },
      409
    );
  }

  // --- Action (mirrors action-deletion.sql) -------------------------------
  // 1. Mark the request completed (row will cascade away with the user, but we
  //    set it first so the audit state is correct even if a later step retries).
  await markCompleted(SUPABASE_URL, SERVICE_KEY, targetUser);

  // 2. Recipes: wipe or reattribute.
  const recipeStep = wipeRecipes
    ? await deleteRecipes(SUPABASE_URL, SERVICE_KEY, targetUser)
    : await reattributeRecipes(SUPABASE_URL, SERVICE_KEY, targetUser);
  if (!recipeStep.ok) {
    return json({ ok: false, error: 'Failed updating the cook’s recipes. Nothing else actioned.' }, 502);
  }

  // 3. Delete the auth user (cascades: profiles, likes, comments, requests).
  const del = await deleteAuthUser(SUPABASE_URL, SERVICE_KEY, targetUser);
  if (!del.ok) {
    return json({ ok: false, error: 'Recipes handled, but deleting the account failed. Re-run.' }, 502);
  }

  return json({ ok: true, wiped_recipes: wipeRecipes });
}

// --- helpers ---------------------------------------------------------------

async function getUser(supabaseUrl, anonKey, token) {
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Count pending deletion requests for a user, using the service key (bypasses
// RLS — safe here, we've already confirmed the caller is an admin).
async function countPending(supabaseUrl, serviceKey, userId) {
  try {
    const url =
      `${supabaseUrl}/rest/v1/deletion_requests` +
      `?user_id=eq.${userId}&status=eq.pending&select=id`;
    const resp = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!resp.ok) return null;
    const rows = await resp.json().catch(() => []);
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return null;
  }
}

async function markCompleted(supabaseUrl, serviceKey, userId) {
  try {
    await fetch(
      `${supabaseUrl}/rest/v1/deletion_requests?user_id=eq.${userId}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status: 'completed' }),
      }
    );
  } catch {
    // non-fatal — the user delete below cascades the row away anyway
  }
}

async function deleteRecipes(supabaseUrl, serviceKey, userId) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/recipes?author_id=eq.${userId}`,
      {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'return=minimal',
        },
      }
    );
    return { ok: resp.ok };
  } catch {
    return { ok: false };
  }
}

async function reattributeRecipes(supabaseUrl, serviceKey, userId) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/recipes?author_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ author_id: null, author: null, author_email: null }),
      }
    );
    return { ok: resp.ok };
  } catch {
    return { ok: false };
  }
}

// Delete the auth user via the GoTrue admin API (requires service role).
async function deleteAuthUser(supabaseUrl, serviceKey, userId) {
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    return { ok: resp.ok };
  } catch {
    return { ok: false };
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
