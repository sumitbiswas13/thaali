-- ===========================================================================
-- Thaali — social layer + slugs migration  (2026-06-21 b)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- Adds:
--   • recipes.slug         readable URL key (e.g. "chicken-biryani")
--   • recipes.short_code   6-char base62 fallback key (e.g. "k3n9Qx")
--   • likes                one row per (recipe, user); a like toggle
--   • comments             threaded-flat comments on a recipe
--   • backfill: slugs + short codes for existing recipes, and a fix so the
--     stored author name is pulled from profiles (kills the stale-name issue
--     for old rows; new reads use a live join in the app)
-- ===========================================================================

-- --- recipes: slug + short_code --------------------------------------------
alter table public.recipes add column if not exists slug text;
alter table public.recipes add column if not exists short_code text;

-- Unique where present (nulls allowed during backfill).
create unique index if not exists recipes_slug_key       on public.recipes (slug)       where slug is not null;
create unique index if not exists recipes_short_code_key on public.recipes (short_code) where short_code is not null;

-- unaccent lives in an extension; enable it first (no-op if already there).
create extension if not exists unaccent;

-- Slugify helper: lower, strip accents, non-alnum → hyphen, trim hyphens.
create or replace function public.slugify(txt text)
returns text language sql stable as $$
  select trim(both '-' from
           regexp_replace(
             lower(unaccent(coalesce(txt, ''))),
             '[^a-z0-9]+', '-', 'g'
           )
         );
$$;

-- 6-char base62 short code.
create or replace function public.gen_short_code()
returns text language sql volatile as $$
  select string_agg(
    substr('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
           (floor(random()*62)::int + 1), 1), '')
  from generate_series(1, 6);
$$;

-- --- backfill slugs + short codes for existing rows ------------------------
-- Slug = slugify(title) + short disambiguator from the uuid tail, so two
-- "Dal Tadka" recipes never collide.
update public.recipes r
set slug = public.slugify(r.title) || '-' || substr(r.id::text, 1, 4)
where r.slug is null;

update public.recipes r
set short_code = public.gen_short_code()
where r.short_code is null;

-- --- backfill author name from profiles (fix stale Google names) -----------
-- For any recipe whose author string no longer matches the cook's current
-- display_name, refresh it. (App also live-looks-up on read, but this tidies
-- the stored value and helps any non-app consumer.)
update public.recipes r
set author = p.display_name
from public.profiles p
where r.author_id = p.id
  and p.display_name is not null
  and p.display_name <> ''
  and (r.author is distinct from p.display_name);

-- ===========================================================================
-- likes  (one row per recipe per user; presence = liked)
-- ===========================================================================
create table if not exists public.likes (
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  user_id    uuid not null references auth.users (id)     on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

alter table public.likes enable row level security;

-- READ: any signed-in user (so counts are visible).
drop policy if exists "likes_read_authed" on public.likes;
create policy "likes_read_authed"
  on public.likes for select to authenticated using (true);

-- INSERT/DELETE: only your own like.
drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own"
  on public.likes for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own"
  on public.likes for delete to authenticated using (user_id = auth.uid());

-- ===========================================================================
-- comments  (flat list per recipe, newest or oldest ordered in app)
-- ===========================================================================
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  user_id    uuid not null references auth.users (id)     on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_recipe_idx on public.comments (recipe_id, created_at);

alter table public.comments enable row level security;

-- READ: any signed-in user.
drop policy if exists "comments_read_authed" on public.comments;
create policy "comments_read_authed"
  on public.comments for select to authenticated using (true);

-- INSERT: signed-in, stamping self.
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own"
  on public.comments for insert to authenticated with check (user_id = auth.uid());

-- DELETE: comment author, the recipe owner (moderate own recipe), or admin.
drop policy if exists "comments_delete_own_or_owner_or_admin" on public.comments;
create policy "comments_delete_own_or_owner_or_admin"
  on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.recipes r where r.id = recipe_id and r.author_id = auth.uid())
  );

-- ===========================================================================
-- Auto-slug for NEW recipes (so the app doesn't have to compute it).
-- Trigger fills slug + short_code on insert when missing.
-- ===========================================================================
create or replace function public.recipes_fill_keys()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.slugify(new.title) || '-' || substr(gen_random_uuid()::text, 1, 4);
  end if;
  if new.short_code is null or new.short_code = '' then
    new.short_code := public.gen_short_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recipes_fill_keys on public.recipes;
create trigger trg_recipes_fill_keys
  before insert on public.recipes
  for each row execute function public.recipes_fill_keys();
