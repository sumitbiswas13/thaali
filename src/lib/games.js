import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Games data layer — score submission + leaderboard reads.
// Writes are self-only (RLS enforces user_id = auth.uid()); reads use the
// leaderboard views, which return one row per cook (their best score) joined
// to their public profile. Mirrors social.js patterns.
// ---------------------------------------------------------------------------

export const GAMES = {
  GUESS: 'guess-the-recipe',
  HIGHER_LOWER: 'higher-or-lower',
};

// Record a completed game. Inserts AS the current user (RLS is the real gate).
export async function submitScore(game, score) {
  const user = currentUser();
  if (!user) throw new Error('You must be signed in to save a score.');
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');

  const s = Math.max(0, Math.round(Number(score) || 0));
  const { data, error } = await supabase
    .from('game_scores')
    .insert({ user_id: user.id, game, score: s })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Fetch the leaderboard for a game: weekly top, falling back to all-time if the
// week is too quiet (mirrors the Trending strip's window+fallback logic).
// Returns { window: 'weekly'|'alltime', rows: [{ user_id, display_name,
// avatar_url, best_score, last_played }] } already sorted high→low.
const MIN_WEEKLY = 3; // need at least this many weekly players before we prefer weekly
const TOP_N = 20;

export async function fetchLeaderboard(game) {
  if (!isSupabaseReady()) return { window: 'weekly', rows: [] };

  const weekly = await queryBoard('leaderboard_weekly', game);
  if (weekly.length >= MIN_WEEKLY) {
    return { window: 'weekly', rows: weekly.slice(0, TOP_N) };
  }
  // Too few this week — show the all-time board instead so it isn't sparse.
  const allTime = await queryBoard('leaderboard_alltime', game);
  return { window: 'alltime', rows: allTime.slice(0, TOP_N) };
}

async function queryBoard(view, game) {
  const { data, error } = await supabase
    .from(view)
    .select('user_id, display_name, avatar_url, best_score, last_played')
    .eq('game', game)
    .order('best_score', { ascending: false })
    .order('last_played', { ascending: true }) // earlier achiever wins ties
    .limit(TOP_N);
  if (error) throw error;
  return data || [];
}

// The signed-in cook's own best score for a game (weekly + all-time), so the
// end screen can show "your best". Cheap: reads their own rows only.
export async function fetchMyBest(game) {
  const user = currentUser();
  if (!user || !isSupabaseReady()) return { weekly: 0, allTime: 0 };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: allRows }, { data: weekRows }] = await Promise.all([
    supabase.from('game_scores').select('score').eq('user_id', user.id).eq('game', game),
    supabase
      .from('game_scores')
      .select('score')
      .eq('user_id', user.id)
      .eq('game', game)
      .gte('played_at', sevenDaysAgo),
  ]);
  const best = (rows) => (rows && rows.length ? Math.max(...rows.map((r) => r.score)) : 0);
  return { weekly: best(weekRows), allTime: best(allRows) };
}
