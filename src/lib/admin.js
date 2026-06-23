import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Admin queue client layer. All reads/updates here rely on the admin RLS
// policies already in the schema (reports_read_own_or_admin / reports_update_
// admin / deletion_read_own_or_admin). A non-admin simply sees nothing — but
// the #/admin route is also guarded in the view, and the destructive deletion
// action additionally re-checks admin server-side in the Function.
// ---------------------------------------------------------------------------

// --- Reports queue ---------------------------------------------------------

// Fetch reports for the queue, newest first, optionally filtered by status.
// Each row is enriched with a little context about its target (recipe title +
// key, or comment body + recipe) and the reporter's display name, via a few
// batched follow-up queries (kept simple; the queue is small).
export async function fetchReports(status = 'open') {
  if (!isSupabaseReady()) return [];

  let q = supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);

  const { data: reports, error } = await q;
  if (error) throw error;
  if (!reports || reports.length === 0) return [];

  // Batch-resolve recipes, comments, and reporters.
  const recipeIds = [...new Set(reports.map((r) => r.recipe_id).filter(Boolean))];
  const commentIds = [...new Set(reports.map((r) => r.comment_id).filter(Boolean))];
  const reporterIds = [...new Set(reports.map((r) => r.reporter_id).filter(Boolean))];

  const [recipesMap, commentsMap, reportersMap] = await Promise.all([
    fetchRecipesMap(recipeIds),
    fetchCommentsMap(commentIds),
    fetchProfilesMap(reporterIds),
  ]);

  // For comment reports, we also want the parent recipe key to build a link.
  const commentRecipeIds = [
    ...new Set([...commentsMap.values()].map((c) => c.recipe_id).filter(Boolean)),
  ];
  const commentRecipesMap = await fetchRecipesMap(
    commentRecipeIds.filter((id) => !recipesMap.has(id))
  );
  for (const [k, v] of recipesMap) commentRecipesMap.set(k, v);

  return reports.map((r) => {
    const reporter = reportersMap.get(r.reporter_id);
    if (r.recipe_id) {
      const rec = recipesMap.get(r.recipe_id);
      return {
        ...r,
        kind: 'recipe',
        reporter_name: reporter?.display_name || 'A cook',
        recipe_title: rec?.title || '(deleted recipe)',
        recipe_key: rec?.slug || rec?.short_code || r.recipe_id,
      };
    }
    const cmt = commentsMap.get(r.comment_id);
    const parent = cmt ? commentRecipesMap.get(cmt.recipe_id) : null;
    return {
      ...r,
      kind: 'comment',
      reporter_name: reporter?.display_name || 'A cook',
      comment_body: cmt?.body || '(deleted comment)',
      recipe_key: parent ? parent.slug || parent.short_code || cmt.recipe_id : null,
    };
  });
}

// Update a report's status (admin-only via RLS). status ∈ reviewed | dismissed | open.
export async function setReportStatus(reportId, status) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from('reports')
    .update({ status })
    .eq('id', reportId);
  if (error) throw error;
}

// Delete a reported comment (admin RLS on comments allows admin delete).
export async function deleteReportedComment(commentId) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) throw error;
}

// --- Deletion-requests queue ----------------------------------------------

// Fetch deletion requests for the queue, newest first, optionally by status.
export async function fetchDeletionRequests(status = 'pending') {
  if (!isSupabaseReady()) return [];
  let q = supabase
    .from('deletion_requests')
    .select('*')
    .order('requested_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Action a deletion via the verified-JWT admin Function (uses the service-role
// key server-side, after re-checking admin + a pending request exists).
export async function actionDeletion(userId, wipeRecipes) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  let resp;
  try {
    resp = await fetch('/api/admin-delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_id: userId, wipe_recipes: wipeRecipes === true }),
    });
  } catch {
    throw new Error('Network error — please try again.');
  }

  let payload = {};
  try {
    payload = await resp.json();
  } catch {
    /* non-JSON */
  }
  if (!resp.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not action the deletion.');
  }
  return payload;
}

// --- small batched lookups -------------------------------------------------

async function fetchRecipesMap(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data } = await supabase
    .from('recipes')
    .select('id, title, slug, short_code')
    .in('id', ids);
  for (const r of data || []) map.set(r.id, r);
  return map;
}

async function fetchCommentsMap(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data } = await supabase
    .from('comments')
    .select('id, body, recipe_id')
    .in('id', ids);
  for (const c of data || []) map.set(c.id, c);
  return map;
}

async function fetchProfilesMap(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  for (const p of data || []) map.set(p.id, p);
  return map;
}
