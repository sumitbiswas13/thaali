import { Header, Footer } from '../components/layout.js';
import { recipes } from '../lib/mockData.js';
import { isSignedIn } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function Recipe(params) {
  const r = recipes.find((x) => x.id === params.id);
  if (!r) {
    navigate('/home');
    return '';
  }
  if (r.locked && !isSignedIn()) {
    navigate('/auth');
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
    </main>
    ${Footer()}
  `;
}
