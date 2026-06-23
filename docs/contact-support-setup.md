# Thaali — Setup runbook: Contact form + News feed + CAPTCHA

This is the one-time setup for the two features (News feed at `#/news`, Contact
form at `#/contact`) plus the optional CAPTCHA. Do the sections **in order: A → B → C**.

Everything is driven by Cloudflare Pages Functions (`functions/api/news.js`,
`functions/api/contact.js`) plus a few environment variables. There's no SQL.

**TL;DR of what you'll set up:**

| Order | Section | What it does | Required? |
|---|---|---|---|
| A | Contact email (Brevo + Gmail) | Form sends mail → lands in a Thaali Gmail inbox | Yes (for the form to work) |
| B | News feed (Guardian) | Food stories on the News page | Works already; key optional |
| C | CAPTCHA (Cloudflare Turnstile) | Bot protection on the contact form | Optional |

> **Why Brevo, not Resend?** Resend's free tier allows only one domain per
> account, and you've used that on another project. Brevo's free tier is 300
> emails/day and lets you verify a single *sender email* with no domain-count
> limit — so it works without touching your Resend account. The Function tries
> Brevo first (`BREVO_API_KEY`) and falls back to Resend (`RESEND_API_KEY`) if
> you ever prefer that.

---

# A. Contact form → your Thaali Gmail

No `thaali.app` email addresses are involved. You create one Gmail (e.g.
`contact.thaali@gmail.com`), and every form submission is emailed straight to
it. The cook's own address rides along as **Reply-To**, so you just hit Reply
in Gmail to answer them.

You still need a free **Brevo** account — that's the service that actually
*sends* the email to your Gmail (Gmail is the mailbox; Brevo is the postman).
There's no Cloudflare Email Routing and no virtual address.

### Steps

1. **Create the Gmail.** e.g. `contact.thaali@gmail.com`. This is both the
   inbox you'll read and the verified sender.
2. **Create a free Brevo account** at https://www.brevo.com (no card needed).
   Sign up using that same Gmail, or any email — doesn't matter.
3. **Verify the Gmail as a sender.** Brevo → **Senders, Domains & Dedicated IPs
   → Senders → Add a sender** → enter `contact.thaali@gmail.com`. Brevo emails a
   confirmation link to it; open Gmail, click the link. (Because it's a real
   Gmail inbox, the link just arrives — no domain setup, no chicken-and-egg.)
4. **Create an API key.** Brevo → **SMTP & API → API Keys → Generate a new API
   key.** Copy it (starts with `xkeysib-…`).
5. **Add three variables** in Cloudflare → **Workers & Pages → thaali →
   Settings → Variables and Secrets → Environment variables (Production)**:
   - `BREVO_API_KEY` = `xkeysib-…`  → **Encrypt**
   - `CONTACT_TO_EMAIL` = `contact.thaali@gmail.com`  (where messages land)
   - `CONTACT_FROM_EMAIL` = `contact.thaali@gmail.com`  (the verified sender)
   - Then **Save**.
6. **Redeploy** (push, or **Deployments → Retry deployment**) so the Function
   picks up the new variables.

> `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` can be the same Gmail (simplest),
> or different if you ever want to read mail in one place and send from another.
> If you leave them unset, the Function falls back to `contact.thaali@gmail.com`
> — so set them to whatever Gmail you actually create.

> **Deliverability note:** sending from a `@gmail.com` address via Brevo works
> fine for mail going to your own inbox. Gmail may show a faint "via brevo"
> note; that's harmless here. (A custom domain sender looks cleaner, but you've
> chosen to avoid domain email — this is the tradeoff, and it's a fine one.)

---

# B. News feed → Guardian

The News page (`#/news`) calls `/api/news`, which pulls food/cooking stories
from **The Guardian's `food` section**. The Guardian gives non-profit projects
a free key — which is exactly Thaali.

**It already works with NO setup** — with no key, it falls back to the Guardian
Food RSS feed (no key needed). To get richer cards (better thumbnails,
summaries, bylines), add a free key:

1. Get a key at https://open-platform.theguardian.com/access/ → choose the
   **Developer / non-commercial** key (free, instant, no card).
2. Cloudflare → **thaali → Settings → Variables and Secrets → Environment
   variables**:
   - Name: `GUARDIAN_API_KEY`   Value: your key  → **Encrypt** → **Save**.
3. Redeploy.

The feed is cached at Cloudflare's edge for 30 min and in the browser for 10
min, so the upstream API is hit only a couple of times an hour — nowhere near
the free 500/day floor.

---

# C. Contact form CAPTCHA (Cloudflare Turnstile)

Adds a Turnstile widget below the Message box. **Send stays disabled until the
visitor passes the check** (the green tick), and the Function verifies the
token server-side before sending, so a bot can't skip it.

Turnstile is free with no usage cap, privacy-friendly (no Google tracking),
and usually shows a tick with no interaction.

**Optional.** With no keys set, the form renders without the widget and still
sends. Turn it on:

1. Cloudflare Dashboard → **Turnstile → Add widget.**
   - Name: `Thaali contact`
   - Hostnames: `thaali.app` (add `localhost` too if you test locally)
   - Widget mode: **Managed** (recommended)
2. Cloudflare shows a **Site Key** (public) and a **Secret Key** (private).
3. Add **both** to **thaali → Settings → Variables and Secrets → Environment
   variables (Production)**:
   - `VITE_TURNSTILE_SITE_KEY` = the **site** key. This is a *build-time* var
     (Vite inlines it into the browser bundle), so a plain variable is fine —
     it's public by design.
   - `TURNSTILE_SECRET_KEY` = the **secret** key. **Encrypt** this one.
4. **Redeploy** so the build picks up the site key and the Function picks up the
   secret.

> Set both together. Site key alone → widget shows but server doesn't enforce.
> Secret key alone → widget won't render and the server rejects every
> submission (no token). The secret key is the security boundary — make sure
> it's added as an **encrypted** variable, never plain.

---

## Quick reference — env vars

| Variable | Where | Required? | Purpose |
|---|---|---|---|
| `BREVO_API_KEY` | Cloudflare Pages env (secret) | Yes, for contact form | Sends contact emails |
| `CONTACT_TO_EMAIL` | Cloudflare Pages env | Recommended | Inbox where messages land (Gmail) |
| `CONTACT_FROM_EMAIL` | Cloudflare Pages env | Recommended | Verified Brevo sender (same Gmail) |
| `RESEND_API_KEY` | Cloudflare Pages env (secret) | Optional fallback | Alternative sender |
| `GUARDIAN_API_KEY` | Cloudflare Pages env (secret) | Optional | Richer news cards (RSS fallback otherwise) |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Pages env (build var) | Optional | CAPTCHA widget (public site key) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Pages env (secret) | Optional | Server-side CAPTCHA verification |

## New routes & files

```
#/news      News feed (food stories)
#/contact   Contact & support form (footer link)

functions/api/news.js      Guardian food news (API + RSS fallback, edge-cached)
functions/api/contact.js   Contact form → email (Brevo, Resend fallback) + Turnstile verify
src/lib/news.js            client news fetcher (in-memory cache)
src/lib/config.js          public client config (Turnstile site key)
src/views/News.js          News page
src/views/Contact.js       Contact form page (with Turnstile widget)
```
