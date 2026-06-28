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
    diet_tags: recipe.diet_tags ?? [],
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
// Downscale + re-encode an image in the browser before upload. Phone photos
// are often 5–12 MB; for a recipe card we only need ~1600px on the long edge,
// which re-encodes to well under 1 MB with no visible web-quality loss. Returns
// a Blob (JPEG). Falls back to the original file if anything goes wrong.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

async function compressImage(file) {
  // Only attempt for raster images the canvas can draw. SVG/GIF pass through.
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
    );
    // If compression didn't help (already tiny), keep whichever is smaller.
    if (blob && blob.size < file.size) return blob;
    return file;
  } catch {
    return file; // createImageBitmap/toBlob unsupported — upload original
  }
}

// Mirrors uploadAvatar in profiles.js; files live under "<uid>/<timestamp>.<ext>"
// so several recipes per cook never collide.
export async function uploadRecipeImage(file) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const user = currentUser();
  if (!user) throw new Error('You must be signed in.');

  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  // Generous raw ceiling — a safety net checked BEFORE compression. Normal
  // phone photos pass and get shrunk to well under 1 MB below.
  if (file.size > 15 * 1024 * 1024) throw new Error('Image must be under 15 MB.');

  // Shrink + re-encode in the browser so we store a web-sized image.
  const payload = await compressImage(file);
  // Compressed output is always JPEG; only keep original ext if we passed through.
  const ext = payload === file ? (file.name.split('.').pop() || 'jpg').toLowerCase() : 'jpg';
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('recipe-images')
    .upload(path, payload, { upsert: true, cacheControl: '3600', contentType: payload.type || file.type });
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
