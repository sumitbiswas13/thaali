-- ===========================================================================
-- Thaali — add "Higher or Lower" to game_scores  (2026-07-15)
-- Run in Supabase dashboard → SQL Editor (paste whole file, Run). Safe to re-run.
--
-- The second game reuses the existing game_scores table, RLS, and leaderboard
-- views from game-scores-2026-07-14.sql. The only change needed is widening the
-- `game` CHECK constraint to allow the new slug 'higher-or-lower'.
-- ===========================================================================

-- Drop the old constraint (name is auto-generated as <table>_<col>_check) and
-- re-add it covering both games. Guarded so re-running is safe.
alter table public.game_scores
  drop constraint if exists game_scores_game_check;

alter table public.game_scores
  add constraint game_scores_game_check
  check (game in ('guess-the-recipe', 'higher-or-lower'));

-- ===========================================================================
-- Verify:
--   -- both slugs now accepted (as a signed-in user):
--   insert into public.game_scores (user_id, game, score)
--     values (auth.uid(), 'higher-or-lower', 5);
--   select * from public.leaderboard_weekly
--     where game = 'higher-or-lower' order by best_score desc limit 10;
-- ===========================================================================
