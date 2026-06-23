-- ===========================================================================
-- Thaali — account-deletion requests migration  (2026-06-23)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- This adds a REQUEST queue, not immediate deletion. A cook asks to be deleted;
-- the request lands here and the admin actions it by hand (file004.sql) after a
-- grace window. Nothing is destroyed by this table — it's just the paper trail.
--
-- Why a request queue and not instant delete:
--   • Account deletion is irreversible. A 24–48h grace window lets a cook cancel
--     (by emailing contact.thaaliapp@gmail.com) if they change their mind or the
--     request wasn't them.
--   • The actual destructive step (file004.sql) is run deliberately by the admin,
--     so there's a human in the loop on the most dangerous operation on the site.
-- ===========================================================================

create table if not exists public.deletion_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  email          text,
  display_name   text,
  delete_recipes boolean not null default false,
  status         text    not null default 'pending'
                 check (status in ('pending', 'cancelled', 'completed')),
  requested_at   timestamptz not null default now()
);

-- At most ONE pending request per user. (A user may have older cancelled/
-- completed rows, but never two live ones.) Partial unique index enforces it.
create unique index if not exists deletion_requests_one_pending
  on public.deletion_requests (user_id)
  where status = 'pending';

create index if not exists deletion_requests_status_idx
  on public.deletion_requests (status, requested_at);

alter table public.deletion_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- A cook may create and read ONLY their own request. They may also cancel it
-- (update status pending → cancelled) on their own row. They may NOT delete the
-- row, set someone else's, or mark it completed — completion is the admin's job
-- via the run-script (which uses elevated rights outside RLS).
-- Admin can read everything (to review the queue).
-- ---------------------------------------------------------------------------

-- READ: own rows, or admin sees all.
drop policy if exists "deletion_read_own_or_admin" on public.deletion_requests;
create policy "deletion_read_own_or_admin"
  on public.deletion_requests for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- INSERT: a cook may create only their own request, and only as 'pending'.
drop policy if exists "deletion_insert_self" on public.deletion_requests;
create policy "deletion_insert_self"
  on public.deletion_requests for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- UPDATE: a cook may modify only their own row, and only to cancel it.
-- (using = the row is theirs; with check = the result must stay theirs and the
-- status may only become 'cancelled'. They cannot self-'complete'.)
drop policy if exists "deletion_cancel_self" on public.deletion_requests;
create policy "deletion_cancel_self"
  on public.deletion_requests for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'cancelled');

-- Admin may update any row (e.g. mark completed/cancelled from the queue later).
drop policy if exists "deletion_update_admin" on public.deletion_requests;
create policy "deletion_update_admin"
  on public.deletion_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No DELETE policy on purpose: rows are an audit trail. They vanish only if the
-- user row itself is deleted (the on-delete-cascade above), which is exactly
-- what happens when a request is actioned.
-- ===========================================================================
