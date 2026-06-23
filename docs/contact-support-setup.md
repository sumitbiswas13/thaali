# Thaali — Contact form & News feed setup

Two new features were added: a **News feed** (`#/news`) and a **Contact &
support** form (`#/contact`). Both rely on Cloudflare Pages Functions
(`functions/api/news.js` and `functions/api/contact.js`). This doc covers the
one-time setup so they work in production.

---

## A. Contact form → email to you

The contact form posts to `/api/contact`, which sends an email to
**contact@thaali.app**. You then forward `contact@thaali.app` →
**sumitbiswas@hotmail.com** via Cloudflare Email Routing.

There are two pieces: **(1) sending** the email, and **(2) forwarding** it to
your Hotmail.

### Step 1 — Sending email (Resend)

The Function uses [Resend](https://resend.com) to send mail. Free tier is 3,000
emails/month — far more than a contact form will ever need.

1. **Create a Resend account** at https://resend.com (free, no card).
2. **Add & verify your domain** `thaali.app`:
   - Resend → **Domains** → **Add Domain** → enter `thaali.app`.
   - Resend shows you 3 DNS records (an MX, an SPF `TXT`, and a DKIM `TXT`).
   - Add each one in **Cloudflare → DNS → Records** for `thaali.app`.
     **Important:** set these DNS records to **DNS only** (grey cloud), not
     proxied (orange cloud).
   - Back in Resend, click **Verify**. Takes a few minutes.
3. **Create an API key:** Resend → **API Keys** → **Create** → copy it
   (starts with `re_…`). You only see it once.
4. **Add the key to Cloudflare Pages:**
   - Cloudflare → **Workers & Pages → thaali → Settings → Variables and Secrets**.
   - Under **Environment variables** (Production), add:
     - Name: `RESEND_API_KEY`  Value: `re_…your key…`
   - Click **Encrypt** so it's stored as a secret, then **Save**.
   - Redeploy (any push, or **Deployments → Retry deployment**) so the
     Function picks up the new variable.

> The Function's `FROM_ADDRESS` is `noreply@thaali.app`. That address only
> needs to be on the verified domain — you don't need a real mailbox for it.
> The cook's own email is set as **reply-to**, so you can just hit "Reply" in
> Hotmail to answer them.

### Step 2 — Forwarding contact@thaali.app → your Hotmail

This is the Cloudflare Email Routing piece (the one noted as "still
unconfigured" in earlier sessions).

1. Cloudflare → select **thaali.app** → **Email → Email Routing**.
2. If it's the first time, click **Get started / Enable Email Routing**.
   Cloudflare will offer to **add the required MX + TXT records
   automatically** — accept that. (If you see the stuck/!"Add records
   automatically" state from before, use **Disable → re-enable** to reset it,
   then let it add the records.)
3. Under **Destination addresses**, add **sumitbiswas@hotmail.com** and click
   the verification link Cloudflare emails to that Hotmail inbox.
4. Under **Routing rules → Custom addresses**, create:
   - Custom address: `contact@thaali.app`
   - Action: **Send to** → `sumitbiswas@hotmail.com`
5. Save. Send a test through the form — it should land in your Hotmail.

> **DNS note — MX coexistence:** Resend's *sending* uses its own MX on a
> subdomain (e.g. `send.thaali.app`), while Cloudflare Email Routing's
> *receiving* MX is on the root `thaali.app`. They don't collide. Just make
> sure you don't delete the Email Routing MX records when adding Resend's.

### Alternative (no Resend)

If you'd rather not use Resend, you can swap `sendViaResend()` in
`functions/api/contact.js` for any HTTP email provider (Postmark, Brevo,
SendGrid, Mailgun, etc.) — they all take an API key + a POST. The rest of the
Function (validation, length caps, reply-to) stays the same. Until a provider
key is set, the form returns a friendly "not fully configured yet" message
rather than failing silently.

---

## B. News feed → Guardian

The News page calls `/api/news`, which pulls food/cooking stories from
**The Guardian's `food` section**. The Guardian gives **non-profit projects a
free key** — which is exactly Thaali.

**It works with NO setup** (it falls back to the Guardian Food RSS feed, which
needs no key). To get richer cards (better thumbnails, summaries, bylines),
add a free key:

1. Get a key at https://open-platform.theguardian.com/access/ → choose the
   **Developer / non-commercial** key (free, instant, no card).
2. Cloudflare → **thaali → Settings → Variables and Secrets → Environment
   variables** → add:
   - Name: `GUARDIAN_API_KEY`  Value: `your-key`
   - Encrypt + Save, then redeploy.

The feed is cached at Cloudflare's edge for 30 minutes and again in the browser
for 10 minutes, so the upstream API is hit a couple of times an hour at most —
nowhere near the free 500/day floor.

---

## Quick reference — new env vars

| Variable | Where | Required? | Purpose |
|---|---|---|---|
| `RESEND_API_KEY` | Cloudflare Pages env (secret) | Yes, for contact form | Sends contact emails |
| `GUARDIAN_API_KEY` | Cloudflare Pages env (secret) | Optional | Richer news cards (RSS fallback otherwise) |

## New routes & files

```
#/news      News feed (food stories)
#/contact   Contact & support form (footer link)

functions/api/news.js      Guardian food news (API + RSS fallback, edge-cached)
functions/api/contact.js   Contact form → email via Resend
src/lib/news.js            client news fetcher (in-memory cache)
src/views/News.js          News page
src/views/Contact.js       Contact form page
```
