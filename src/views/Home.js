import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import { recipes } from '../lib/mockData.js';
import { onMount, navigate as go } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { CUISINES, COURSES } from '../lib/categories.js';

export function Home() {
  if (!isSignedIn()) {
    go('/auth');
    return '';
  }

  // Only show filter options that actually have recipes behind them, plus "All".
  // Built from the shared lists so labels/casing match the submit form exactly.
  const usedCuisines = new Set(recipes.map((r) => r.cuisine).filter(Boolean));
  const usedCourses = new Set(recipes.map((r) => r.course).filter(Boolean));
  const cuisineChips = ['All', ...CUISINES.filter((c) => usedCuisines.has(c))];
  const courseChips = ['All', ...COURSES.filter((c) => usedCourses.has(c))];

  const state = { cuisine: 'All', course: 'All' };

  onMount(() => {
    const grid = document.getElementById('recipe-grid');
    const count = document.getElementById('result-count');

    function apply() {
      const filtered = recipes.filter(
        (r) =>
          (state.cuisine === 'All' || r.cuisine === state.cuisine) &&
          (state.course === 'All' || r.course === state.course)
      );
      grid.innerHTML = filtered.length
        ? filtered.map(RecipeCard).join('')
        : `<p class="muted">No recipes match these filters yet.</p>`;
      count.textContent = `${filtered.length} recipe${filtered.length === 1 ? '' : 's'}`;
    }

    document.querySelectorAll('[data-group="cuisine"] .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document
          .querySelectorAll('[data-group="cuisine"] .chip')
          .forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        state.cuisine = chip.dataset.val;
        apply();
      });
    });
    document.querySelectorAll('[data-group="course"] .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document
          .querySelectorAll('[data-group="course"] .chip')
          .forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        state.course = chip.dataset.val;
        apply();
      });
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
        <h2>All recipes</h2>
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
