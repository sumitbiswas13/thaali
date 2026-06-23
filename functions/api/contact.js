// ===========================================================================
// Thaali — contact / support form handler (Cloudflare Pages Function)
//
//   POST /api/contact   body: { email, subject, message }
//
// Sends the message to contact@thaali.app (which you forward on to your
// personal inbox via Cloudflare Email Routing — see docs/contact-support-setup.md).
//
// Email delivery: uses Resend if RESEND_API_KEY is configured (recommended —
// reliable, free tier of 3,000 emails/month). The `email` field is the signed-in
// cook's address; we DON'T trust it blindly for auth, but it's set as reply-to
// so you can just hit "reply" to answer the cook.
//
// Guards: validates inputs, enforces the same length caps the form shows, and
// rejects header-injection attempts in the subject. This runs on the trusted
// edge and touches no Supabase data.
// ===========================================================================

// Where contact-form messages land, and who they're sent as. Both come from
// env vars so there are no thaali.app addresses involved — just one Gmail you
// create and verify with Brevo. CONTACT_FROM_EMAIL must be a sender you've
// verified in Brevo; the simplest setup is to use the SAME Gmail for both.
const DEFAULT_CONTACT_EMAIL = 'contact.thaaliapp@gmail.com';
const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export async function onRequestPost({ request, env }) {
  // Resolve the to/from addresses (env first, then a sane default).
  const TO_ADDRESS = (env && env.CONTACT_TO_EMAIL) || DEFAULT_CONTACT_EMAIL;
  const FROM_ADDRESS = (env && env.CONTACT_FROM_EMAIL) || TO_ADDRESS;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }

  const email = String(body.email || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  const turnstileToken = String(body.turnstileToken || '').trim();

  // --- Validate -----------------------------------------------------------
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: 'A valid email is required.' }, 400);
  }
  if (!subject) return json({ ok: false, error: 'Please add a subject.' }, 400);
  if (subject.length > SUBJECT_MAX)
    return json({ ok: false, error: `Subject is too long (max ${SUBJECT_MAX}).` }, 400);
  if (!message) return json({ ok: false, error: 'Please add a message.' }, 400);
  if (message.length > MESSAGE_MAX)
    return json({ ok: false, error: `Message is too long (max ${MESSAGE_MAX}).` }, 400);
  // Header-injection guard: no newlines in the subject.
  if (/[\r\n]/.test(subject))
    return json({ ok: false, error: 'Subject contains invalid characters.' }, 400);

  // --- Bot check: verify the Turnstile token (mandatory when configured) --
  // This is the real gate. The browser widget alone proves nothing — a bot can
  // POST straight here and skip it, so we only trust a token Cloudflare confirms.
  if (env && env.TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return json({ ok: false, error: 'Please complete the verification.' }, 400);
    }
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
    if (!ok) {
      return json({ ok: false, error: 'Verification failed. Please try again.' }, 400);
    }
  }

  const cleanSubject = `[Thaali contact] ${subject}`;
  const textBody =
    `New message from the Thaali contact form\n\n` +
    `From: ${email}\n` +
    `Subject: ${subject}\n\n` +
    `${message}\n`;

  // --- Send ---------------------------------------------------------------
  // Prefer Brevo (free tier 300/day, verify a single sender email — no domain
  // limit), fall back to Resend if that's what you have configured instead.
  try {
    if (env && env.BREVO_API_KEY) {
      await sendViaBrevo(env.BREVO_API_KEY, { email, cleanSubject, textBody, toAddress: TO_ADDRESS, fromAddress: FROM_ADDRESS });
    } else if (env && env.RESEND_API_KEY) {
      await sendViaResend(env.RESEND_API_KEY, { email, cleanSubject, textBody, toAddress: TO_ADDRESS, fromAddress: FROM_ADDRESS });
    } else {
      // No provider configured — fail loudly so you notice during setup,
      // rather than silently swallowing a cook's message.
      return json(
        { ok: false, error: 'Contact form is not fully configured yet. Please email us directly.' },
        503
      );
    }
  } catch (err) {
    return json({ ok: false, error: 'Could not send your message. Please try again later.' }, 502);
  }

  return json({ ok: true });
}

// Verify a Turnstile token against Cloudflare's Siteverify endpoint.
// Returns true only if the token is authentic, unexpired, and unused.
async function verifyTurnstile(secret, token, ip) {
  const form = new URLSearchParams();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = await resp.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}

// Brevo — https://brevo.com (free tier 300 emails/day, no domain-count limit;
// just verify a single sender address). Set BREVO_API_KEY in Cloudflare Pages.
async function sendViaBrevo(apiKey, { email, cleanSubject, textBody, toAddress, fromAddress }) {
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
      replyTo: { email },
      subject: cleanSubject,
      textContent: textBody,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Brevo ${resp.status}: ${detail}`);
  }
}

// Resend — https://resend.com (free tier 3k/mo). Set RESEND_API_KEY in
// Cloudflare Pages → Settings → Environment variables.
async function sendViaResend(apiKey, { email, cleanSubject, textBody, toAddress, fromAddress }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Thaali <${fromAddress}>`,
      to: [toAddress],
      reply_to: email,
      subject: cleanSubject,
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
