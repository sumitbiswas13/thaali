import { isSignedIn } from '../lib/auth.js';

export function RecipeCard(r) {
  const locked = r.locked && !isSignedIn();
  // Prefer the pretty slug, then the short code, then the uuid.
  const key = r.slug || r.short_code || r.id;
  const href = locked ? '#/auth' : `#/recipe?id=${key}`;
  const total = r.total_time || (r.prep_time || 0) + (r.cook_time || 0);
  return `
    <a class="card ${locked ? 'locked' : ''}" href="${href}">
      <div class="card-media">${
        r.image_url ? `<img class="card-photo" src="${r.image_url}" alt="${r.title}" />` : '<div class="platter"></div>'
      }</div>
      <div class="card-body">
        <h3>${r.title}</h3>
        <div class="card-meta">
          ${total ? `<span>${total} min</span>` : ''}
          ${r.difficulty ? `<span>${r.difficulty}</span>` : ''}
          ${r.cuisine ? `<span>${r.cuisine}</span>` : ''}
        </div>
        <div class="byline">by ${r.author}</div>
      </div>
    </a>
  `;
}
