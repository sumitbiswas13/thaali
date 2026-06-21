import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Profiles data layer.
//   profile = { id, display_name, bio, avatar_url, created_at, updated_at }
// All reads require sign-in (RLS). A user can edit only their own row.
// ---------------------------------------------------------------------------

const TABLE = 'profiles';
const BUCKET = 'avatars';

export async function fetchProfile(id) {
  if (!isSupabaseReady() || !id) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Ensure the signed-in user has a profile row (the DB trigger normally makes
// it, but this is a safety net for older accounts).
export async function ensureOwnProfile() {
  const user = currentUser();
  if (!user || !isSupabaseReady()) return null;

  let profile = await fetchProfile(user.id);
  if (profile) return profile;

  const seed = {
    id: user.id,
    display_name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'cook',
    avatar_url: user.user_metadata?.avatar_url || null,
    bio: '',
  };
  const { data, error } = await supabase.from(TABLE).insert(seed).select().single();
  if (error) throw error;
  return data;
}

export async function updateProfile(patch) {
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');

  const clean = {
    display_name: patch.display_name?.trim() || null,
    bio: patch.bio?.trim() || '',
  };
  if ('avatar_url' in patch) clean.avatar_url = patch.avatar_url;

  const { data, error } = await supabase
    .from(TABLE)
    .update(clean)
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Upload an avatar image to storage and return its public URL.
export async function uploadAvatar(file) {
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');

  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 3 * 1024 * 1024) throw new Error('Image must be under 3 MB.');

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  // Stored under "<uid>/avatar.<ext>" so the storage RLS folder check passes.
  const path = `${user.id}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so a re-upload shows immediately.
  return `${data.publicUrl}?v=${Date.now()}`;
}
