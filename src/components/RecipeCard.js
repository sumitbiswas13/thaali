import { isSignedIn } from '../lib/auth.js';

export function RecipeCard(r) {
  const locked = r.locked && !isSignedIn();
  const href = locked ? '#/auth' : `#/recipe?id=${r.id}`;
  return `
    <a class="card ${locked ? 'locked' : ''}" href="${href}">
      <div class="card-media"><div class="platter"></div></div>
      <div class="card-body">
        <h3>${r.title}</h3>
        <div class="card-meta">
          <span>${r.total_time || r.prep_time + r.cook_time} min</span>
          <span>${r.difficulty}</span>
          <span>${r.cuisine}</span>
        </div>
        <div class="byline">by ${r.author}</div>
      </div>
    </a>
  `;
}
