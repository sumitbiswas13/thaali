-- Thaali — banners (occasion hero images) — 2026-06-28
-- Idempotent. Run in Supabase SQL Editor BEFORE deploying the frontend batches.
--
-- A `banners` row points the home-page hero at an image in the public `banners`
-- storage bucket, optionally constrained to a date window. The site shows the
-- highest-priority active banner whose window contains now(); if none match it
-- falls back to an auto-computed "top dish of the week" (no row needed).
--
-- Security split (DIFFERENT from recipe tables): banners are world-READABLE
-- (anyone sees the active banner) but WRITE-LOCKED to admins (app_metadata.role
-- = 'admin'). Same admin signal the admin-delete Function trusts.

create extension if not exists "pgcrypto";

create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  image_url   text        not null,
  alt         text        not null default '',
  link_url    text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  priority    int         not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Fast lookup of "currently eligible" banners (active first, then priority).
create index if not exists banners_active_priority_idx
  on public.banners (active, priority desc, starts_at, ends_at);

alter table public.banners enable row level security;

-- READ: anyone (signed-in or not) may read banners. The view layer applies the
-- date-window + active filter; reading a future/expired row is harmless.
drop policy if exists "banners readable by all" on public.banners;
create policy "banners readable by all"
  on public.banners for select
  using (true);

-- WRITE: admin only. Mirrors the role check used elsewhere.
drop policy if exists "banners admin insert" on public.banners;
create policy "banners admin insert"
  on public.banners for insert
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "banners admin update" on public.banners;
create policy "banners admin update"
  on public.banners for update
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "banners admin delete" on public.banners;
create policy "banners admin delete"
  on public.banners for delete
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------------------------------------------------------------------------
-- Storage bucket: public read, admin-only write. Mirrors the avatars/recipe
-- images buckets but locks writes to admins (banners aren't user-generated).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do update set public = true;

drop policy if exists "banners bucket public read" on storage.objects;
create policy "banners bucket public read"
  on storage.objects for select
  using (bucket_id = 'banners');

drop policy if exists "banners bucket admin write" on storage.objects;
create policy "banners bucket admin write"
  on storage.objects for insert
  with check (
    bucket_id = 'banners'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "banners bucket admin update" on storage.objects;
create policy "banners bucket admin update"
  on storage.objects for update
  using (
    bucket_id = 'banners'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "banners bucket admin delete" on storage.objects;
create policy "banners bucket admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'banners'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
