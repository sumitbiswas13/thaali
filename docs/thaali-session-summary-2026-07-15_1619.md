# Thaali — Session Summary (2026-07-15)

Two major workstreams shipped this session: **making the site rank on Google (SEO)** and **adding a Games section**. Everything below is live in production (`main` → Cloudflare) unless noted. SQL migrations were run in Supabase before each corresponding frontend deploy, per the standing rule.

---

## 1. SEO — making Thaali discoverable and rankable

### The problem
The site couldn't rank on Google because of three compounding issues:

- **Hash routing** (`#/recipe?id=`) — Google ignores the URL fragment, so it saw every recipe as the same single page.
- **Login wall + RLS** — recipes required sign-in *and* the database only returned data to authenticated users, so Googlebot got nothing.
- **No Recipe structured data** — no eligibility for Google's rich recipe cards.

(The slug-collision worry — two cooks posting "Palak Paneer" — turned out to already be solved: slugs are `title-xxxx` with a global unique index.)

### What we built

**Path routing (History API).** Rewrote `src/lib/router.js` from hash routing to real paths with params (`/recipe/:slug`), plus a global click-interceptor so `<a href="/…">` links route client-side. Migrated every `#/` link and query-param navigation across ~18 files.

**Public recipe reads (SQL).** `supabase/public-read-2026-07-14.sql` adds anon-safe views `recipes_public` and `profiles_public` that expose only safe columns — `author_email` is never included. The base tables' RLS is unchanged, so the authenticated app path is untouched. The data layer (`recipes.js`, `profiles.js`) reads the public views when logged out, base tables when signed in.

**Public preview / gated full recipe page.** `Recipe.js` no longer bounces logged-out visitors to `/auth`. They now see the full recipe (great for SEO and readers) with a warm signup gate replacing the like/comment/report controls — stating the "free, no ads, no paywall, ever" promise and why an email is needed.

**Server-rendered recipe pages (Cloudflare Function).** `functions/recipe/[slug].js` fetches the built SPA shell and injects, per recipe, into the `<head>`: a clean single `<title>`, meta description, canonical URL, Open Graph + Twitter tags, and **JSON-LD `schema.org/Recipe`** (name, image, ingredients, steps, times, author, dates). Crawlers get real HTML with structured data; humans still boot the full SPA.

**Dynamic sitemap + robots.** `functions/sitemap.xml.js` queries Supabase live and lists every recipe (new ones appear automatically, no rebuild). `public/robots.txt` points to it. Note: Cloudflare injects its own "Managed robots.txt" that blocks AI-training crawlers (GPTBot, ClaudeBot, etc.) while keeping Googlebot/search allowed — **left enabled by choice** so cooks' recipes aren't scraped for AI training.

### Messaging — "free forever, why email"
Made the promise consistent everywhere: the recipe signup gate, the Auth page (heading + reassurance line), the Privacy page (new "Why we ask for an email" section + corrected sharing language now that recipes are public), and the Terms page (new "Cost and signing up" section). The framing that resolves the free-but-email tension: **"an account, not a price."**

### Search Console (done live)
- Domain property `thaali.app` was already verified; homepage already indexed.
- **Submitted** `https://thaali.app/sitemap.xml` (Domain properties need the full URL, not just the path).
- **Requested indexing** for the homepage and two top recipes (Aloo Masala, Chana Masala).
- **Rich Results Test: PASS** — "1 valid item detected," valid Recipe, eligible for rich results. The flagged items were all *optional* fields (nutrition, video, ratings, or empty prep/cook time on that recipe) — not code issues.

### Verified live
`sitemap.xml` serves valid XML (200); `robots.txt` live with the `Sitemap:` line; recipe pages return real `<title>` + JSON-LD + OG tags in raw HTML before JS; logged-out recipe pages render fully with the gate.

### What drives ranking from here (ongoing, not code)
Encourage cooks to add **real photos, a headnote, and complete prep/cook time + dietary tags** — the JSON-LD already uses all of these, so a fully-filled recipe automatically gets a richer Google card. Category/cuisine landing pages would be a strong future SEO asset. Realistic timeline: homepage indexed in days, most recipes over 2–6 weeks, meaningful traffic over 3–6 months as the catalog grows.

---

## 2. Games section

A new members-only `/games` hub with a leaderboard, built entirely on existing patterns and honoring "free forever, no added cost" (no paid APIs — reuses the recipe catalog and like data).

### Shared infrastructure
- **`game_scores` table** (`supabase/game-scores-2026-07-14.sql`) — `id, user_id, game, score, played_at`. RLS mirrors likes/reports: insert own only, read for any signed-in user, admin-only delete.
- **Leaderboard views** — `leaderboard_weekly` and `leaderboard_alltime`, one row per cook (their best score), joined to the public profile for name + avatar. Only safe columns exposed.
- **Data layer** (`src/lib/games.js`) — `submitScore`, `fetchLeaderboard` (weekly top with all-time fallback, like the Trending strip), `fetchMyBest`.
- **Shared leaderboard renderer** in `Games.js` so both games stay in sync.

### Game 1 — Guess the Recipe
Photo + a few ingredient clues + 4 title choices (1 real, 3 random decoys). 10 rounds, points with a streak bonus (max 200). Reuses recipe photos and ingredients, so content grows as cooks post. **Polish fix:** clue chips strip leading quantity/unit words (e.g. "to taste Water" → "Water") while leaving real names intact.

### Game 2 — Higher or Lower
Endless streak: two dishes, guess which has **more likes** or a **longer cook time** (metrics mixed per round). Wrong answer ends the run; streak length is the score. No-tie guard keeps every round unambiguous; falls back gracefully when data is thin. Slug added via `supabase/game-higher-lower-2026-07-15.sql` (reuses the same table/leaderboard). **Polish fix:** streak counter updates instantly on a correct answer.

### Visual design
The hub cards use **Direction A** — a warm cream-to-amber gradient body with a saffron header band holding the game emoji, and a lift-with-glow hover. Replaced the original flat-white card.

### Verified live
Both games playtested end-to-end in the browser: rounds render, scoring works, scores save to Supabase, and the leaderboard shows the cook's name + avatar + best score. (One catch surfaced and was resolved: the Higher or Lower deploy initially preceded its SQL migration, so scores were rejected by the old CHECK constraint until the migration was run — a reminder that SQL must precede the frontend deploy.)

---

## Key learnings this session

- **A sitemap alone doesn't rank a JS SPA** — routing, public crawlable content, and structured data all have to be in place first. The sitemap only helps once pages are reachable and readable.
- **SQL migrations must run before the dependent frontend deploy** — proven twice (public-read for SEO, and the game-slug constraint for Higher or Lower, which failed loudly when deployed first).
- **Recipe content wants to be public** — gating it from crawlers both kills rich results and risks a cloaking penalty; the signup gate's real job is community conversion, not hiding the recipe.
- **Reuse existing data for game content** — games built on the recipe catalog + likes grow automatically and cost nothing, staying true to "free forever."

---

## Files touched (high level)

**New:** `functions/recipe/[slug].js`, `functions/sitemap.xml.js`, `public/robots.txt`, `src/views/Games.js`, `src/lib/games.js`, and SQL migrations `public-read-2026-07-14.sql`, `game-scores-2026-07-14.sql`, `game-higher-lower-2026-07-15.sql`.

**Modified:** `src/lib/router.js` (+ all `#/` link sites across views/components), `src/lib/recipes.js`, `src/lib/profiles.js`, `src/views/Recipe.js`, `src/views/Auth.js`, `src/views/Privacy.js`, `src/views/Terms.js`, `src/main.js`, `src/components/layout.js`, `src/styles/components.css`.

**Companion docs (in the outputs folder, not the repo):** the SEO & Search Console guide, the deploy runbook, and the free/email copy variants.
