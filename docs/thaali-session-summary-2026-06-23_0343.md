# Thaali — Session Summary (2026-06-23, ~03:43 PT)

> A free, ad-free community cookbook. By cooks, for everyone. No ads, no paywall, ever.
> Live at https://thaali.app · Everything behind sign-in (members-only).

---

## TL;DR

This session shipped two new features end-to-end — a **culinary News feed** and a
**Contact & support form** — plus a **Cloudflare Turnstile CAPTCHA** on the contact form,
a **header redesign** (avatar dropdown + un-squished buttons), and an **admin account
swap** to the production identity. Email sending moved to **Brevo** (Resend's one-domain
free-tier limit was already used by another project). All deployed, all green, and the
contact form + CAPTCHA were verified working in production. A meaty **account-deletion
feature** was fully designed and scoped but deliberately **parked for next session** (most
destructive feature on the site — deserves fresh, careful code).

---

## What got DONE this session

### 1. Culinary News feed  ✅ deployed
- New page at `#/news`; **News** button in the header between Browse and Add a recipe.
- **Source: The Guardian Open Platform API**, `food` section (free for non-profit
  projects — fits Thaali exactly). Chosen over GNews/NewsAPI (dev-only, ~100/day caps)
  and recipe APIs (Spoonacular/Edamam/TheMealDB are recipe *data*, not news).
- `functions/api/news.js` — Cloudflare Function: calls Guardian with `GUARDIAN_API_KEY`,
  **falls back to the Guardian Food RSS feed if no key** (so it works with zero setup).
  **30-min edge cache** + 10-min client in-memory cache → upstream hit only a couple
  times/hour, nowhere near the free 500/day floor.
- `src/lib/news.js` (client fetcher), `src/views/News.js` (page).
- **Fixes after first deploy:** stripped HTML from summaries (Guardian `trailText` ships
  `<p>…</p>`; the card was *escaping* not *stripping* — added `stripHtml`); request the
  larger `main` article image (`show-elements=image`, `pickImage()`) instead of tiny
  thumbnail; added "Read on The Guardian ↗" label on cards.
- **Decision:** articles open in a **new tab**, NOT in-app. The Guardian blocks iframing
  (`X-Frame-Options`), and re-rendering full article text would be republishing their
  content (not allowed under the free non-commercial license) + ongoing maintenance. New
  tab is the honest, legal, low-maintenance choice.
- `GUARDIAN_API_KEY` added to Cloudflare Pages env (encrypted). Guardian's email links to
  a *sample JSON response*, not the key — the key is the short UUID-style string.

### 2. Contact & support form  ✅ deployed + verified delivering
- New page at `#/contact`; **Contact & support** link in the footer.
- Form: disabled+prefilled **email** (from signed-in user), **Subject** (120-char cap +
  live counter), **Message** (4000-char cap + live counter). Graceful intro copy.
- `functions/api/contact.js` — validates, enforces caps, blocks header-injection,
  sends email. Cook's address set as **Reply-To** so you reply normally.
- **Email provider: Brevo** (free 300/day, verify a single sender *email* — no domain
  limit, which is why Resend was abandoned). Function tries Brevo (`BREVO_API_KEY`) first,
  falls back to Resend (`RESEND_API_KEY`) if ever set.
- **No thaali.app email addresses, no Cloudflare Email Routing.** Goes straight to a
  Gmail. `TO`/`FROM` are env-driven: `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL`, both set
  to `contact.thaaliapp@gmail.com`. (Defaults baked in if unset.)
- **Verified live:** test message arrived in `contact.thaaliapp@gmail.com` inbox (not
  spam), From "Thaali", with the sender's address as Reply-To. (Brevo shows the From as
  `…@<id>.brevosend.com` because the gmail domain isn't DKIM-authenticated — harmless;
  it's Brevo's deliverability protection for unauthenticated freemail senders.)

### 3. Cloudflare Turnstile CAPTCHA on contact form  ✅ deployed + verified blocking
- Widget renders **below the Message box**; **Send stays disabled until the green check**.
- **Explicit render** (required — SPA, form mounts after navigation). Script loaded once
  in `main.js` when `VITE_TURNSTILE_SITE_KEY` is present.
- **Server-side verification is the real gate:** `functions/api/contact.js` calls
  Cloudflare Siteverify with `TURNSTILE_SECRET_KEY` before sending. Bot POSTing without a
  valid token is rejected.
- Keys in Cloudflare Pages env: `VITE_TURNSTILE_SITE_KEY` (**Plaintext** — public,
  build-time inlined by Vite) and `TURNSTILE_SECRET_KEY` (**Secret/encrypted**).
- Feature-flagged: with no keys, the form renders without the widget and still sends.
- **Verified:** a console `fetch` to `/api/contact` with a fake token returned
  `HTTP 400 {ok:false, error:"Verification failed. Please try again."}` and **no email** —
  bot protection confirmed end-to-end. Managed mode auto-passes real humans invisibly.

### 4. Header redesign  ✅ deployed
- **Avatar → dropdown menu** (replaces standalone "Sign out" button). Dropdown has
  **Your profile** + **Sign out**. Toggle on avatar click, closes on outside-click/nav.
- **Fixed squished buttons:** root cause was `.btn` lacked `white-space: nowrap`, so
  "Add a recipe"/"Sign out" wrapped to two lines. Added nowrap.
- Touched: `layout.js` (avatar dropdown markup), `main.js` (toggle handler),
  `components.css` (dropdown + news styles), `tokens.css` (`.btn` nowrap).

### 5. Admin account swap → production identity  ✅ done in DB
- Admin role lives in `auth.users.raw_app_meta_data` as `{"role":"admin"}` (read by code's
  `isAdmin` → `app_metadata.role === 'admin'`). `app_meta_data` is correct/secure because
  users can't self-edit it.
- **Promoted** `contact.thaaliapp@gmail.com` (id `d6ea21f1-0775-4e2d-b6c9-c09723b5c1ff`):
  `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
  where email = 'contact.thaaliapp@gmail.com';` — then signed out/in (role is baked into
  the JWT at login). Verified: can edit/delete other users' recipes.
- **Deleted** old test admin `qmsb.dtc@gmail.com` (id `fc1d85c1-…328e19`) after clearing
  its attached rows (comments/likes/recipes/profiles). Done in safe order: promote new
  admin FIRST, verify, THEN delete old — never admin-less.

---

## Deploy state

| Item | Status |
|---|---|
| Cloudflare build (latest) | ✅ completed / success |
| News feed (Guardian API + RSS fallback) | deployed, live |
| Contact form (Brevo) | deployed, **verified delivering** |
| Turnstile CAPTCHA | deployed, **verified blocking** |
| Header avatar dropdown + nowrap buttons | deployed |
| Admin swap (DB only, no deploy) | done |

### Env vars now in Cloudflare Pages
| Variable | Type | Purpose |
|---|---|---|
| `BREVO_API_KEY` | Secret | Sends contact emails |
| `CONTACT_TO_EMAIL` | Plaintext | Inbox (`contact.thaaliapp@gmail.com`) |
| `CONTACT_FROM_EMAIL` | Plaintext | Verified Brevo sender (same Gmail) |
| `GUARDIAN_API_KEY` | Secret | Richer news cards (RSS fallback otherwise) |
| `VITE_TURNSTILE_SITE_KEY` | **Plaintext** | CAPTCHA widget (public, build-time) |
| `TURNSTILE_SECRET_KEY` | Secret | Server-side CAPTCHA verification |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | (existing) | Supabase |

### Accounts / services created this session
- **Gmail:** `contact.thaaliapp@gmail.com` — contact inbox + admin + Brevo sender.
- **Brevo:** free account (under "SumAryan Technologies" org — shares 300/day pool with
  Voxluma if that ever sends). Sender verified, API key issued.
- **Guardian Open Platform:** free developer (non-commercial) key.
- **Cloudflare Turnstile:** "Thaali contact" widget, Managed mode, hostname `thaali.app`.

---

## Still on the shelf / next ideas

### 1. ⏭️ Account deletion (FULLY DESIGNED — build next session)
The most destructive feature on the site; deliberately parked to build fresh & careful.

**Agreed design:**
- Avatar dropdown → **"Your account"** → account page (profile summary).
- **"Request Account Deletion"** → "Are you sure?" with **type DELETE** to confirm →
  **"Also delete your recipes?"** → **Yes** = full wipe / **No** = keep & reattribute.
- It's a **REQUEST → admin review queue**, not immediate. Cook told account will be
  deleted in **24–48h**; they can **email contact.thaaliapp@gmail.com to cancel** in that
  window.
- After requesting: account page shows grayed-out **"Account deletion requested"** + date
  + cancel-by-email line. **No second request while one is pending.**
- Cook **keeps full site access** during the pending window (haven't been deleted; may
  cancel).
- Kept recipes attributed to **"A Thaali cook"** (warm, on-brand — rejected Reddit-style
  "deleted user"). Leaning: **null `author_id` = sentinel** rendered as "A Thaali cook"
  (vs. a fake sentinel user row) — confirm against schema when building.

**Scope (new files):**
- `supabase/deletion-requests-YYYY-MM-DD.sql` — `deletion_requests` table
  (user_id, email, display_name, delete_recipes bool, status pending/cancelled/completed,
  requested_at) + RLS (cook insert/read **own only**).
- `functions/api/request-deletion.js` — verify caller JWT, write request row, send Brevo
  notification email to admin **with all review info** (name, email, user id, recipe
  choice, requested_at, eligible-after date); block duplicate pending request.
- `src/views/Account.js` — "Your account" page: profile summary + request flow
  (type-DELETE confirm → keep/delete choice) + pending grayed-out state.
- `supabase/action-deletion.sql` — **parameterized run-script** (set ONE user id at top):
  handles both wipe and keep-&-reattribute("A Thaali cook"), then deletes the auth user.
  Built so actioning a request is paste-id-and-run — no manual reconstruction, no
  wrong-account risk (Sumi's explicit reason for wanting a script).

**Scope (edits):** `layout.js` (add "Your account" to dropdown), `main.js` (`#/account`
route), `mockData.js` author lookup (render sentinel as "A Thaali cook").

**Phase 2 (later):** an in-app admin queue page (`#/admin`) with Approve/Cancel buttons.
Phase 1 = action via the run-script manually after the grace window. **Note:** Cloudflare
Pages Functions can't run cron — auto-delete-on-timer would need a CF Worker cron or
Supabase pg_cron; deliberately avoided for now (timer-based auto-deletion is risky).
**Secret note:** phase 1 may avoid `SUPABASE_SERVICE_ROLE_KEY` entirely (admin runs the
privileged delete by hand via the script); only an *automated* deletion Function would
need that key. Confirm when building.

### 2. ⏭️ Moderation AI agent (parked, earlier in session)
Catch harassment/junk/pornography. Recommended phased approach, NOT a full auto-agent now:
- Phase 1: a **Report button** → admin queue (now has a real admin to point at) + run
  comment **text** through a free moderation API (e.g. OpenAI moderation) at submission.
- Phase 2: **image** moderation (vision service, per-image cost, false-positive risk) —
  the harder part, given recipes allow up to 4 images. Add once volume justifies it.
- It's its own multi-batch project + external dependency/cost; not a tweak.

### 3. ⏭️ Google OAuth: Testing → Production
Still in **Testing** mode (only hand-added test users can sign in). To go live: Google
Cloud Console → APIs & Services → OAuth consent screen → **Publish app → production**.
Basic scopes (email/profile/openid — all Supabase needs) generally publish without formal
review (maybe an "unverified app" interstitial); sensitive/restricted scopes trigger a
verification process. **Check current Google rules before publishing** (policy shifts).
While there: confirm redirect URI includes
`https://wfijtozwdhrndjbvscab.supabase.co/auth/v1/callback`, and fill app name / support
email / privacy-policy link so the production screen looks trustworthy.

### 4. Carryover from prior sessions
- Comment/like counts pull all rows + tally client-side (fine at seed scale; switch to a
  Postgres aggregate/RPC if the DB grows).
- First-time cooks don't see uploaded avatar in header until one profile save runs.
- `Auth.js` email injected unescaped (one-line XSS fix; low risk, self-typed).
- Orphaned recipe images stay in the `recipe-images` bucket after removal (harmless;
  cleanup job later).
- Discovery/search ranking, follows, ratings (Phase 3 social roadmap).

---

## Quick reference

| Thing | Value |
|---|---|
| Live site | https://thaali.app |
| GitHub | `sumitbiswas13/thaali` (public) |
| Local path | `/Users/sumitbiswas25/thaali` |
| Deploy | `git push` to `main` → Cloudflare auto-builds |
| Verify build | `curl -s "https://api.github.com/repos/sumitbiswas13/thaali/commits/main/check-runs" \| grep -E '"name"\|"status"\|"conclusion"'` |
| Supabase project | `https://wfijtozwdhrndjbvscab.supabase.co` |
| Admin | `contact.thaaliapp@gmail.com` (id `d6ea21f1-0775-4e2d-b6c9-c09723b5c1ff`), role in `app_meta_data` |
| Contact inbox | `contact.thaaliapp@gmail.com` (via Brevo) |
| Stack | Vite + vanilla JS · Cloudflare Pages (+ Functions) · Supabase |

### Routes
```
#/         Landing (public teaser)
#/auth     Sign in (Google OAuth + magic link)
#/home     Browse — filters + ?q= search; like/comment counts
#/submit   Add a recipe   ·   #/submit?edit=<key>  Edit
#/recipe?id=<key>   Recipe detail (gallery, timers, source, like, share, comments, edit/delete)
#/profile           Own profile   ·   #/profile?id=<uid>  Another cook
#/news     Culinary news feed (Guardian)                          ← NEW this session
#/contact  Contact & support form (footer link; Brevo + Turnstile) ← NEW this session
#/account  "Your account" + deletion request                       ← NEXT SESSION (not built)
#/admin    Admin deletion queue                                    ← FUTURE (phase 2)
```

### New/changed files this session
```
functions/api/news.js       Guardian food news (API + RSS fallback, edge-cached, image+HTML fixes)
functions/api/contact.js    Contact form → Brevo (env TO/FROM) + Turnstile verify
src/lib/news.js             client news fetcher (in-memory cache)
src/lib/config.js           public client config (Turnstile site key)
src/views/News.js           News page (stripHtml, larger images, read-more label)
src/views/Contact.js        Contact form (char counters + Turnstile widget, Send gated)
src/components/layout.js     header: News button, footer Contact link, avatar DROPDOWN
src/main.js                  routes #/news #/contact; Turnstile script load; dropdown toggle
src/styles/components.css     news cards, dropdown, contact, turnstile styles
src/styles/tokens.css         .btn white-space: nowrap (fix squished buttons)
docs/contact-support-setup.md ordered A→B→C runbook (Brevo + Guardian + Turnstile)
```

### Workflow reminders
- File exports use **numbered names** (`file001.js`…) with explicit `mv`-and-rename, to
  dodge macOS case-insensitive collisions (`News.js`/`news.js`, `Contact.js`/`contact.js`).
  Move each file to its destination right after download; don't let collided names sit in
  Downloads together.
- Env var changes require a **redeploy** to take effect (push, or Deployments → Retry).
- `VITE_*` vars are **build-time** (inlined into the bundle) → must be **Plaintext**, not
  Secret, or the build can't read them. Server-only secrets → encrypt.
- check-runs curl is often empty for a minute right after push (lag); not a failure.
