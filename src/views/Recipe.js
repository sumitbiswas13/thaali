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
    ? r.steps
        .map((s) => {
          const mins = s.timer_seconds ? Math.round(s.timer_seconds / 60) : 0;
          const timer = mins > 0 ? `<span class="step-timer-badge">⏱ ${mins} min</span>` : '';
          return `<li>${s.instruction}${timer}</li>`;
        })
        .join('')
    : '<li>No method listed yet.</li>';

  const editable = canEdit(r);

  // Meta line: only show parts we actually have.
  const eyebrow = [r.cuisine, r.course].filter(Boolean).join(' · ');
  const total = (r.prep_time || 0) + (r.cook_time || 0);
  const metaBits = [
    r.prep_time ? `Prep ${r.prep_time}m` : '',
    r.cook_time ? `Cook ${r.cook_time}m` : '',
    total ? `Total ${total}m` : '',
    r.servings ? `Serves ${r.servings}` : '',
    r.difficulty || '',
  ].filter(Boolean);

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
      <div class="hero-img">${
        r.image_url ? `<img class="hero-photo" src="${r.image_url}" alt="${r.title}" />` : '<div class="platter"></div>'
      }</div>
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
      <h1>${r.title}</h1>
      <p class="lede" style="font-size:1.1rem;">${r.description || ''}</p>
      ${
        metaBits.length
          ? `<div class="card-meta" style="margin:16px 0;">${metaBits.map((m) => `<span>${m}</span>`).join('')}</div>`
          : ''
      }

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

      <p class="byline" style="margin-top:32px;">Recipe by ${
        r.author_id
          ? `<a class="byline-link" href="#/profile?id=${r.author_id}">${r.author}</a>`
          : r.author
      }</p>
      ${
        r.source_url
          ? `<p class="source-link"><a href="${r.source_url}" target="_blank" rel="noopener noreferrer">View original recipe ↗</a></p>`
          : ''
      }
      ${
        editable
          ? `<div style="margin-top:16px;"><button class="btn btn-ghost" data-action="delete-recipe">Delete recipe</button></div>`
          : ''
      }
    </main>
    ${Footer()}
  `;
}
