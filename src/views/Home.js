import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import { recipes, deriveCategories } from '../lib/mockData.js';
import { onMount, navigate as go } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';

export function Home() {
  if (!isSignedIn()) {
    go('/auth');
    return '';
  }

  const categories = ['All', ...deriveCategories()];

  onMount(() => {
    const chips = document.querySelectorAll('.chip');
    const grid = document.getElementById('recipe-grid');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        const cat = chip.dataset.cat;
        const filtered = cat === 'All' ? recipes : recipes.filter((r) => r.cuisine === cat);
        grid.innerHTML = filtered.map(RecipeCard).join('');
      });
    });
  });

  return `
    ${Header()}
    <main class="wrap">
      <div class="section-head"><h2>All recipes</h2></div>
      <div class="chips">
        ${categories
          .map(
            (c, i) =>
              `<button class="chip" data-cat="${c}" aria-pressed="${i === 0}">${c}</button>`
          )
          .join('')}
      </div>
      <div class="grid" id="recipe-grid">
        ${recipes.map(RecipeCard).join('')}
      </div>
    </main>
    ${Footer()}
  `;
}
