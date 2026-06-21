-- ===========================================================================
-- Thaali — multi-image migration  (2026-06-21 c)
-- Run in Supabase dashboard → SQL Editor. Safe to re-run.
--
-- Adds:
--   • recipes.images   JSONB array of image URLs (up to 4). image_url stays the
--     designated TITLE/cover image (what cards display); images[] is the full
--     gallery shown on the detail page. Backfills images from any existing
--     image_url so old recipes show their single photo in the gallery too.
-- ===========================================================================

alter table public.recipes
  add column if not exists images jsonb not null default '[]'::jsonb;

-- Backfill: if a recipe has a title image but an empty gallery, seed the
-- gallery with that one image so the detail page is consistent.
update public.recipes
set images = jsonb_build_array(image_url)
where image_url is not null
  and image_url <> ''
  and (images is null or images = '[]'::jsonb);
