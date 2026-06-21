import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import { recipes } from '../lib/mockData.js';
import { onMount, navigate as go } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { CUISINES, COURSES, DIFFICULTIES, TIME_BUCKETS } from '../lib/categories.js';
import { fetchLikeCounts, fetchCommentCounts } from '../lib/social.js';

// Module-scoped count caches, filled once per Browse mount and reused across
// filter re-renders so we never re-query on every chip click.
let likeCounts = new Map();
let commentCounts = new Map();

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

  const state = { cuisine: 'All', course: 'All', difficulty: 'All', time: 'All', q: initialQ };

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

    function apply() {
      const filtered = recipes.filter(
        (r) =>
          matchesText(r) &&
          (state.cuisine === 'All' || r.cuisine === state.cuisine) &&
          (state.course === 'All' || r.course === state.course) &&
          (state.difficulty === 'All' || r.difficulty === state.difficulty) &&
          matchesTime(r)
      );
      grid.innerHTML = filtered.length
        ? filtered.map(RecipeCard).join('')
        : `<p class="muted">No recipes match these filters yet.</p>`;
      count.textContent = `${filtered.length} recipe${filtered.length === 1 ? '' : 's'}`;
      paintCounts();
    }

    // One delegated wiring routine for every filter group.
    function wireGroup(group, key) {
      document.querySelectorAll(`[data-group="${group}"] .chip`).forEach((chip) => {
        chip.addEventListener('click', () => {
          document
            .querySelectorAll(`[data-group="${group}"] .chip`)
            .forEach((c) => c.setAttribute('aria-pressed', 'false'));
          chip.setAttribute('aria-pressed', 'true');
          state[key] = chip.dataset.val;
          apply();
        });
      });
    }

    wireGroup('cuisine', 'cuisine');
    wireGroup('course', 'course');
    wireGroup('difficulty', 'difficulty');
    wireGroup('time', 'time');

    // If we arrived with a search term, filter right away.
    if (state.q) apply();

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

  return `
    ${Header()}
    <main class="wrap">
      <div class="section-head">
        <h2>${initialQ ? `Results for “${initialQ.replace(/</g, '&lt;')}”` : 'All recipes'}</h2>
        <span class="muted" id="result-count">${recipes.length} recipe${recipes.length === 1 ? '' : 's'}</span>
      </div>

      ${
        recipes.length
          ? `
        <div class="filter-block">
          <span class="filter-label">Cuisine</span>
          ${chipRow('cuisine', cuisineChips)}
        </div>
        <div class="filter-block">
          <span class="filter-label">Course</span>
          ${chipRow('course', courseChips)}
        </div>
        ${
          diffChips.length > 1
            ? `<div class="filter-block">
                 <span class="filter-label">Difficulty</span>
                 ${chipRow('difficulty', diffChips)}
               </div>`
            : ''
        }
        <div class="filter-block">
          <span class="filter-label">Time</span>
          ${chipRow('time', timeChips)}
        </div>
        <div class="grid" id="recipe-grid">
          ${recipes.map(RecipeCard).join('')}
        </div>`
          : `<p class="muted">No recipes yet. <a href="#/submit">Add the first →</a></p>
             <div class="grid" id="recipe-grid" hidden></div>
             <span id="result-count" hidden></span>`
      }
    </main>
    ${Footer()}
  `;
}
