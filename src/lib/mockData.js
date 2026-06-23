// ---------------------------------------------------------------------------
// Data module — Option A (public teaser + live app).
//
// Landing page uses the STATIC seed data below as a permanent showcase, so the
// homepage is never empty and shows real recipe cards with "Join to open"
// locks (a signup funnel). The actual app (Home / Recipe / Submit, after
// sign-in) uses the LIVE `recipes` array, filled from Supabase by loadRecipes().
// ---------------------------------------------------------------------------

import { fetchRecipes } from './recipes.js';
import { fetchProfilesByIds } from './profiles.js';

// ── STATIC SEED DATA (Landing teaser — not the database) ──
export const seedRecipes = [
  {
    id: 'r1',
    title: 'Everyday Dal Tadka',
    author: 'Sumi',
    cuisine: 'Indian',
    course: 'Main',
    prep_time: 10,
    cook_time: 25,
    servings: 4,
    difficulty: 'Easy',
    description: 'Soft toor dal finished with a sizzling cumin-garlic tempering.',
    locked: false,
    ingredients: [
      { quantity: '1', unit: 'cup', item: 'toor dal (split pigeon peas)' },
      { quantity: '3', unit: 'cups', item: 'water' },
      { quantity: '1/2', unit: 'tsp', item: 'turmeric' },
      { quantity: '2', unit: 'tbsp', item: 'ghee' },
      { quantity: '1', unit: 'tsp', item: 'cumin seeds' },
      { quantity: '3', unit: 'cloves', item: 'garlic, sliced' },
    ],
    steps: [
      { instruction: 'Rinse dal, then simmer with water and turmeric until soft, ~25 min.', timer_seconds: 1500 },
      { instruction: 'Heat ghee, crackle cumin, add garlic until golden.' },
      { instruction: 'Pour the tempering over the dal, stir, and serve hot.' },
    ],
  },
  {
    id: 'r2', title: 'Weeknight Shakshuka', author: 'Sumi', cuisine: 'Middle Eastern',
    course: 'Breakfast', prep_time: 8, cook_time: 20, servings: 2, difficulty: 'Easy',
    description: 'Eggs poached in a spiced tomato and pepper sauce.', locked: false,
    ingredients: [], steps: [],
  },
  { id: 'r3', title: 'Lemon Olive Oil Cake', author: 'Sumi', cuisine: 'Italian', course: 'Dessert', prep_time: 15, cook_time: 40, servings: 8, difficulty: 'Medium', description: 'Tender, citrus-forward, one bowl.', locked: true, ingredients: [], steps: [] },
  { id: 'r4', title: 'Garlic Sesame Noodles', author: 'Sumi', cuisine: 'Chinese', course: 'Main', prep_time: 5, cook_time: 10, servings: 2, difficulty: 'Easy', description: 'Pantry noodles in ten minutes.', locked: true, ingredients: [], steps: [] },
  { id: 'r5', title: 'Roasted Tomato Soup', author: 'Sumi', cuisine: 'American', course: 'Main', prep_time: 10, cook_time: 35, servings: 4, difficulty: 'Easy', description: 'Deep-roasted tomatoes blended smooth.', locked: true, ingredients: [], steps: [] },
  { id: 'r6', title: 'Cardamom Chai', author: 'Sumi', cuisine: 'Indian', course: 'Drink', prep_time: 3, cook_time: 8, servings: 2, difficulty: 'Easy', description: 'Strong, milky, fragrant.', locked: true, ingredients: [], steps: [] },
];

export const seedCooks = [
  { id: 'c1', author_id: null, display_name: 'Sumi', bio: 'Home cook, building Thaali.', avatar_url: null, recipe_ids: seedRecipes.map((r) => r.id) },
];

// ── Landing stat helpers (run off the stable seed showcase) ──
export const deriveStats = () => ({
  recipes: seedRecipes.length,
  cooks: seedCooks.length,
  categories: new Set(seedRecipes.map((r) => r.cuisine).filter(Boolean)).size,
});

// ── LIVE DATA (the real app, post sign-in) ──
export const recipes = [];
export const cooks = [];

export async function loadRecipes() {
  let rows = [];
  try {
    rows = await fetchRecipes();
  } catch (err) {
    console.error('Failed to load recipes:', err);
    rows = [];
  }

  // Resolve each recipe's CURRENT author name from profiles, so a display-name
  // change shows everywhere instead of the snapshot stored at publish time.
  // profs is also reused below to give each cook an avatar + profile link.
  let profs = new Map();
  try {
    profs = await fetchProfilesByIds(rows.map((r) => r.author_id));
    for (const r of rows) {
      const p = r.author_id ? profs.get(r.author_id) : null;
      if (p?.display_name) r.author = p.display_name;
    }
  } catch (err) {
    console.error('Failed to resolve author names:', err); // fall back to stored author
  }

  recipes.length = 0;
  recipes.push(...rows);

  // Group cooks by author_id (stable across renames; avoids merging two cooks
  // who share a display name). Recipes with no author_id fall back to name.
  const byCook = new Map();
  for (const r of recipes) {
    const k = r.author_id || ('name:' + (r.author || 'anonymous'));
    if (!byCook.has(k)) byCook.set(k, []);
    byCook.get(k).push(r.id);
  }
  cooks.length = 0;
  for (const [k, ids] of byCook) {
    const authorId = k.startsWith('name:') ? null : k;
    const p = authorId ? profs.get(authorId) : null;
    const name = p?.display_name || recipes.find((r) => (r.author_id || ('name:' + (r.author || 'anonymous'))) === k)?.author || 'A Thaali cook';
    cooks.push({
      id: 'cook-' + k,
      author_id: authorId,
      display_name: name,
      avatar_url: p?.avatar_url || null,
      recipe_ids: ids,
    });
  }
  return recipes;
}

// Resolve a recipe from a URL key that may be a slug, a short_code, or the
// raw uuid (back-compat with old links). Checked in that order.
export function findRecipe(key) {
  if (!key) return null;
  return (
    recipes.find((r) => r.slug === key) ||
    recipes.find((r) => r.short_code === key) ||
    recipes.find((r) => r.id === key) ||
    null
  );
}

export const deriveCategories = () => [...new Set(recipes.map((r) => r.cuisine).filter(Boolean))];
