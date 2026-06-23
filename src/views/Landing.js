import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import {
  seedRecipes,
  seedCooks,
  recipes as liveRecipes,
  cooks as liveCooks,
} from '../lib/mockData.js';
import { isSignedIn } from '../lib/auth.js';

// Landing is a hybrid showcase: real posted recipes lead, and the static seed
// teasers (with "Join to open" locks) backfill so the page is never sparse.
// loadRecipes() runs at boot before first paint, so liveRecipes/liveCooks are
// already populated here — no async needed in the view.
const FEATURED_SLOTS = 6;

export function Landing() {
  const signedIn = isSignedIn();

  // Real recipes first (already newest-first from the loader), then top up with
  // seed teasers — skipping any seed whose id collides — until we hit 6.
  const live = liveRecipes || [];
  const liveIds = new Set(live.map((r) => r.id));
  const fillers = seedRecipes.filter((s) => !liveIds.has(s.id));
  const featured = [...live, ...fillers].slice(0, FEATURED_SLOTS);

  // Cooks: prefer the real cooks; fall back to the seed cook only if there are
  // no live recipes yet (keeps the section from going empty on a cold start).
  const cooks = (liveCooks && liveCooks.length) ? liveCooks : seedCooks;

  // Stats: count live where we have it, else seed, so it's never 0/0/0.
  const statRecipes = live.length || seedRecipes.length;
  const statCooks = (liveCooks && liveCooks.length) || seedCooks.length;
  const cuisineSource = live.length ? live : seedRecipes;
  const statCuisines = new Set(cuisineSource.map((r) => r.cuisine).filter(Boolean)).size;

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
          <div class="stat"><div class="num">${statRecipes}</div><div class="label">Recipes</div></div>
          <div class="stat"><div class="num">${statCooks}</div><div class="label">Cooks</div></div>
          <div class="stat"><div class="num">${statCuisines}</div><div class="label">Cuisines</div></div>
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
              <div class="count">${c.recipe_ids.length} recipe${c.recipe_ids.length === 1 ? '' : 's'}</div>
            </div>`
            )
            .join('')}
        </div>
      </section>
    </main>
    ${Footer()}
  `;
}
