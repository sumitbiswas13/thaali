// ===========================================================================
// Thaali — server-rendered recipe page  (Cloudflare Pages Function)
//
//   GET /recipe/<slug>
//
// Serves the SPA shell (dist/index.html) but with per-recipe SEO baked into the
// <head> BEFORE it reaches the client:
//   • <title> + meta description
//   • canonical URL
//   • Open Graph + Twitter card (real recipe photo → good link previews)
//   • JSON-LD schema.org/Recipe (→ Google rich recipe cards)
//
// This runs for BOTH crawlers and real browsers. Browsers still boot the full
// SPA (the original <script> tag is preserved), so humans get the interactive
// app; crawlers get real HTML with the recipe's content and structured data.
//
// Recipe data comes from the anon-safe `recipes_public` view, so no private
// column (e.g. author_email) is ever exposed.
// ===========================================================================

const SITE = 'https://thaali.app';
const FALLBACK_IMAGE = `${SITE}/logo/og-image.jpg`;

export async function onRequestGet(context) {
  const { params, env, request, next } = context;
  const slug = String(params.slug || '').trim();

  // Grab the built SPA shell to inject into. ASSETS binding serves the static
  // dist output; fetching the site's own /index.html gives us the current
  // hashed asset tags without hardcoding them.
  const shellResp = await fetch(new URL('/index.html', request.url).toString());
  let html = await shellResp.text();

  const SUPABASE_URL = env && env.VITE_SUPABASE_URL;
  const ANON_KEY = env && env.VITE_SUPABASE_ANON_KEY;

  let recipe = null;
  if (slug && SUPABASE_URL && ANON_KEY) {
    try {
      recipe = await fetchRecipe(SUPABASE_URL, ANON_KEY, slug);
    } catch {
      recipe = null;
    }
  }

  // Unknown slug → serve the shell unchanged (the SPA will show its own
  // not-found / redirect). Still a 200 so the client router can take over.
  if (!recipe) {
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const head = buildHead(recipe, slug);
  // Replace the shell's default <title>…</title> and inject our tags + JSON-LD
  // right before </head>. We strip the shell's generic OG/Twitter/description
  // so the recipe-specific ones win.
  html = stripGenericMeta(html);
  html = html.replace(/<\/head>/i, `${head}\n  </head>`);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Recipes can be edited; let the edge hold it briefly but revalidate.
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  });
}

// --- Data ------------------------------------------------------------------
async function fetchRecipe(baseUrl, anonKey, slug) {
  // Resolve by slug first; fall back to short_code (old links).
  const url =
    `${baseUrl}/rest/v1/recipes_public` +
    `?or=(slug.eq.${encodeURIComponent(slug)},short_code.eq.${encodeURIComponent(slug)})` +
    `&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// --- Head builder ----------------------------------------------------------
function buildHead(r, slug) {
  const title = `${r.title} — Thaali`;
  const desc = truncate(cleanText(r.description) || `${r.title}, a recipe on Thaali — a free, ad-free community cookbook.`, 160);
  const canonical = `${SITE}/recipe/${encodeURIComponent(r.slug || slug)}`;
  const image = firstImage(r) || FALLBACK_IMAGE;
  const jsonld = recipeJsonLd(r, canonical, image);

  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    ``,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Thaali" />`,
    `<meta property="og:title" content="${esc(r.title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    ``,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(r.title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ``,
    `<script type="application/ld+json">${jsonld}</script>`,
  ].map((l) => (l ? '    ' + l : '')).join('\n');
}

// schema.org/Recipe — the structured data Google uses for rich recipe cards.
function recipeJsonLd(r, canonical, image) {
  const obj = {
    '@context': 'https://schema.org/',
    '@type': 'Recipe',
    name: r.title,
    url: canonical,
    image: imageList(r).length ? imageList(r) : [image],
    description: cleanText(r.description) || undefined,
    author: r.author ? { '@type': 'Person', name: r.author } : undefined,
    datePublished: r.created_at || undefined,
    dateModified: r.updated_at || undefined,
    recipeCuisine: r.cuisine || undefined,
    recipeCategory: r.course || undefined,
    keywords: Array.isArray(r.diet_tags) && r.diet_tags.length ? r.diet_tags.join(', ') : undefined,
    prepTime: isoDuration(r.prep_time),
    cookTime: isoDuration(r.cook_time),
    totalTime: isoDuration((r.prep_time || 0) + (r.cook_time || 0)) || undefined,
    recipeYield: r.servings ? String(r.servings) + ' servings' : undefined,
    recipeIngredient: ingredientList(r),
    recipeInstructions: instructionList(r),
  };
  // Drop undefined/empty fields for a clean payload.
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) delete obj[k];
  });
  return JSON.stringify(obj);
}

function ingredientList(r) {
  const arr = safeArray(r.ingredients);
  const out = [];
  for (const ing of arr) {
    if (typeof ing === 'string') { if (ing.trim()) out.push(ing.trim()); continue; }
    if (ing && typeof ing === 'object') {
      if (ing.raw && String(ing.raw).trim()) { out.push(String(ing.raw).trim()); continue; }
      const line = [ing.quantity, ing.unit, ing.item].filter((x) => x != null && String(x).trim() !== '').join(' ').trim();
      if (line) out.push(line);
    }
  }
  return out;
}

function instructionList(r) {
  const arr = safeArray(r.steps);
  const out = [];
  for (const s of arr) {
    const text = typeof s === 'string' ? s : (s && (s.instruction || s.text)) || '';
    const t = cleanText(text);
    if (t) out.push({ '@type': 'HowToStep', text: t });
  }
  return out;
}

// --- helpers ---------------------------------------------------------------
function firstImage(r) {
  const list = imageList(r);
  return list.length ? list[0] : (r.image_url || null);
}
function imageList(r) {
  const out = [];
  if (r.image_url) out.push(r.image_url);
  for (const u of safeArray(r.images)) {
    if (typeof u === 'string' && u && !out.includes(u)) out.push(u);
    else if (u && u.url && !out.includes(u.url)) out.push(u.url);
  }
  return out;
}
function safeArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
function isoDuration(mins) {
  const m = parseInt(mins, 10);
  if (!m || m <= 0) return undefined;
  return `PT${m}M`;
}
function cleanText(s) {
  if (!s) return '';
  // Strip the light markdown the app uses (**bold**, *italic*) + collapse space.
  return String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\s+/g, ' ').trim();
}
function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
// Remove the shell's generic <title> + description/OG/Twitter tags so the
// recipe-specific ones we inject are the only ones (no duplicate <title>).
// Leaves favicons, manifest, theme-color, charset, etc.
function stripGenericMeta(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, '')
    .replace(/<meta\s+property="og:type"[\s\S]*?\/>/i, '')
    .replace(/<meta\s+property="og:title"[\s\S]*?\/>/i, '')
    .replace(/<meta\s+property="og:description"[\s\S]*?\/>/i, '')
    .replace(/<meta\s+property="og:url"[\s\S]*?\/>/i, '')
    .replace(/<meta\s+property="og:image"(?!:)[\s\S]*?\/>/i, '')
    .replace(/<meta\s+name="twitter:title"[\s\S]*?\/>/i, '')
    .replace(/<meta\s+name="twitter:description"[\s\S]*?\/>/i, '')
    .replace(/<meta\s+name="twitter:image"[\s\S]*?\/>/i, '');
}
