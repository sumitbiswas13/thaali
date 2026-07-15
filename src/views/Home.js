import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import { TrendingStrip, mountTrending } from '../components/Trending.js';
import { recipes } from '../lib/mockData.js';
import { onMount, navigate as go } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { CUISINES, COURSES, DIFFICULTIES, TIME_BUCKETS, DIET_TAGS, DIET_ALLERGEN_TAGS } from '../lib/categories.js';
import { fetchLikeCounts, fetchCommentCounts } from '../lib/social.js';

// Module-scoped count caches, filled once per Browse mount and reused across
// filter re-renders so we never re-query on every chip click.
let likeCounts = new Map();
let commentCounts = new Map();

// How many recipe cards to show per page before paginating.
const PER_PAGE = 12;

// Total cooking time for a recipe, in minutes (or null if unknown).
function totalMinutes(r) {
  const t = (r.prep_time || 0) + (r.cook_time || 0);
  return t > 0 ? t : null;
}

export function Home(params = {}) {
  if (!isSignedIn()) {
    go('/auth');
    return '';
  }

  const initialQ = (params.q || '').trim();

  // Only show filter options that actually have recipes behind them, plus "All".
  // Built from the shared lists so labels/casing match the submit form exactly.
  const usedCuisines = new Set(recipes.map((r) => r.cuisine).filter(Boolean));
  const usedCourses = new Set(recipes.map((r) => r.course).filter(Boolean));
  const usedDiffs = new Set(recipes.map((r) => r.difficulty).filter(Boolean));
  const cuisineChips = ['All', ...CUISINES.filter((c) => usedCuisines.has(c))];
  const courseChips = ['All', ...COURSES.filter((c) => usedCourses.has(c))];
  const diffChips = ['All', ...DIFFICULTIES.filter((d) => usedDiffs.has(d))];
  const timeChips = ['All', ...TIME_BUCKETS.map((b) => b.label)];

  // Dietary tags actually present across the catalog (keeps the bar tidy when
  // few tags are in use). Preserve DIET_TAGS order.
  const usedDiet = new Set(recipes.flatMap((r) => r.diet_tags || []));
  const dietChips = DIET_TAGS.filter((t) => usedDiet.has(t));

  const state = { cuisine: 'All', course: 'All', difficulty: 'All', time: 'All', diet: [], q: initialQ, page: 1 };

  // Free-text match across the fields a cook would search by.
  function matchesText(r) {
    if (!state.q) return true;
    const needle = state.q.toLowerCase();
    const hay = [
      r.title,
      r.description,
      r.cuisine,
      r.course,
      r.author,
      ...(r.ingredients || []).map((i) => i.item),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  }

  onMount(() => {
    const grid = document.getElementById('recipe-grid');
    const count = document.getElementById('result-count');
    const pager = document.getElementById('pager');

    function matchesTime(r) {
      if (state.time === 'All') return true;
      const bucket = TIME_BUCKETS.find((b) => b.label === state.time);
      return bucket ? bucket.match(totalMinutes(r)) : true;
    }

    // Fill the like/comment badges on every visible card from the caches.
    function paintCounts() {
      grid.querySelectorAll('.card-social').forEach((el) => {
        const id = el.dataset.recipeId;
        const likes = likeCounts.get(id) || 0;
        const comments = commentCounts.get(id) || 0;
        // Only show the strip if there's any signal — keeps empty cards clean.
        if (likes === 0 && comments === 0) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        const likeEl = el.querySelector('.card-likes');
        const commentEl = el.querySelector('.card-comments');
        likeEl.querySelector('.n').textContent = likes;
        likeEl.hidden = likes === 0;
        commentEl.querySelector('.n').textContent = comments;
        commentEl.hidden = comments === 0;
      });
    }

    function currentFiltered() {
      return recipes.filter(
        (r) =>
          matchesText(r) &&
          (state.cuisine === 'All' || r.cuisine === state.cuisine) &&
          (state.course === 'All' || r.course === state.course) &&
          (state.difficulty === 'All' || r.difficulty === state.difficulty) &&
          (state.diet.length === 0 ||
            state.diet.every((t) => (r.diet_tags || []).includes(t))) &&
          matchesTime(r)
      );
    }

    // Render the pagination control (1 | 2 | > >>) for the given page count.
    function renderPager(totalPages) {
      if (totalPages <= 1) {
        pager.innerHTML = '';
        pager.hidden = true;
        return;
      }
      pager.hidden = false;
      const p = state.page;
      const btn = (label, target, opts = {}) => {
        const { disabled = false, active = false, aria } = opts;
        return `<button class="page-btn${active ? ' is-active' : ''}"
          data-page="${target}" ${disabled ? 'disabled' : ''}
          ${aria ? `aria-label="${aria}"` : ''}
          ${active ? 'aria-current="page"' : ''}>${label}</button>`;
      };

      // Windowed page numbers so the row stays compact as recipes pile up.
      const nums = [];
      const span = 2; // pages either side of current
      let start = Math.max(1, p - span);
      let end = Math.min(totalPages, p + span);
      if (start > 1) {
        nums.push(btn('1', 1));
        if (start > 2) nums.push(`<span class="page-gap">…</span>`);
      }
      for (let i = start; i <= end; i++) nums.push(btn(String(i), i, { active: i === p }));
      if (end < totalPages) {
        if (end < totalPages - 1) nums.push(`<span class="page-gap">…</span>`);
        nums.push(btn(String(totalPages), totalPages));
      }

      pager.innerHTML = `
        ${btn('‹', p - 1, { disabled: p === 1, aria: 'Previous page' })}
        ${nums.join('')}
        ${btn('›', p + 1, { disabled: p === totalPages, aria: 'Next page' })}
        ${btn('»', totalPages, { disabled: p === totalPages, aria: 'Last page' })}
      `;
    }

    function apply() {
      const filtered = currentFiltered();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
      if (state.page > totalPages) state.page = totalPages;

      const startIdx = (state.page - 1) * PER_PAGE;
      const pageItems = filtered.slice(startIdx, startIdx + PER_PAGE);

      grid.innerHTML = filtered.length
        ? pageItems.map(RecipeCard).join('')
        : `<p class="muted">No recipes match these filters yet.</p>`;

      count.textContent = `${filtered.length} recipe${filtered.length === 1 ? '' : 's'}`;
      renderPager(totalPages);
      paintCounts();
    }

    // One delegated wiring routine for every filter group. Changing a filter
    // resets to page 1 so you're never stranded on an out-of-range page.
    function wireGroup(group, key) {
      document.querySelectorAll(`[data-group="${group}"] .chip`).forEach((chip) => {
        chip.addEventListener('click', () => {
          document
            .querySelectorAll(`[data-group="${group}"] .chip`)
            .forEach((c) => c.setAttribute('aria-pressed', 'false'));
          chip.setAttribute('aria-pressed', 'true');
          state[key] = chip.dataset.val;
          state.page = 1;
          apply();
        });
      });
    }

    wireGroup('cuisine', 'cuisine');
    wireGroup('course', 'course');
    wireGroup('difficulty', 'difficulty');
    wireGroup('time', 'time');

    // Dietary tags are MULTI-select: toggling adds/removes from state.diet,
    // and a recipe must carry ALL selected tags (AND) to pass the filter.
    document.querySelectorAll('[data-group="diet"] .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.val;
        const on = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', on ? 'false' : 'true');
        if (on) {
          state.diet = state.diet.filter((t) => t !== val);
        } else {
          state.diet.push(val);
        }
        state.page = 1;
        apply();
      });
    });

    // Pagination clicks (delegated — buttons are re-rendered each apply()).
    pager.addEventListener('click', (e) => {
      const b = e.target.closest('.page-btn');
      if (!b || b.disabled) return;
      const target = Number(b.dataset.page);
      if (!target || target === state.page) return;
      state.page = target;
      apply();
      // Bring the results back into view after a page change.
      document.querySelector('.section-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Initial paint always runs so pagination shows even without a search term.
    apply();

    // Fetch like/comment counts once, then paint badges onto whatever's shown.
    const ids = recipes.map((r) => r.id);
    Promise.all([fetchLikeCounts(ids), fetchCommentCounts(ids)])
      .then(([likes, comments]) => {
        likeCounts = likes;
        commentCounts = comments;
        paintCounts();
      })
      .catch(() => {
        /* counts are non-critical; leave badges hidden on failure */
      });

    // Trending strip (skipped on search-result views).
    if (!initialQ) mountTrending('trending-browse');
  });

  const chipRow = (group, list) =>
    `<div class="chips" data-group="${group}">
      ${list
        .map(
          (c, i) =>
            `<button class="chip" data-val="${c}" aria-pressed="${i === 0}">${c}</button>`
        )
        .join('')}
    </div>`;

  // Each filter is a labelled column; the bar lays them out left-to-right and
  // wraps gracefully on narrow screens.
  const filterCol = (group, label, list) =>
    `<div class="filter-col" data-group-col="${group}">
       <span class="filter-label">${label}</span>
       ${chipRow(group, list)}
     </div>`;

  return `
    ${Header()}
    <main class="wrap">
      ${initialQ ? '' : TrendingStrip('trending-browse', true)}
      <div class="section-head">
        <h2>${initialQ ? `Results for “${initialQ.replace(/</g, '&lt;')}”` : 'All recipes'}</h2>
        <span class="muted" id="result-count">${recipes.length} recipe${recipes.length === 1 ? '' : 's'}</span>
      </div>

      ${
        recipes.length
          ? `
        <div class="filter-bar">
          ${filterCol('cuisine', 'Cuisine', cuisineChips)}
          ${filterCol('course', 'Course', courseChips)}
          ${diffChips.length > 1 ? filterCol('difficulty', 'Difficulty', diffChips) : ''}
          ${filterCol('time', 'Time', timeChips)}
        </div>
        ${
          dietChips.length
            ? `<div class="filter-bar diet-bar">
                 <div class="filter-col" data-group-col="diet" style="flex:1;">
                   <span class="filter-label">Dietary
                     <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0;">— tagged by the cook; always check ingredients</span>
                   </span>
                   <div class="chips" data-group="diet">
                     ${dietChips
                       .map(
                         (c) =>
                           `<button class="chip" data-val="${c}" aria-pressed="false">${c}</button>`
                       )
                       .join('')}
                   </div>
                 </div>
               </div>`
            : ''
        }
        <div class="grid grid-compact" id="recipe-grid">
          ${recipes.map(RecipeCard).join('')}
        </div>
        <nav class="pager" id="pager" aria-label="Pagination" hidden></nav>`
          : `<p class="muted">No recipes yet. <a href="/submit">Add the first →</a></p>
             <div class="grid grid-compact" id="recipe-grid" hidden></div>
             <nav class="pager" id="pager" hidden></nav>
             <span id="result-count" hidden></span>`
      }
    </main>
    ${Footer()}
  `;
}
