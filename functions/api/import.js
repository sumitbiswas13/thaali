// ===========================================================================
// Thaali — recipe importer (Cloudflare Pages Function)
//
// GET /api/import?url=<recipe page url>
//
// Fetches the page server-side (no browser CORS limits), looks for a
// schema.org/Recipe in JSON-LD, and maps it to Thaali's recipe shape:
//   { title, description, cuisine, course, prep_time, cook_time, servings,
//     difficulty, ingredients[{quantity,unit,item}], steps[{instruction}],
//     source_url, imported_fields[] }
//
// If no structured recipe is found, returns { ok:false } so the frontend can
// fall back to a blank "start from scratch" form.
//
// This runs on Cloudflare's edge — it is the trusted server side. It does NOT
// touch Supabase or any secret; it only fetches a public page and parses it.
// ===========================================================================

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // Same-origin app calls this; lock CORS to the site's own origin at the edge.
  'Cache-Control': 'no-store',
};

export async function onRequestGet({ request }) {
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get('url');

  if (!target) {
    return json({ ok: false, error: 'Missing ?url parameter.' }, 400);
  }

  // --- Validate the target URL: only http(s), block internal addresses ---
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json({ ok: false, error: 'That is not a valid URL.' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json({ ok: false, error: 'Only http and https links are supported.' }, 400);
  }
  if (isBlockedHost(parsed.hostname)) {
    return json({ ok: false, error: 'That address is not allowed.' }, 400);
  }

  // --- Fetch the page (with a timeout and a real UA) ---
  let html;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'ThaaliBot/1.0 (+https://thaali.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return json({ ok: false, error: `The page returned ${resp.status}.` }, 200);
    }
    const ctype = resp.headers.get('content-type') || '';
    if (!ctype.includes('html')) {
      return json({ ok: false, error: 'That link is not a web page.' }, 200);
    }
    // Cap body size to avoid pathological pages.
    html = (await resp.text()).slice(0, 2_000_000);
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'The page took too long to respond.' : 'Could not reach that page.';
    return json({ ok: false, error: msg }, 200);
  }

  // --- Find and parse a Recipe object ---
  const recipeNode = findRecipeJsonLd(html);
  if (!recipeNode) {
    return json({ ok: false, error: 'No structured recipe found on that page.' }, 200);
  }

  const mapped = mapRecipe(recipeNode, parsed.toString());
  return json({ ok: true, recipe: mapped }, 200);
}

// ---------------------------------------------------------------------------
// JSON-LD extraction
// ---------------------------------------------------------------------------

function findRecipeJsonLd(html) {
  // Grab every <script type="application/ld+json"> block.
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  const blocks = [];
  while ((match = re.exec(html)) !== null) {
    blocks.push(match[1]);
  }

  for (const raw of blocks) {
    let data;
    try {
      data = JSON.parse(stripJsonComments(raw));
    } catch {
      continue; // skip malformed blocks
    }
    const found = searchForRecipe(data);
    if (found) return found;
  }
  return null;
}

// JSON-LD can be an object, an array, or nest recipes under @graph.
function searchForRecipe(node) {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = searchForRecipe(item);
      if (found) return found;
    }
    return null;
  }

  if (isRecipeType(node['@type'])) return node;

  if (Array.isArray(node['@graph'])) {
    const found = searchForRecipe(node['@graph']);
    if (found) return found;
  }
  return null;
}

function isRecipeType(type) {
  if (!type) return false;
  if (Array.isArray(type)) return type.some((t) => String(t).toLowerCase() === 'recipe');
  return String(type).toLowerCase() === 'recipe';
}

function stripJsonComments(s) {
  // Some sites wrap JSON-LD in CDATA or stray HTML comments.
  return s.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}

// ---------------------------------------------------------------------------
// Map schema.org Recipe → Thaali shape
// ---------------------------------------------------------------------------

function mapRecipe(r, sourceUrl) {
  const imported = [];

  const title = cleanText(firstString(r.name));
  if (title) imported.push('title');

  const description = cleanText(firstString(r.description));
  if (description) imported.push('description');

  const cuisine = cleanText(firstString(r.recipeCuisine));
  if (cuisine) imported.push('cuisine');

  const course = cleanText(firstString(r.recipeCategory));
  if (course) imported.push('course');

  const prep_time = isoDurationToMinutes(r.prepTime);
  const cook_time = isoDurationToMinutes(r.cookTime || r.performTime);
  const servings = parseServings(r.recipeYield);

  const ingredients = mapIngredients(r.recipeIngredient || r.ingredients);
  if (ingredients.length) imported.push('ingredients');

  const steps = mapSteps(r.recipeInstructions);
  if (steps.length) imported.push('steps');

  return {
    title: title || '',
    description: description || '',
    cuisine: cuisine || '',
    course: course || '',
    difficulty: '',
    prep_time,
    cook_time,
    servings,
    ingredients,
    steps,
    source_url: sourceUrl,
    imported_fields: imported,
  };
}

function mapIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => splitIngredient(cleanText(String(raw))))
    .filter((i) => i.item);
}

// Best-effort split of "1 cup toor dal" → {quantity, unit, item}.
// The cook reviews/edits before publishing, so a rough split is fine.
function splitIngredient(text) {
  if (!text) return { quantity: '', unit: '', item: '' };

  const UNITS = new Set([
    'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs',
    'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
    'cup', 'cups', 'pinch', 'pinches', 'clove', 'cloves', 'can', 'cans',
    'slice', 'slices', 'piece', 'pieces', 'ball', 'balls', 'stick', 'sticks',
    'bunch', 'handful', 'sprig', 'sprigs', 'pint', 'quart', 'gallon',
  ]);

  const tokens = text.split(/\s+/);
  let quantity = '';
  let unit = '';
  let idx = 0;

  // Leading quantity: numbers, fractions, ranges, unicode fractions.
  const qtyRe = /^[\d]+([\/.\-–][\d]+)?$|^[¼½¾⅓⅔⅛⅜⅝⅞]$|^\d*[¼½¾⅓⅔⅛⅜⅝⅞]$/;
  while (idx < tokens.length && qtyRe.test(tokens[idx])) {
    quantity = quantity ? `${quantity} ${tokens[idx]}` : tokens[idx];
    idx++;
  }

  // Optional unit immediately after the quantity.
  if (idx < tokens.length && UNITS.has(tokens[idx].toLowerCase().replace(/\.$/, ''))) {
    unit = tokens[idx].replace(/\.$/, '');
    idx++;
  }

  const item = tokens.slice(idx).join(' ').trim();
  // If parsing ate everything, fall back to putting it all in `item`.
  if (!item) return { quantity: '', unit: '', item: text };

  return { quantity, unit, item };
}

function mapSteps(instructions) {
  if (!instructions) return [];

  // Can be a plain string, an array of strings, an array of HowToStep,
  // or HowToSection objects that contain itemListElement steps.
  const out = [];

  const pushStep = (val) => {
    const t = cleanText(typeof val === 'string' ? val : firstString(val?.text || val?.name));
    if (t) out.push({ instruction: t });
  };

  if (typeof instructions === 'string') {
    // Split a blob into sentences/lines as a rough fallback.
    instructions
      .split(/\r?\n|(?<=\.)\s{1,}(?=[A-Z])/)
      .map((s) => cleanText(s))
      .filter(Boolean)
      .forEach((s) => out.push({ instruction: s }));
    return out;
  }

  if (Array.isArray(instructions)) {
    for (const node of instructions) {
      if (node && typeof node === 'object' && Array.isArray(node.itemListElement)) {
        node.itemListElement.forEach(pushStep); // HowToSection
      } else {
        pushStep(node);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function firstString(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return firstString(v[0]);
  if (typeof v === 'object') return v.name || v['@value'] || '';
  return String(v);
}

function cleanText(s) {
  if (!s) return '';
  return decodeEntities(String(s))
    .replace(/<[^>]+>/g, ' ') // strip any stray HTML tags
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s) {
  const named = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z#0-9]+;/gi, (m) => named[m] ?? m);
}

// ISO 8601 duration (PT1H30M) → minutes.
function isoDurationToMinutes(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const total = h * 60 + min;
  return total > 0 ? total : null;
}

function parseServings(y) {
  if (y == null) return null;
  const s = Array.isArray(y) ? y.find((x) => /\d/.test(String(x))) ?? y[0] : y;
  const num = String(s).match(/\d+/);
  return num ? parseInt(num[0], 10) : null;
}

// Block private / internal hosts (basic SSRF guard).
function isBlockedHost(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local / cloud metadata
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
