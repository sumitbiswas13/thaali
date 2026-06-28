-- ===========================================================================
-- Thaali — Batch B: dietary tags
-- Run in Supabase dashboard → SQL Editor (paste all, Run) BEFORE the frontend
-- deploy. Safe to re-run (idempotent: if-not-exists on both column and index).
-- "Success. No rows returned" is the expected result for DDL.
-- ===========================================================================

-- Multi-value dietary tags, stored as a text array.
-- Values come from DIET_TAGS in src/lib/categories.js:
--   Non-Vegetarian, Vegetarian, Eggless, Vegan, Jain,
--   Gluten-Free, Nut-Free, Dairy-Free, Soy-Free
-- Existing rows default to an empty array (no tags = matches every filter).
alter table public.recipes
  add column if not exists diet_tags text[] not null default '{}';

-- GIN index for array-containment queries (@>). Not needed by the current
-- client-side filter, but cheap insurance for a future server-side
-- `.contains('diet_tags', [...])` query as the catalog grows.
create index if not exists recipes_diet_tags_gin
  on public.recipes using gin (diet_tags);
