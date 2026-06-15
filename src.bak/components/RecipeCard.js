export function RecipeCard(r) {
  const href = `#/recipe?id=${r.id}`;
  const total = r.total_time || (r.prep_time || 0) + (r.cook_time || 0);
  return `
    <a class="card" href="${href}">
      <div class="card-media"><div class="platter"></div></div>
      <div class="card-body">
        <h3>${r.title}</h3>
        <div class="card-meta">
          <span>${total} min</span>
          <span>${r.difficulty || ''}</span>
          <span>${r.cuisine || ''}</span>
        </div>
        <div class="byline">by ${r.author}</div>
      </div>
    </a>
  `;
}
