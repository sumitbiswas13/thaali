-- ===========================================================================
-- Thaali — game scores + leaderboard migration  (2026-07-14)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- Adds the "Games" feature's storage:
--   • game_scores      one row per completed game (a play), scored 0..N
--   • RLS              a cook inserts only their OWN scores; any signed-in user
--                      can READ scores (needed to render the leaderboard)
--   • leaderboards     views that rank each cook's BEST score, joined to the
--                      public profile (display name + avatar), for:
--                        - the last 7 days (weekly board)
--                        - all time (fallback / secondary board)
--
-- Mirrors the likes/reports patterns: writes are self-only via RLS, the app
-- never trusts a user_id from the client. No service-role key needed.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- game_scores table
--   game   = short slug identifying which game ('guess-the-recipe', ...), so
--            one table serves all future games. CHECK keeps it to known values.
--   score  = points earned this play (>= 0).
-- ---------------------------------------------------------------------------
create table if not exists public.game_scores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  game       text not null
             check (game in ('guess-the-recipe')),
  score      integer not null check (score >= 0 and score <= 100000),
  played_at  timestamptz not null default now()
);

-- Leaderboard queries filter by game + time window and rank by score, so index
-- for that access path.
create index if not exists game_scores_game_played_idx
  on public.game_scores (game, played_at desc);
create index if not exists game_scores_game_score_idx
  on public.game_scores (game, score desc);

alter table public.game_scores enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
--   READ:   any signed-in user (the leaderboard shows everyone's scores).
--   INSERT: a cook may record a score only AS THEMSELVES. No update/delete for
--           cooks — a score, once played, is immutable (admin can clean up).
-- ---------------------------------------------------------------------------
drop policy if exists "game_scores_read_authed" on public.game_scores;
create policy "game_scores_read_authed"
  on public.game_scores for select
  to authenticated
  using (true);

drop policy if exists "game_scores_insert_own" on public.game_scores;
create policy "game_scores_insert_own"
  on public.game_scores for insert
  to authenticated
  with check (user_id = auth.uid());

-- Admin may delete (moderation / cleanup of a bogus score). No cook deletes.
drop policy if exists "game_scores_delete_admin" on public.game_scores;
create policy "game_scores_delete_admin"
  on public.game_scores for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Leaderboard views — ONE ROW PER COOK, showing their BEST score in the window,
-- joined to their public profile for name + avatar. security_invoker so each
-- caller reads through their own RLS on game_scores (which allows read to all
-- signed-in users). Profiles are joined from the base table; only safe columns
-- (display_name, avatar_url) are selected.
-- ---------------------------------------------------------------------------

-- Weekly: best score per cook in the last 7 days.
create or replace view public.leaderboard_weekly
with (security_invoker = true) as
  select
    s.game,
    s.user_id,
    p.display_name,
    p.avatar_url,
    max(s.score)          as best_score,
    max(s.played_at)      as last_played
  from public.game_scores s
  left join public.profiles p on p.id = s.user_id
  where s.played_at >= (now() - interval '7 days')
  group by s.game, s.user_id, p.display_name, p.avatar_url;

-- All-time: best score per cook, ever.
create or replace view public.leaderboard_alltime
with (security_invoker = true) as
  select
    s.game,
    s.user_id,
    p.display_name,
    p.avatar_url,
    max(s.score)          as best_score,
    max(s.played_at)      as last_played
  from public.game_scores s
  left join public.profiles p on p.id = s.user_id
  group by s.game, s.user_id, p.display_name, p.avatar_url;

grant select on public.leaderboard_weekly  to authenticated;
grant select on public.leaderboard_alltime to authenticated;

-- ===========================================================================
-- Verify after running:
--   -- as a signed-in user, inserting your own score works; someone else's fails:
--   insert into public.game_scores (user_id, game, score)
--     values (auth.uid(), 'guess-the-recipe', 80);        -- OK
--   select * from public.leaderboard_weekly
--     where game = 'guess-the-recipe' order by best_score desc limit 10;
-- ===========================================================================
