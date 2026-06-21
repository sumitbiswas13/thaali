import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import { seedRecipes as recipes, seedCooks as cooks, deriveStats } from '../lib/mockData.js';
import { isSignedIn } from '../lib/auth.js';

export function Landing() {
  const stats = deriveStats();
  const featured = recipes.slice(0, 6);
  const signedIn = isSignedIn();

  return `
    ${Header()}
    <main>
      <section class="hero">
        <div class="wrap hero-inner">
          <p class="eyebrow">थाली · a shared platter</p>
          <h1>A free home for the recipes <span class="accent">you cook</span>.</h1>
          <p class="lede">
            Thaali is a community cookbook built by cooks, for everyone.
            Paste a link, structure it once, and your recipe lives here —
            clean, searchable, and permanent.
          </p>
          <div class="hero-cta">
            ${
              signedIn
                ? `<a class="btn btn-primary" href="#/home">Browse recipes</a>
                   <a class="btn btn-ghost" href="#/submit">Add a recipe</a>`
                : `<a class="btn btn-primary" href="#/auth">Join free</a>
                   <a class="btn btn-ghost" href="#/auth">Browse recipes</a>`
            }
          </div>
          <p class="promise">No ads · No paywall · No data-selling · Forever</p>
        </div>
      </section>

      <section class="wrap">
        <div class="section-head"><h2>Fresh from the kitchen</h2></div>
        <div class="grid">
          ${featured.map(RecipeCard).join('')}
        </div>
      </section>

      <section class="wrap">
        <div class="stats">
          <div class="stat"><div class="num">${stats.recipes}</div><div class="label">Recipes</div></div>
          <div class="stat"><div class="num">${stats.cooks}</div><div class="label">Cooks</div></div>
          <div class="stat"><div class="num">${stats.categories}</div><div class="label">Cuisines</div></div>
        </div>
      </section>

      <section class="wrap">
        <div class="section-head"><h2>The cooks</h2></div>
        <div class="cooks">
          ${cooks
            .map(
              (c) => `
            <div class="cook">
              <div class="avatar"></div>
              <div class="name">${c.display_name}</div>
              <div class="count">${c.recipe_ids.length} recipes</div>
            </div>`
            )
            .join('')}
        </div>
      </section>
    </main>
    ${Footer()}
  `;
}
