# Thaali

> A free, ad-free community cookbook. By cooks, for everyone. No ads, no paywall, ever.

A community recipe platform where cook-creators share properly structured
recipes and anyone can browse them after a quick sign-up. Built solo, on the
side, as a labor of love — not a business.

Live at **[thaali.app](https://thaali.app)** · घर है हर रेसिपी का (a home for every recipe)

## Stack

- **Frontend:** vanilla JS SPA (no framework) + Vite
- **Hosting:** Cloudflare Pages
- **Backend (planned):** Supabase — auth (Google OAuth + magic link), Postgres, storage
- **DNS:** Cloudflare

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. The app runs on mock in-memory data
(`src/lib/mockData.js`) until Supabase is wired.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Project structure

```
index.html              entry point
src/
  main.js               app bootstrap — routes, fonts, global handlers
  styles/
    tokens.css           design tokens (color, type, spacing)
    components.css        component styles
  lib/
    router.js            tiny hash router
    auth.js              prototype in-memory auth (→ Supabase later)
    supabase.js          Supabase client (env-var ready, inert until USE_SUPABASE)
    mockData.js          mock recipes/cooks; all UI stats DERIVED, never faked
  components/
    layout.js            header + footer
    RecipeCard.js        platter-motif recipe card
  views/
    Landing.js           signed-out landing + community section
    Auth.js              Google + magic-link flow
    Home.js              signed-in grid + filter chips
    Submit.js            URL import → structured recipe form
    Recipe.js            recipe detail
public/
  favicon.svg
  _redirects             SPA fallback for Cloudflare Pages
```

## Wiring Supabase (next milestone)

1. `cp .env.example .env` and fill `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
2. Set `USE_SUPABASE = true` in `src/lib/supabase.js`
3. Create the tables (recipes / ingredients / steps / profiles — see handoff doc)
4. Replace mock-data calls in views with Supabase queries

> The service-role key must never be `VITE_`-prefixed or shipped to the browser.
> It belongs only in a Cloudflare Pages Function / Supabase Edge Function.

## Deploy (Cloudflare Pages)

Point Cloudflare Pages at this repo with:
- **Build command:** `npm run build`
- **Build output directory:** `dist`

Cloudflare natively supports Vite builds.

