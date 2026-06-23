-- ===========================================================================
-- Thaali — follows migration  (2026-06-23)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- Cooks following cooks. One row per (follower, followee) relationship —
-- structurally a mirror of the likes table. Counts are shown on profiles now;
-- the who-follows-whom lists are a future enhancement (and, like everything on
-- Thaali, will be readable only by signed-in cooks — see the SELECT policy).
-- ===========================================================================

create table if not exists public.follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  followee_id  uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followee_id),
  -- A cook can't follow themselves.
  constraint follows_no_self check (follower_id <> followee_id)
);

-- Fast "who follows X" and "who does X follow" lookups (the second is covered
-- by the PK's leading column; this index serves the reverse direction).
create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- READ: any signed-in cook (so counts — and future lists — are visible).
-- Matches the members-only model: nothing is exposed to anon users.
drop policy if exists "follows_read_authed" on public.follows;
create policy "follows_read_authed"
  on public.follows for select
  to authenticated
  using (true);

-- INSERT: you may only create a follow where YOU are the follower.
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows for insert
  to authenticated
  with check (follower_id = auth.uid());

-- DELETE: you may only remove your own follow (unfollow).
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- No UPDATE policy: a follow is binary (exists or not); changes are insert/delete.
-- ===========================================================================
