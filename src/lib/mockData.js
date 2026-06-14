// Mock in-memory data for the prototype.
//
// Honesty-over-vanity (from the handoff): every stat shown in the UI is
// DERIVED from this data, never hardcoded. Small-but-real beats big-but-fake.
// When Supabase is wired, replace these arrays with live queries — the
// derive* helpers below keep working unchanged.

export const recipes = [
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

export const cooks = [
  { id: 'c1', display_name: 'Sumi', bio: 'Home cook, building Thaali.', recipe_ids: recipes.map((r) => r.id) },
];

// The single demo recipe a URL-import always returns in the prototype.
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

// ── Derived stats (never hardcoded) ──
export const deriveStats = () => ({
  recipes: recipes.length,
  cooks: cooks.length,
  categories: new Set(recipes.map((r) => r.cuisine)).size,
});

export const deriveCategories = () => [...new Set(recipes.map((r) => r.cuisine))];
