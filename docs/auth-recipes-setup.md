# Thaali — Auth + Recipes + Admin: setup & deploy

This replaces the earlier draft. These files were validated with a full
`vite build` against your actual project (58 modules, no errors).

## What changed and why

Your app calls `isSignedIn()` **synchronously** inside render functions, but
Supabase session reads are async. The fix is a **session cache** in `auth.js`:
`initAuth()` loads the session once at boot, an auth listener keeps it fresh,
and `isSignedIn()` / `currentUser()` / `isAdmin()` read the cache synchronously.
`main.js` awaits `initAuth()` + `loadRecipes()` before `startRouter()`.

Files **changed**: `main.js`, `lib/auth.js`, `lib/mockData.js`,
`views/Auth.js`, `views/Recipe.js`, `views/Submit.js`,
`components/RecipeCard.js`, `supabase/schema.sql`.
Files **added**: `lib/recipes.js` (already present from before — overwrite).
Files **unchanged** (do not touch): `lib/router.js`, `lib/supabase.js`,
`components/layout.js`, `views/Home.js`, `views/Landing.js`,
`styles/*`, `index.html`, `package.json`.

Behavior changes:
- Sign-in is now real (Google OAuth + magic link), not mocked.
- Publishing a recipe writes to Supabase; Home/Landing read live data.
- All recipe **viewing requires sign-in** (the `locked` field is retired).
- Owners and admins get a Delete button on the recipe detail page.

## Storage decision
Ingredients and steps are stored as **JSONB** (not normalized tables). It keeps
your exact `{quantity,unit,item}` / `{instruction,timer_seconds}` shapes, one
table, one insert. Normalize later only if you add ingredient-level search.

## Setup steps

1. **Install deps** (supabase-js is already in package.json):
   ```bash
   cd ~/thaali && npm install
   ```
2. **Create a Supabase project**; copy Project URL + anon key (Settings → API).
3. **Fill `.env`** (template in `.env.example`):
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
   The anon key is safe in the browser; RLS is what protects data.
4. **Create table + policies**: Supabase → SQL Editor → paste all of
   `supabase/schema.sql` → Run.
5. **Configure providers** (Supabase → Authentication):
   - Email: enabled (magic link on by default).
   - Google: paste your Google Cloud OAuth client ID + secret; add Supabase's
     callback URL to Google's authorized redirect URIs.
   - URL Configuration → Site URL `https://thaali.app`; add redirect URLs
     `https://thaali.pages.dev` and `http://localhost:5173`.
   - Production magic-link mail: custom SMTP (Resend → `noreply@thaali.app`).
6. **Create your admin test account**:
   - Run the app, sign in once with `admin@thaali.app` via magic link.
   - In SQL Editor:
     ```sql
     update auth.users
     set raw_app_meta_data =
           coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
     where email = 'admin@thaali.app';
     ```
   - Sign out and back in (new JWT carries the admin role).
   Admins can delete any recipe; regular users only their own. RLS enforces it
   server-side regardless of the UI.
7. **Cloudflare Pages env**: Settings → Variables and secrets → add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Redeploy.

## Local test, then deploy
```bash
npm run dev      # http://localhost:5173
# verify: sign in, publish a recipe, see it on Home, delete it as admin
npm run build    # should succeed (it does here)
git add -A && git commit -m "Real auth + recipes CRUD + admin role" && git push
```
Note: with empty `.env`, sign-in throws "Supabase is not configured" — that's
expected. Fill `.env` to test the real flow locally.
