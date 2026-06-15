-- ===========================================================================
-- Thaali — Supabase schema & policies
-- Run this in the Supabase dashboard → SQL Editor (paste the whole file, Run).
-- Safe to re-run: drops/recreates policies, uses if-not-exists for the table.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- recipes table
-- ingredients / steps are JSONB to preserve the structured shapes the app uses:
--   ingredients: [{ "quantity": "1", "unit": "cup", "item": "toor dal" }, ...]
--   steps:       [{ "instruction": "Rinse dal...", "timer_seconds": 1500 }, ...]
-- ---------------------------------------------------------------------------
create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text default '',
  cuisine       text,
  course        text,
  prep_time     integer,
  cook_time     integer,
  servings      integer,
  difficulty    text,
  ingredients   jsonb not null default '[]'::jsonb,
  steps         jsonb not null default '[]'::jsonb,
  author        text,
  author_id     uuid references auth.users (id) on delete set null,
  author_email  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.recipes enable row level security;

-- Helper: is the current request from an admin? (role lives in the JWT)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- Building a userbase, not charging: viewing requires sign-in, so READ is
-- restricted to authenticated users (not anon). Writes: own or admin.
-- ---------------------------------------------------------------------------

-- READ: any signed-in user
drop policy if exists "recipes_read_authed" on public.recipes;
create policy "recipes_read_authed"
  on public.recipes for select
  to authenticated
  using (true);

-- INSERT: signed-in users, stamping themselves as author
drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own"
  on public.recipes for insert
  to authenticated
  with check (author_id = auth.uid());

-- UPDATE: owner or admin
drop policy if exists "recipes_update_own_or_admin" on public.recipes;
create policy "recipes_update_own_or_admin"
  on public.recipes for update
  to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

-- DELETE: owner or admin
drop policy if exists "recipes_delete_own_or_admin" on public.recipes;
create policy "recipes_delete_own_or_admin"
  on public.recipes for delete
  to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin test account (the "real admin flag" login)
-- ---------------------------------------------------------------------------
-- 1. Sign in once via magic link with admin@thaali.app so the auth.users row exists.
-- 2. Run this to promote it (idempotent):
--
-- update auth.users
-- set raw_app_meta_data =
--       coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'admin@thaali.app';
--
-- 3. Sign out and back in so the new JWT carries the admin role.
-- ===========================================================================
