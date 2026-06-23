// ---------------------------------------------------------------------------
// News feed — thin client wrapper over the /api/news Cloudflare Function.
//
// The Function does the heavy lifting (Guardian API/RSS + edge caching). Here
// we add a short in-memory cache so re-visiting the News tab in the same
// session doesn't even re-hit the edge.
// ---------------------------------------------------------------------------

let cache = { at: 0, items: null };
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function fetchNews({ force = false } = {}) {
  const fresh = cache.items && Date.now() - cache.at < TTL_MS;
  if (fresh && !force) return cache.items;

  const resp = await fetch('/api/news', { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error('Could not load news.');
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'Could not load news.');

  cache = { at: Date.now(), items: data.items || [] };
  return cache.items;
}
