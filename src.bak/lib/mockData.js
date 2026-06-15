// ---------------------------------------------------------------------------
// Data store. Was static mock arrays; now a live store backed by Supabase.
//
// The views import `recipes`, `cooks`, and the derive* helpers SYNCHRONOUSLY,
// so we keep exporting a live array reference and mutate it in place after an
// async load. main.js calls loadRecipes() at boot (and Submit/edit calls it
// again after a write) so the array is populated before views render.
//
// `demoImport` stays as static fixture data — it's the simulated URL-import
// result, not real data.
// ---------------------------------------------------------------------------

import { fetchRecipes } from './recipes.js';

// Live array — keep the SAME reference; mutate contents in place.
export const recipes = [];

// Derived cooks list (grouped by author). Recomputed on each load.
export const cooks = [];

// Populate `recipes` (and `cooks`) from Supabase. Returns the array.
export async function loadRecipes() {
  let rows = [];
  try {
    rows = await fetchRecipes();
  } catch (err) {
    console.error('Failed to load recipes:', err);
    rows = [];
  }

  // Replace contents in place so existing imports keep their reference.
  recipes.length = 0;
  recipes.push(...rows);

  // Rebuild cooks from authors present in the data.
  const byAuthor = new Map();
  for (const r of recipes) {
    const name = r.author || 'anonymous';
    if (!byAuthor.has(name)) byAuthor.set(name, []);
    byAuthor.get(name).push(r.id);
  }
  cooks.length = 0;
  for (const [name, ids] of byAuthor) {
    cooks.push({ id: 'cook-' + name, display_name: name, recipe_ids: ids });
  }

  return recipes;
}

// ── Derived stats (never hardcoded; computed from whatever is loaded) ──
export const deriveStats = () => ({
  recipes: recipes.length,
  cooks: cooks.length,
  categories: new Set(recipes.map((r) => r.cuisine).filter(Boolean)).size,
});

export const deriveCategories = () => [...new Set(recipes.map((r) => r.cuisine).filter(Boolean))];

// Static fixture: the demo recipe a URL-import returns in the prototype.
export const demoImport = {
  title: 'Imported: Classic Margherita Pizza',
  source_url: 'https://example.com/margherita',
  cuisine: 'Italian',
  course: 'Main',
  imported_fields: ['title', 'cuisine', 'course', 'ingredients'],
  ingredients: [
    { quantity: '250', unit: 'g', item: '00 flour', imported: true },
    { quantity: '1', unit: 'tsp', item: 'salt', imported: true },
    { quantity: '1', unit: 'ball', item: 'fresh mozzarella', imported: true },
  ],
  steps: [
    { instruction: 'Stretch the dough by hand into a thin round.', imported: false },
    { instruction: 'Top with sauce and torn mozzarella.', imported: false },
  ],
};
