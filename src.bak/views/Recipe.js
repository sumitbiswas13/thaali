import { Header, Footer } from '../components/layout.js';
import { recipes } from '../lib/mockData.js';
import { isSignedIn } from '../lib/auth.js';
import { canEdit, deleteRecipe } from '../lib/recipes.js';
import { loadRecipes } from '../lib/mockData.js';
import { navigate, onMount } from '../lib/router.js';

export function Recipe(params) {
  // All recipe viewing requires sign-in.
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  const r = recipes.find((x) => x.id === params.id);
  if (!r) {
    navigate('/home');
    return '';
  }

  const ingredients = r.ingredients?.length
    ? r.ingredients
        .map(
          (i) =>
            `<li><span class="amt">${[i.quantity, i.unit].filter(Boolean).join(' ')}</span><span>${i.item}</span></li>`
        )
        .join('')
    : '<li><span>No ingredients listed yet.</span></li>';

  const steps = r.steps?.length
    ? r.steps.map((s) => `<li>${s.instruction}</li>`).join('')
    : '<li>No method listed yet.</li>';

  const editable = canEdit(r);

  onMount(() => {
    document.querySelector('[data-action="delete-recipe"]')?.addEventListener('click', async (e) => {
      if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return;
      e.target.disabled = true;
      try {
        await deleteRecipe(r.id);
        await loadRecipes();
        navigate('/home');
      } catch (err) {
        e.target.disabled = false;
        alert('Delete failed: ' + err.message);
      }
    });
  });

  return `
    ${Header()}
    <main class="wrap recipe-detail">
      <div class="hero-img"><div class="platter"></div></div>
      <p class="eyebrow">${r.cuisine} · ${r.course}</p>
      <h1>${r.title}</h1>
      <p class="lede" style="font-size:1.1rem;">${r.description || ''}</p>
      <div class="card-meta" style="margin:16px 0;">
        <span>Prep ${r.prep_time}m</span>
        <span>Cook ${r.cook_time}m</span>
        <span>Serves ${r.servings}</span>
        <span>${r.difficulty}</span>
      </div>

      <div class="recipe-cols">
        <div>
          <h3 style="margin-bottom:12px;">Ingredients</h3>
          <ul class="ing-list">${ingredients}</ul>
        </div>
        <div>
          <h3 style="margin-bottom:12px;">Method</h3>
          <ul class="method-list">${steps}</ul>
        </div>
      </div>

      <p class="byline" style="margin-top:32px;">Recipe by ${r.author}</p>
      ${
        editable
          ? `<div style="margin-top:16px;"><button class="btn btn-ghost" data-action="delete-recipe">Delete recipe</button></div>`
          : ''
      }
    </main>
    ${Footer()}
  `;
}
