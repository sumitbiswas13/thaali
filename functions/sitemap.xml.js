// ===========================================================================
// Thaali — dynamic sitemap  (Cloudflare Pages Function)
//
//   GET /sitemap.xml
//
// Emits a valid XML sitemap listing the static pages plus EVERY published
// recipe, queried live from Supabase (the `recipes_public` view — anon-safe).
// Because it's generated on request, new recipes appear automatically with no
// rebuild. Cached at the edge for 1 hour so we don't hit Supabase on every
// crawl.
//
// Recipe URLs use the readable slug: https://thaali.app/recipe/<slug>
// lastmod uses updated_at so Google re-crawls edited recipes.
// ===========================================================================

const SITE = 'https://thaali.app';
const CACHE_SECONDS = 3600; // 1 hour

// Static, always-present pages worth indexing. (Auth-gated app pages like
// /submit, /account, /admin are intentionally excluded — they're not content.)
const STATIC_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/home', priority: '0.9', changefreq: 'daily' },   // recipe browse
  { path: '/news', priority: '0.5', changefreq: 'daily' },
  { path: '/contact', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
  { path: '/terms', priority: '0.2', changefreq: 'yearly' },
];

export async function onRequestGet(context) {
  const { request, env } = context;

  // Serve from the edge cache when warm.
  const cache = caches.default;
  const cacheKey = new Request(new URL('/sitemap.xml', request.url).toString(), request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const SUPABASE_URL = env && env.VITE_SUPABASE_URL;
  const ANON_KEY = env && env.VITE_SUPABASE_ANON_KEY;

  let recipes = [];
  if (SUPABASE_URL && ANON_KEY) {
    try {
      recipes = await fetchRecipeSlugs(SUPABASE_URL, ANON_KEY);
    } catch {
      // On failure, still return a valid sitemap of the static pages.
      recipes = [];
    }
  }

  const xml = buildSitemap(recipes);
  const resp = new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// Pull slug + updated_at for every recipe from the anon-safe view.
// Paginates in case the catalog grows past the default 1000-row cap.
async function fetchRecipeSlugs(baseUrl, anonKey) {
  const out = [];
  const pageSize = 1000;
  let from = 0;

  // Loop pages until a short page signals the end.
  for (;;) {
    const url =
      `${baseUrl}/rest/v1/recipes_public` +
      `?select=slug,updated_at&slug=not.is.null&order=updated_at.desc`;
    const resp = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Range: `${from}-${from + pageSize - 1}`,
        Prefer: 'count=none',
      },
    });
    if (!resp.ok) throw new Error(`Supabase ${resp.status}`);
    const rows = await resp.json();
    for (const r of rows) {
      if (r && r.slug) out.push({ slug: r.slug, updated_at: r.updated_at });
    }
    if (!Array.isArray(rows) || rows.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break; // sitemap hard cap safety
  }
  return out;
}

function buildSitemap(recipes) {
  const now = new Date().toISOString();
  const urls = [];

  for (const s of STATIC_PATHS) {
    urls.push(urlEntry(`${SITE}${s.path}`, now, s.changefreq, s.priority));
  }
  for (const r of recipes) {
    const lastmod = r.updated_at ? new Date(r.updated_at).toISOString() : now;
    urls.push(urlEntry(`${SITE}/recipe/${encodeURIComponent(r.slug)}`, lastmod, 'weekly', '0.8'));
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  );
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return (
    '  <url>\n' +
    `    <loc>${xmlEscape(loc)}</loc>\n` +
    `    <lastmod>${lastmod}</lastmod>\n` +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n` +
    '  </url>'
  );
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
