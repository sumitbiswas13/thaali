// ===========================================================================
// Thaali — recipe report handler (Cloudflare Pages Function)
//
//   POST /api/report-recipe
//   headers: { Authorization: "Bearer <supabase access token>" }
//   body:    { recipe_id, reason, note }
//
// Records a cook's report of a recipe and emails the admin to review. Mirrors
// request-deletion.js: verifies the caller's token (never trusts a reporter id
// from the body), inserts the row AS that user so RLS is the real gate (self
// only, can't report own recipe, one report per cook per recipe), then notifies
// the admin. No SUPABASE_SERVICE_ROLE_KEY needed.
// ===========================================================================

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const DEFAULT_CONTACT_EMAIL = 'contact.thaaliapp@gmail.com';
const VALID_REASONS = ['spam', 'inappropriate', 'copyright', 'other'];
const NOTE_MAX = 1000;

export async function onRequestPost({ request, env }) {
  const SUPABASE_URL = env && env.VITE_SUPABASE_URL;
  const ANON_KEY = env && env.VITE_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ ok: false, error: 'Server is not configured.' }, 503);
  }

  // --- Identify the caller from their access token ------------------------
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json({ ok: false, error: 'You must be signed in.' }, 401);

  const user = await getUser(SUPABASE_URL, ANON_KEY, token);
  if (!user || !user.id) {
    return json({ ok: false, error: 'Your session has expired. Please sign in again.' }, 401);
  }

  // --- Validate input -----------------------------------------------------
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  const recipeId = String(body.recipe_id || '').trim();
  const reason = String(body.reason || '').trim().toLowerCase();
  const note = String(body.note || '').trim().slice(0, NOTE_MAX);

  if (!recipeId) return json({ ok: false, error: 'Missing recipe.' }, 400);
  if (!VALID_REASONS.includes(reason)) {
    return json({ ok: false, error: 'Please choose a valid reason.' }, 400);
  }

  // --- Write the report AS the caller (RLS enforces self + no-self-report +
  //     dedupe). A duplicate (already reported) surfaces as a friendly note. --
  const insert = await insertReport(SUPABASE_URL, ANON_KEY, token, {
    recipe_id: recipeId,
    reporter_id: user.id,
    reason,
    note,
  });

  if (insert.duplicate) {
    return json(
      { ok: false, error: "You've already reported this recipe.", code: 'already_reported' },
      409
    );
  }
  if (insert.forbidden) {
    // RLS check failed — almost always a self-report attempt.
    return json({ ok: false, error: "You can't report your own recipe." }, 403);
  }
  if (!insert.ok) {
    return json({ ok: false, error: 'Could not file your report. Please try again.' }, 502);
  }

  // --- Notify the admin (best-effort; the row is the source of truth) -----
  try {
    await notifyAdmin(env, {
      user,
      recipeId,
      reason,
      note,
      createdAt: insert.created_at,
    });
  } catch {
    // swallow — the report is recorded, which is what matters
  }

  return json({ ok: true });
}

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

async function insertReport(supabaseUrl, anonKey, token, row) {
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/reports`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        recipe_id: row.recipe_id,
        reporter_id: row.reporter_id,
        reason: row.reason,
        note: row.note,
        status: 'open',
      }),
    });

    if (resp.status === 409) return { ok: false, duplicate: true };
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      if (detail.includes('23505') || detail.includes('reports_recipe_id_reporter_id_key')) {
        return { ok: false, duplicate: true };
      }
      // RLS with-check failure (e.g. self-report) returns 401/403 from PostgREST.
      if (resp.status === 401 || resp.status === 403 || detail.includes('row-level security')) {
        return { ok: false, forbidden: true };
      }
      return { ok: false };
    }

    const data = await resp.json().catch(() => []);
    const created = Array.isArray(data) ? data[0] : data;
    return { ok: true, created_at: created?.created_at || new Date().toISOString() };
  } catch {
    return { ok: false };
  }
}

async function notifyAdmin(env, { user, recipeId, reason, note, createdAt }) {
  const TO_ADDRESS = (env && env.CONTACT_TO_EMAIL) || DEFAULT_CONTACT_EMAIL;
  const FROM_ADDRESS = (env && env.CONTACT_FROM_EMAIL) || TO_ADDRESS;

  const reporterName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.email ? user.email.split('@')[0] : 'A Thaali cook');

  // Best-effort link straight to the reported recipe (by uuid; the resolver
  // handles uuid keys for back-compat).
  const recipeLink = `https://thaali.app/#/recipe?id=${recipeId}`;

  const subject = `[Thaali] Recipe reported — ${reason}`;
  const textBody =
    `A recipe has been reported.\n\n` +
    `Reason     : ${reason}\n` +
    `Note       : ${note || '(none)'}\n` +
    `Recipe     : ${recipeLink}\n` +
    `Recipe ID  : ${recipeId}\n` +
    `Reporter   : ${reporterName} <${user.email || 'unknown'}> (${user.id})\n` +
    `Reported at: ${createdAt}\n\n` +
    `Review the recipe and, if needed, edit or delete it from the recipe page\n` +
    `(you have admin powers). No automatic action has been taken.\n`;

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
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
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
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
