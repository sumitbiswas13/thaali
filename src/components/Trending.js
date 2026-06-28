import { RecipeCard } from './RecipeCard.js';
import { recipes } from '../lib/mockData.js';
import { fetchLikeCounts, fetchCommentCounts } from '../lib/social.js';

// ---------------------------------------------------------------------------
// Trending strip — shared by Landing and Browse.
//
// Score = likes + 2×comments (a comment is a stronger engagement signal than
// a like). Primary window: recipes created in the last 7 days. If fewer than
// MIN_SHOW qualify (likely pre-launch / quiet weeks), fall back to all-time
// top by the same score so the strip isn't sparse. If nothing has ANY
// engagement at all, the section hides itself entirely.
//
// Counts are async, so the markup() call paints an empty, hidden shell on first
// render; mountTrending() then fetches counts and either fills + reveals the
// shell, or leaves it hidden. This avoids layout shift and a flash of "empty
// trending".
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 7;
const SHOW_COUNT = 4; // cards in the strip
const MIN_SHOW = 3; // need at least this many before the strip is worth showing

// `id` lets Landing and Browse each have their own instance on one page load
// without colliding (only matters if both ever render together, but cheap).
// `wrapless` omits the .wrap class for callers (Browse) that already sit inside
// a .wrap container — avoids double horizontal padding.
export function TrendingStrip(id = 'trending', wrapless = false) {
  return `
    <section class="${wrapless ? '' : 'wrap '}trending-section" id="${id}" hidden>
      <div class="section-head"><h2>Trending this week</h2></div>
      <div class="grid grid-compact trending-grid" data-trending-grid></div>
    </section>`;
}

export function mountTrending(id = 'trending') {
  const section = document.getElementById(id);
  if (!section) return;
  const grid = section.querySelector('[data-trending-grid]');
  if (!grid) return;

  const all = recipes || [];
  // Don't bother querying if there's basically nothing to rank.
  if (all.length < MIN_SHOW) return;

  const ids = all.map((r) => r.id);
  Promise.all([fetchLikeCounts(ids), fetchCommentCounts(ids)])
    .then(([likes, comments]) => {
      const score = (r) => (likes.get(r.id) || 0) + 2 * (comments.get(r.id) || 0);

      // Only recipes with some engagement can trend.
      const engaged = all.filter((r) => score(r) > 0);
      if (engaged.length === 0) return; // nothing trending — leave hidden

      const now = Date.now();
      const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const inWindow = engaged.filter((r) => {
        const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
        return !Number.isNaN(t) && t >= cutoff;
      });

      // Prefer the 7-day window; fall back to all-time engaged if too thin.
      const pool = inWindow.length >= MIN_SHOW ? inWindow : engaged;
      const top = [...pool]
        .sort((a, b) => score(b) - score(a))
        .slice(0, SHOW_COUNT);

      if (top.length < MIN_SHOW) return; // still too few — stay hidden

      grid.innerHTML = top.map(RecipeCard).join('');
      // Paint the like/comment badges on the trending cards too.
      top.forEach((r) => {
        const el = grid.querySelector(`.card-social[data-recipe-id="${r.id}"]`);
        if (!el) return;
        const l = likes.get(r.id) || 0;
        const c = comments.get(r.id) || 0;
        if (l === 0 && c === 0) return;
        el.hidden = false;
        const likeEl = el.querySelector('.card-likes');
        const commentEl = el.querySelector('.card-comments');
        likeEl.querySelector('.n').textContent = l;
        likeEl.hidden = l === 0;
        commentEl.querySelector('.n').textContent = c;
        commentEl.hidden = c === 0;
      });

      section.hidden = false;
    })
    .catch(() => {
      /* trending is non-critical; leave the section hidden on failure */
    });
}
