// ===========================================================================
// Thaali — culinary news feed (Cloudflare Pages Function)
//
//   GET /api/news
//
// Returns a small list of food / cooking / chef news items as JSON:
//   { ok: true, source: 'guardian'|'rss', items: [
//       { title, summary, url, image, author, published, section }
//   ] }
//
// Strategy:
//   1. If env GUARDIAN_API_KEY is set, query the Guardian Open Platform's
//      `food` section (rich data: thumbnail, trailText, byline). The Guardian
//      gives non-profit projects a free key, which is exactly Thaali's case.
//   2. If no key is configured, transparently fall back to the Guardian
//      Food & Drink RSS feed (no key needed) so News works the moment this
//      deploys — the key can be added later for richer cards.
//
// The response is cached at Cloudflare's edge for ~30 minutes, so the upstream
// API is hit at most a couple of times an hour regardless of traffic. That
// keeps us comfortably under the free 500-calls/day floor.
//
// Like import.js, this runs on the trusted edge. It touches no Supabase data
// and no user secret; it only reads a public news feed.
// ===========================================================================

const CACHE_SECONDS = 1800; // 30 minutes
const MAX_ITEMS = 24;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // Let the browser + Cloudflare cache the feed; the API call is the expensive bit.
  'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
};

export async function onRequestGet(context) {
  const { request, env } = context;

  // --- Edge cache: serve a cached copy if we have one ---------------------
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/news', request.url).toString(), request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let payload;
  try {
    if (env && env.GUARDIAN_API_KEY) {
      payload = await fromGuardianApi(env.GUARDIAN_API_KEY);
    } else {
      payload = await fromGuardianRss();
    }
  } catch (err) {
    // On any upstream failure, try the keyless RSS path before giving up.
    try {
      payload = await fromGuardianRss();
    } catch {
      return json({ ok: false, error: 'Could not load news right now.', items: [] }, 502);
    }
  }

  const resp = json(payload);
  // Store in the edge cache (clone — a Response body can only be read once).
  context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// --- Guardian Open Platform (with key) -------------------------------------
async function fromGuardianApi(apiKey) {
  const url =
    'https://content.guardianapis.com/search' +
    '?section=food' +
    '&order-by=newest' +
    `&page-size=${MAX_ITEMS}` +
    '&show-fields=trailText,thumbnail,byline,headline' +
    '&api-key=' +
    encodeURIComponent(apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const resp = await fetch(url, { signal: controller.signal });
  clearTimeout(timer);
  if (!resp.ok) throw new Error(`Guardian API ${resp.status}`);

  const data = await resp.json();
  const results = data?.response?.results || [];
  const items = results.map((r) => ({
    title: stripTags(r.fields?.headline || r.webTitle || ''),
    summary: stripTags(r.fields?.trailText || ''),
    url: r.webUrl || '',
    image: r.fields?.thumbnail || null,
    author: stripTags(r.fields?.byline || ''),
    published: r.webPublicationDate || null,
    section: r.sectionName || 'Food',
  }));
  return { ok: true, source: 'guardian', items };
}

// --- Guardian Food & Drink RSS (no key) ------------------------------------
async function fromGuardianRss() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const resp = await fetch('https://www.theguardian.com/food/rss', {
    headers: { 'User-Agent': 'ThaaliBot/1.0 (+https://thaali.app)' },
    signal: controller.signal,
  });
  clearTimeout(timer);
  if (!resp.ok) throw new Error(`Guardian RSS ${resp.status}`);

  const xml = await resp.text();
  const items = parseRssItems(xml).slice(0, MAX_ITEMS);
  return { ok: true, source: 'rss', items };
}

// --- Tiny RSS parser (no XML lib on the edge) ------------------------------
function parseRssItems(xml) {
  const out = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0];
    const title = stripTags(getTag(block, 'title'));
    const link = stripTags(getTag(block, 'link'));
    const desc = stripTags(getTag(block, 'description'));
    const date = stripTags(getTag(block, 'pubDate'));
    const author = stripTags(getTag(block, 'dc:creator') || getTag(block, 'creator'));
    // RSS media thumbnail, if present.
    const mediaMatch =
      block.match(/<media:content[^>]*url="([^"]+)"/i) ||
      block.match(/<media:thumbnail[^>]*url="([^"]+)"/i) ||
      block.match(/<enclosure[^>]*url="([^"]+)"/i);
    out.push({
      title,
      summary: desc,
      url: link,
      image: mediaMatch ? mediaMatch[1] : null,
      author,
      published: date ? new Date(date).toISOString() : null,
      section: 'Food',
    });
  }
  return out;
}

function getTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

// Strip any leftover HTML tags + decode the common entities.
function stripTags(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}
