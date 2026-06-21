import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Recipes data layer. Matches the shape the views render:
//   { id, title, author, author_id, cuisine, course, prep_time, cook_time,
//     servings, difficulty, description, image_url, source_url,
//     ingredients[], steps[] }
// ingredients = [{ quantity, unit, item }], steps = [{ instruction, timer_seconds? }]
// Both stored as JSONB so the objects round-trip unchanged.
// ---------------------------------------------------------------------------

const TABLE = 'recipes';

export async function fetchRecipes() {
  if (!isSupabaseReady()) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchRecipe(id) {
  if (!isSupabaseReady()) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createRecipe(recipe) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const user = currentUser();
  if (!user) throw new Error('You must be signed in to add a recipe.');

  const row = {
    title: recipe.title,
    description: recipe.description ?? '',
    cuisine: recipe.cuisine ?? null,
    course: recipe.course ?? null,
    prep_time: recipe.prep_time ?? null,
    cook_time: recipe.cook_time ?? null,
    servings: recipe.servings ?? null,
    difficulty: recipe.difficulty ?? null,
    image_url: recipe.image_url ?? null,
    images: recipe.images ?? [],
    source_url: recipe.source_url ?? null,
    ingredients: recipe.ingredients ?? [],
    steps: recipe.steps ?? [],
    author: recipe.author ?? user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'anonymous',
    author_id: user.id,
    author_email: user.email,
  };

  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateRecipe(id, patch) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRecipe(id) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

// Upload a recipe hero image to storage and return its public URL.
// Mirrors uploadAvatar in profiles.js; files live under "<uid>/<timestamp>.<ext>"
// so several recipes per cook never collide.
export async function uploadRecipeImage(file) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');

  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB.');

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('recipe-images')
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('recipe-images').getPublicUrl(path);
  return data.publicUrl;
}

// Owner or admin? (RLS is the real gate; this is only for showing UI buttons.)
export function canEdit(recipe) {
  const user = currentUser();
  if (!user) return false;
  return user.isAdmin || recipe.author_id === user.id;
}
