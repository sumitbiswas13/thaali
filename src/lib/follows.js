import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Follows layer: cooks following cooks. Thin wrappers over the follows table;
// RLS is the real gate (you can only follow/unfollow as yourself). Counts are
// shown on profiles; who-follows-whom lists are a future enhancement.
// ---------------------------------------------------------------------------

// Follower + following counts for a cook, plus whether the CURRENT user follows
// them. Returns { followers, following, isFollowing }.
//   followers  = how many cooks follow this profile
//   following  = how many cooks this profile follows
//   isFollowing = does the signed-in user follow this profile (false on own)
export async function fetchFollowState(profileId) {
  const empty = { followers: 0, following: 0, isFollowing: false };
  if (!isSupabaseReady() || !profileId) return empty;

  const me = currentUser();

  // Count rows where this profile is the followee → its followers.
  const followersQ = supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('followee_id', profileId);

  // Count rows where this profile is the follower → who it follows.
  const followingQ = supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', profileId);

  const [{ count: followers }, { count: following }] = await Promise.all([
    followersQ,
    followingQ,
  ]);

  let isFollowing = false;
  if (me && me.id !== profileId) {
    const { data } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', me.id)
      .eq('followee_id', profileId)
      .maybeSingle();
    isFollowing = Boolean(data);
  }

  return { followers: followers || 0, following: following || 0, isFollowing };
}

// Toggle the current user's follow of `profileId`. Returns the new
// { followers, following, isFollowing }. No-op-safe on races (duplicate
// insert / missing delete are ignored).
export async function toggleFollow(profileId, currentlyFollowing) {
  const me = currentUser();
  if (!me) throw new Error('You must be signed in.');
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  if (me.id === profileId) throw new Error('You cannot follow yourself.');

  if (currentlyFollowing) {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', me.id)
      .eq('followee_id', profileId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: me.id, followee_id: profileId });
    // Ignore duplicate-key (already following in another tab); rethrow others.
    if (error && error.code !== '23505') throw error;
  }
  return fetchFollowState(profileId);
}
