-- ===========================================================================
-- Thaali — public (anonymous) read access for SEO  (2026-07-14)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- WHY: Recipe pages must be readable by logged-out visitors and search-engine
-- crawlers (Google, Bing) for the site to be indexed and rank. Until now READ
-- was restricted to `authenticated`, so crawlers saw nothing.
--
-- WHAT THIS DOES (and does NOT do):
--   • Exposes ONLY safe, public recipe columns via a dedicated view
--     `public.recipes_public` — the private column `author_email` is NEVER
--     included, so anon can never read it.
--   • Grants anon + authenticated SELECT on that view.
--   • Exposes a minimal public profile view `public.profiles_public`
--     (display_name, avatar, bio, country, id) so recipe pages can show the
--     cook's name to logged-out visitors. Email / auth data stay private.
--   • Leaves the base `recipes` and `profiles` RLS UNCHANGED: the app's
--     authenticated `select('*')` path keeps working exactly as before, and
--     no private column is ever exposed to anon.
--
-- The signup "gate" for likes/comments/follow/submit is enforced by the
-- existing INSERT/UPDATE policies + the UI — this migration only widens READ
-- of public recipe content, which is what search engines need.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Public recipe view — safe columns only (NO author_email).
-- security_invoker = off (default) so the view's own grants govern access,
-- letting anon read through it without a base-table anon policy.
-- ---------------------------------------------------------------------------
create or replace view public.recipes_public as
  select
    id,
    title,
    description,
    cuisine,
    course,
    prep_time,
    cook_time,
    servings,
    difficulty,
    diet_tags,
    ingredients,
    steps,
    image_url,
    images,
    source_url,
    author,          -- cook's public display name (already denormalized)
    author_id,       -- FK only; safe, used to link to the public profile
    slug,
    short_code,
    created_at,
    updated_at
  from public.recipes;

-- Lock down, then grant read explicitly to the two client roles.
revoke all on public.recipes_public from anon, authenticated;
grant select on public.recipes_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public profile view — safe columns only (no email/auth linkage beyond id).
-- ---------------------------------------------------------------------------
create or replace view public.profiles_public as
  select
    id,
    display_name,
    bio,
    avatar_url,
    country,
    created_at
  from public.profiles;

revoke all on public.profiles_public from anon, authenticated;
grant select on public.profiles_public to anon, authenticated;

-- ===========================================================================
-- Notes
--   • Views owned by the migration runner (postgres) run with that owner's
--     rights by default, so anon reading `recipes_public` does not need an
--     anon policy on the base `recipes` table. Private columns simply aren't
--     in the view, so they're unreachable.
--   • If you later add columns to `recipes` that should stay private, they are
--     private by default — you must add them to this view explicitly to expose
--     them. That "private-by-default" posture is intentional.
--   • Verify after running:
--       set role anon;
--       select author_email from public.recipes_public limit 1;   -- must ERROR (no such column)
--       select count(*)     from public.recipes_public;           -- must return a number
--       reset role;
-- ===========================================================================
