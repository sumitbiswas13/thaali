-- ===========================================================================
-- Thaali — reports go polymorphic (recipes + comments)  (2026-06-23 c)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- Moderation phase 2 groundwork: a cook can now report a COMMENT as well as a
-- recipe. The reports table becomes polymorphic — exactly one of recipe_id or
-- comment_id is set per row. Existing recipe reports are untouched (recipe_id
-- stays populated, comment_id null).
--
-- This migration:
--   • adds reports.comment_id  (nullable, FK → comments, cascade)
--   • makes reports.recipe_id  nullable (it was NOT NULL)
--   • adds a CHECK so exactly one target is set
--   • replaces the unique dedupe + insert RLS to cover both target types
-- ===========================================================================

-- --- new nullable target column --------------------------------------------
alter table public.reports
  add column if not exists comment_id uuid references public.comments (id) on delete cascade;

-- --- recipe_id was NOT NULL; relax it so comment-only reports are valid -----
alter table public.reports
  alter column recipe_id drop not null;

-- --- exactly one of (recipe_id, comment_id) must be set --------------------
alter table public.reports
  drop constraint if exists reports_one_target;
alter table public.reports
  add constraint reports_one_target
  check (
    (recipe_id is not null and comment_id is null)
    or
    (recipe_id is null and comment_id is not null)
  );

-- --- dedupe: one report per cook per target --------------------------------
-- The old table-level unique (recipe_id, reporter_id) only covered recipes and
-- (with a now-nullable recipe_id) would let a cook file many comment reports
-- with recipe_id null. Replace with two partial unique indexes.
alter table public.reports
  drop constraint if exists reports_recipe_id_reporter_id_key;

create unique index if not exists reports_recipe_reporter_uidx
  on public.reports (recipe_id, reporter_id)
  where recipe_id is not null;

create unique index if not exists reports_comment_reporter_uidx
  on public.reports (comment_id, reporter_id)
  where comment_id is not null;

-- --- insert RLS: self only; can't report your OWN recipe or comment --------
-- Mirrors the recipe rule and adds the comment-ownership block. A cook may file
-- a report only as themselves, only 'open', and not on content they authored.
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    and (
      -- exactly one target (the CHECK enforces it too; restated for clarity)
      (recipe_id is not null and comment_id is null
        and not exists (
          select 1 from public.recipes r
          where r.id = recipe_id and r.author_id = auth.uid()
        ))
      or
      (comment_id is not null and recipe_id is null
        and not exists (
          select 1 from public.comments c
          where c.id = comment_id and c.user_id = auth.uid()
        ))
    )
  );

-- READ + UPDATE policies are unchanged from reports-2026-06-23.sql:
--   reports_read_own_or_admin  (own rows, or admin sees all)
--   reports_update_admin       (admin marks reviewed/dismissed)
-- They already reference reporter_id / is_admin() and need no change.
-- ===========================================================================
