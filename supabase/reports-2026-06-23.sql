-- ===========================================================================
-- Thaali — recipe reports migration  (2026-06-23)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- Phase 1 of moderation: a cook can flag a recipe; the report lands here and is
-- emailed to the admin to review by hand. No auto-action — the admin already
-- has edit/delete powers. An in-app review queue is a future phase.
-- ===========================================================================

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  reporter_id uuid not null references auth.users (id)     on delete cascade,
  reason      text not null
              check (reason in ('spam', 'inappropriate', 'copyright', 'other')),
  note        text default '',
  status      text not null default 'open'
              check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now(),
  -- One report per cook per recipe (dedupe; a cook can't spam-report).
  unique (recipe_id, reporter_id)
);

create index if not exists reports_status_idx on public.reports (status, created_at);

alter table public.reports enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- A cook may file a report (as themselves) and read their OWN reports. The
-- admin can read everything to review the queue. Cooks can't see others'
-- reports, can't edit/delete them, and can't report their own recipe (enforced
-- in the Function + below).
-- ---------------------------------------------------------------------------

-- READ: own reports, or admin sees all.
drop policy if exists "reports_read_own_or_admin" on public.reports;
create policy "reports_read_own_or_admin"
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

-- INSERT: a cook may file a report only as themselves, only 'open', and NOT on
-- their own recipe (the subquery blocks self-reporting at the DB level).
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    and not exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.author_id = auth.uid()
    )
  );

-- UPDATE: admin only (mark reviewed/dismissed from a future queue).
drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No cook DELETE policy: reports are an audit trail. They cascade away only if
-- the recipe or the reporter's account is deleted.
-- ===========================================================================
