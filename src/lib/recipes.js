import { supabase, isSupabaseReady } from './supabase.js';
import { currentUser } from './auth.js';

// ---------------------------------------------------------------------------
// Recipes data layer. Matches the shape the views render:
//   { id, title, author, author_id, cuisine, course, prep_time, cook_time,
//     servings, difficulty, description, ingredients[], steps[] }
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

// Owner or admin? (RLS is the real gate; this is only for showing UI buttons.)
export function canEdit(recipe) {
  const user = currentUser();
  if (!user) return false;
  return user.isAdmin || recipe.author_id === user.id;
}
