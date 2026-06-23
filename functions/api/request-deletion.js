// ===========================================================================
// Thaali — account-deletion request handler (Cloudflare Pages Function)
//
//   POST /api/request-deletion
//   headers: { Authorization: "Bearer <supabase access token>" }
//   body:    { delete_recipes: boolean }
//
// Records a REQUEST to delete the caller's account. Does NOT delete anything —
// the admin actions the request by hand (supabase/action-deletion SQL) after a
// 24–48h grace window. This Function:
//   1. verifies the caller's identity from their Supabase access token (never
//      trusts an id/email from the request body),
//   2. inserts a pending deletion_requests row AS THAT USER (so Supabase RLS is
//      the real gate and a duplicate pending request is rejected by the DB),
//   3. emails the admin the full review packet so they can action it.
//
// No SUPABASE_SERVICE_ROLE_KEY is needed: every DB touch runs through the
// caller's own token under RLS, exactly as the browser would.
// ===========================================================================

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

// Where the deletion-review notification lands / is sent as. Reuses the same
// env vars as the contact form so there's nothing new to configure.
const DEFAULT_CONTACT_EMAIL = 'contact.thaali@gmail.com';

// Grace window the cook is told about (and the admin waits) before actioning.
const GRACE_HOURS = 48;

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env && env.VITE_SUPABASE_URL;
  const ANON_KEY = env && env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ ok: false, error: 'Server is not configured.' }, 503);
  }

  // --- Identify the caller from their access token ------------------------
  // The ONLY trusted source of who is asking. Anything in the body is ignored
  // for identity. A missing/invalid/expired token → 401, no row written.
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return json({ ok: false, error: 'You must be signed in.' }, 401);
  }

  const user = await getUser(SUPABASE_URL, ANON_KEY, token);
  if (!user || !user.id) {
    return json({ ok: false, error: 'Your session has expired. Please sign in again.' }, 401);
  }

  // --- Read the one input we accept ---------------------------------------
  let body = {};
  try {
    body = await request.json();
  } catch {
    // tolerate an empty body — delete_recipes simply defaults to false
    body = {};
  }
  const deleteRecipes = body.delete_recipes === true;

  // Display name for the review email (best-effort; from the user metadata).
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.email ? user.email.split('@')[0] : 'A Thaali cook');

  // --- Write the pending request AS the caller (RLS enforces self + dedupe) --
  const insert = await insertRequest(SUPABASE_URL, ANON_KEY, token, {
    user_id: user.id,
    email: user.email || null,
    display_name: displayName,
    delete_recipes: deleteRecipes,
  });

  if (insert.duplicate) {
    return json(
      { ok: false, error: 'You already have a deletion request pending.', code: 'pending_exists' },
      409
    );
  }
  if (!insert.ok) {
    return json({ ok: false, error: 'Could not record your request. Please try again.' }, 502);
  }

  // --- Notify the admin (best-effort; the request is already recorded) ----
  // If the email fails we DON'T fail the request — the row is the source of
  // truth and the admin can also watch the queue. But we try hard to send it.
  try {
    await notifyAdmin(env, {
      user,
      displayName,
      deleteRecipes,
      requestedAt: insert.requested_at,
    });
  } catch (err) {
    // swallow — recording the request succeeded, which is what matters
  }

  return json({
    ok: true,
    grace_hours: GRACE_HOURS,
    contact_email: (env && env.CONTACT_TO_EMAIL) || DEFAULT_CONTACT_EMAIL,
  });
}

// Resolve the Supabase user behind an access token. Returns the user object
// or null. Uses the public GoTrue /auth/v1/user endpoint — the same call the
// JS client makes — so no service-role key is involved.
async function getUser(supabaseUrl, anonKey, token) {
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Insert the pending request via PostgREST using the caller's own token, so
// RLS applies exactly as in the browser. The partial unique index on
// (user_id) where status='pending' makes a second live request fail with
// Postgres error 23505 — we surface that as a friendly "already pending".
async function insertRequest(supabaseUrl, anonKey, token, row) {
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/deletion_requests`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: row.user_id,
        email: row.email,
        display_name: row.display_name,
        delete_recipes: row.delete_recipes,
        status: 'pending',
      }),
    });

    if (resp.status === 409) {
      return { ok: false, duplicate: true };
    }
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      // 23505 = unique_violation (the one-pending index). Treat as duplicate.
      if (detail.includes('23505') || detail.includes('deletion_requests_one_pending')) {
        return { ok: false, duplicate: true };
      }
      return { ok: false };
    }

    const data = await resp.json().catch(() => []);
    const created = Array.isArray(data) ? data[0] : data;
    return { ok: true, requested_at: created?.requested_at || new Date().toISOString() };
  } catch {
    return { ok: false };
  }
}

// Build + send the admin review email. Prefers Brevo (same as contact.js),
// falls back to Resend if that's what's configured.
async function notifyAdmin(env, { user, displayName, deleteRecipes, requestedAt }) {
  const TO_ADDRESS = (env && env.CONTACT_TO_EMAIL) || DEFAULT_CONTACT_EMAIL;
  const FROM_ADDRESS = (env && env.CONTACT_FROM_EMAIL) || TO_ADDRESS;

  const eligibleAfter = new Date(
    new Date(requestedAt).getTime() + GRACE_HOURS * 3600 * 1000
  ).toISOString();

  const subject = `[Thaali] Account deletion requested — ${displayName}`;
  const textBody =
    `A cook has requested account deletion.\n\n` +
    `Display name : ${displayName}\n` +
    `Email        : ${user.email || '(none)'}\n` +
    `User ID      : ${user.id}\n` +
    `Delete recipes too? : ${deleteRecipes ? 'YES — wipe their recipes' : 'No — keep & reattribute to "A Thaali cook"'}\n` +
    `Requested at : ${requestedAt}\n` +
    `Eligible after (${GRACE_HOURS}h grace): ${eligibleAfter}\n\n` +
    `To action this request, open supabase/action-deletion.sql, set\n` +
    `  target_user uuid := '${user.id}';\n` +
    `and (if wiping recipes) set delete_recipes := ${deleteRecipes ? 'true' : 'false'};\n` +
    `then run it in the Supabase SQL Editor — but ONLY after the grace window,\n` +
    `and only if the cook hasn't emailed to cancel.\n`;

  if (env && env.BREVO_API_KEY) {
    await sendViaBrevo(env.BREVO_API_KEY, { subject, textBody, toAddress: TO_ADDRESS, fromAddress: FROM_ADDRESS });
  } else if (env && env.RESEND_API_KEY) {
    await sendViaResend(env.RESEND_API_KEY, { subject, textBody, toAddress: TO_ADDRESS, fromAddress: FROM_ADDRESS });
  } else {
    throw new Error('No email provider configured');
  }
}

async function sendViaBrevo(apiKey, { subject, textBody, toAddress, fromAddress }) {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromAddress, name: 'Thaali' },
      to: [{ email: toAddress }],
      subject,
      textContent: textBody,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Brevo ${resp.status}: ${detail}`);
  }
}

async function sendViaResend(apiKey, { subject, textBody, toAddress, fromAddress }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Thaali <${fromAddress}>`,
      to: [toAddress],
      subject,
      text: textBody,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Resend ${resp.status}: ${detail}`);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
