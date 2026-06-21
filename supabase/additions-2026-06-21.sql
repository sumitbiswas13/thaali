-- ===========================================================================
-- Thaali — additions migration  (2026-06-21)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- Adds:
--   • profiles.country     ISO 3166-1 alpha-2 code (e.g. 'US', 'IN')
--   • recipes.source_url   original link when a recipe was imported
--   • recipes.image_url    hero photo (public URL in the recipe-images bucket)
--   • storage bucket "recipe-images" + per-user RLS (mirrors the avatars bucket)
-- ===========================================================================

-- --- profiles.country -------------------------------------------------------
alter table public.profiles
  add column if not exists country text;

-- --- recipes.source_url + image_url -----------------------------------------
alter table public.recipes
  add column if not exists source_url text;

alter table public.recipes
  add column if not exists image_url text;

-- ===========================================================================
-- recipe-images storage bucket  (public read; files under "<uid>/<file>")
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', true)
on conflict (id) do nothing;

drop policy if exists "recipe_images_read" on storage.objects;
create policy "recipe_images_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recipe-images');

drop policy if exists "recipe_images_insert_own" on storage.objects;
create policy "recipe_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recipe_images_update_own" on storage.objects;
create policy "recipe_images_update_own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "recipe_images_delete_own" on storage.objects;
create policy "recipe_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
