import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Social layer: likes + comments. RLS enforces who can write/delete; these
// helpers are thin wrappers used by the recipe detail view.
// ---------------------------------------------------------------------------

// ---- Batched counts (for Browse cards — avoids a per-card query storm) ----

// Returns Map<recipe_id, count> of likes across the given recipe ids.
export async function fetchLikeCounts(recipeIds) {
  const map = new Map();
  const ids = [...new Set((recipeIds || []).filter(Boolean))];
  if (!isSupabaseReady() || ids.length === 0) return map;
  // One query, all rows; tally client-side. Fine at seed/early scale.
  const { data, error } = await supabase.from('likes').select('recipe_id').in('recipe_id', ids);
  if (error) throw error;
  for (const row of data || []) map.set(row.recipe_id, (map.get(row.recipe_id) || 0) + 1);
  return map;
}

// Returns Map<recipe_id, count> of comments across the given recipe ids.
export async function fetchCommentCounts(recipeIds) {
  const map = new Map();
  const ids = [...new Set((recipeIds || []).filter(Boolean))];
  if (!isSupabaseReady() || ids.length === 0) return map;
  const { data, error } = await supabase.from('comments').select('recipe_id').in('recipe_id', ids);
  if (error) throw error;
  for (const row of data || []) map.set(row.recipe_id, (map.get(row.recipe_id) || 0) + 1);
  return map;
}

// ---- Likes ----------------------------------------------------------------

// Returns { count, liked } for a recipe (liked = does the current user like it).
export async function fetchLikeState(recipeId) {
  if (!isSupabaseReady() || !recipeId) return { count: 0, liked: false };

  const { count } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('recipe_id', recipeId);

  let liked = false;
  const user = currentUser();
  if (user) {
    const { data } = await supabase
      .from('likes')
      .select('recipe_id')
      .eq('recipe_id', recipeId)
      .eq('user_id', user.id)
      .maybeSingle();
    liked = Boolean(data);
  }
  return { count: count || 0, liked };
}

// Toggle the current user's like. Returns the new { count, liked }.
export async function toggleLike(recipeId, currentlyLiked) {
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');

  if (currentlyLiked) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('recipe_id', recipeId)
      .eq('user_id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('likes')
      .insert({ recipe_id: recipeId, user_id: user.id });
    // Ignore duplicate-key (already liked in another tab); rethrow others.
    if (error && error.code !== '23505') throw error;
  }
  return fetchLikeState(recipeId);
}

// ---- Comments -------------------------------------------------------------

// Fetch comments for a recipe, oldest first, with each commenter's current
// display name + avatar joined from profiles.
export async function fetchComments(recipeId) {
  if (!isSupabaseReady() || !recipeId) return [];

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = data || [];
  const ids = [...new Set(rows.map((c) => c.user_id))];
  const names = new Map();
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', ids);
    for (const p of profs || []) names.set(p.id, p);
  }
  return rows.map((c) => ({
    ...c,
    author_name: names.get(c.user_id)?.display_name || 'cook',
    author_avatar: names.get(c.user_id)?.avatar_url || null,
  }));
}

export async function addComment(recipeId, body) {
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const text = (body || '').trim();
  if (!text) throw new Error('Comment is empty.');
  if (text.length > 2000) throw new Error('Comment is too long (2000 chars max).');

  const { data, error } = await supabase
    .from('comments')
    .insert({ recipe_id: recipeId, user_id: user.id, body: text })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(commentId) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}

// Can the current user delete this comment? (UI hint; RLS is the real gate.)
export function canDeleteComment(comment, recipe) {
  const user = currentUser();
  if (!user) return false;
  return user.isAdmin || comment.user_id === user.id || recipe?.author_id === user.id;
}
