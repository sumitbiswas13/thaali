// ---------------------------------------------------------------------------
// Shared category vocabulary.
//
// BOTH the "Add a recipe" form (dropdowns) and the browse page (filter chips)
// import these lists, so the options always match exactly. Edit here once.
// ---------------------------------------------------------------------------

export const CUISINES = [
  'Indian',
  'Italian',
  'Chinese',
  'Mexican',
  'Thai',
  'Japanese',
  'Middle Eastern',
  'Mediterranean',
  'French',
  'American',
  'Korean',
  'Vietnamese',
  'Spanish',
  'Greek',
  'Caribbean',
  'African',
  'Other',
];

export const COURSES = [
  'Breakfast',
  'Lunch',
  'Main',
  'Side',
  'Appetizer',
  'Snack',
  'Soup',
  'Salad',
  'Dessert',
  'Drink',
  'Baking',
  'Sauce',
];

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

// ---------------------------------------------------------------------------
// Dietary tags — MULTI-select (a recipe can carry several).
// Stored as a text[] array in the DB (column: diet_tags). Cook-declared,
// not verified — the Browse filter shows a note to that effect for allergens.
// Order here is the display order in the form and filter.
// ---------------------------------------------------------------------------
export const DIET_TAGS = [
  'Non-Vegetarian',
  'Vegetarian',
  'Eggless',
  'Vegan',
  'Jain',
  'Gluten-Free',
  'Nut-Free',
  'Dairy-Free',
  'Soy-Free',
];

// Which tags are allergen / free-from claims (these get the "as tagged by the
// cook — always check ingredients" caveat near the filter).
export const DIET_ALLERGEN_TAGS = ['Gluten-Free', 'Nut-Free', 'Dairy-Free', 'Soy-Free'];

// ---------------------------------------------------------------------------
// Method step "starters" — optional one-tap openers shown under the Method
// section of the Submit/Edit form. Purely a writing aid: clicking one inserts
// the opener text into whichever step the cook is currently writing. Nothing
// is ever auto-filled, overwritten, or required — cooks who prefer to write
// freehand simply ignore the row. Keep this list short and cuisine-neutral.
// ---------------------------------------------------------------------------
export const STEP_STARTERS = [
  'Heat',
  'Add',
  'Stir in',
  'Cook until',
  'Simmer until',
  'Season with',
  'Remove from heat',
  'Set aside',
];

// ---------------------------------------------------------------------------
// Total-time filter buckets for the Browse page.
// `match(totalMinutes)` returns true if a recipe falls in the bucket.
// `All` has no match fn (it is the default "no filter" chip).
// ---------------------------------------------------------------------------
export const TIME_BUCKETS = [
  { label: 'Under 30 min', match: (m) => m != null && m < 30 },
  { label: '30–60 min', match: (m) => m != null && m >= 30 && m <= 60 },
  { label: 'Over 60 min', match: (m) => m != null && m > 60 },
];

// ---------------------------------------------------------------------------
// Countries — stored as ISO 3166-1 alpha-2 codes, shown by name.
// Same anti-fragmentation reasoning as cuisines: never store free text.
// `code` goes in the DB; `name` is what the cook sees.
// ---------------------------------------------------------------------------
export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'GR', name: 'Greece' },
  { code: 'TR', name: 'Turkey' },
  { code: 'RU', name: 'Russia' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'NP', name: 'Nepal' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IL', name: 'Israel' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'EG', name: 'Egypt' },
  { code: 'MA', name: 'Morocco' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'TT', name: 'Trinidad & Tobago' },
  { code: 'OTHER', name: 'Elsewhere' },
];

// Look up a country name from its stored code (for display).
export function countryName(code) {
  if (!code) return '';
  const hit = COUNTRIES.find((c) => c.code === code);
  return hit ? hit.name : '';
}
