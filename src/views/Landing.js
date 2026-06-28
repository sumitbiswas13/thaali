import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import { TrendingStrip, mountTrending } from '../components/Trending.js';
import { onMount } from '../lib/router.js';
import {
  seedRecipes,
  seedCooks,
  recipes as liveRecipes,
  cooks as liveCooks,
} from '../lib/mockData.js';
import { isSignedIn } from '../lib/auth.js';
import { activeBanner } from '../lib/banner.js';

// Landing is a hybrid showcase: real posted recipes lead, and the static seed
// teasers (with "Join to open" locks) backfill so the page is never sparse.
// loadRecipes() + loadBanner() run at boot before first paint, so liveRecipes,
// liveCooks AND activeBanner are already populated here — no async in the view.
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

  onMount(() => mountTrending('trending-landing'));

  return `
    ${Header()}
    <main>
      <section class="hero ${activeBanner ? 'hero-split' : ''}">
        <div class="wrap hero-inner">
          <div class="hero-text">
            <p class="eyebrow">थाली · a shared platter</p>
            <h1>A free home for the recipes <span class="accent">you cook</span>.</h1>
            <p class="lede">
              Thaali is a community cookbook built by cooks, for everyone.
              Write a recipe in your own words, or paste a link to one you love —
              structure it once, and it lives here: clean, searchable, and yours forever.
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
          ${heroBanner(activeBanner)}
        </div>
      </section>

      ${TrendingStrip('trending-landing')}

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
            .map((c) => {
              const avatar = c.avatar_url
                ? `<div class="avatar"><img src="${c.avatar_url}" alt="" referrerpolicy="no-referrer" /></div>`
                : `<div class="avatar"></div>`;
              const inner = `
                ${avatar}
                <div class="name">${c.display_name}</div>
                <div class="count">${c.recipe_ids.length} recipe${c.recipe_ids.length === 1 ? '' : 's'}</div>`;
              // Link to the cook's profile only when we have a real author id.
              return c.author_id
                ? `<a class="cook" href="#/profile?id=${c.author_id}">${inner}</a>`
                : `<div class="cook">${inner}</div>`;
            })
            .join('')}
        </div>
      </section>
    </main>
    ${Footer()}
  `;
}

// Render the right-hand hero column. Three cases:
//   occasion → the admin-uploaded image (optionally a link)
//   dish     → the auto-picked top dish of the week, as a labelled card
//   null     → nothing (caller also drops the hero-split class → centered hero)
function heroBanner(banner) {
  if (!banner) return '';

  if (banner.kind === 'occasion') {
    const img = `<img class="hero-banner-img" src="${esc(banner.image_url)}" alt="${esc(banner.alt)}" />`;
    const inner = banner.link_url
      ? `<a class="hero-banner-link" href="${esc(banner.link_url)}">${img}</a>`
      : img;
    return `<div class="hero-banner hero-banner-occasion">${inner}</div>`;
  }

  if (banner.kind === 'dish') {
    const r = banner.recipe;
    const key = r.slug || r.short_code || r.id;
    const media = r.image_url
      ? `<img class="hero-banner-img" src="${esc(r.image_url)}" alt="${esc(r.title)}" />`
      : `<div class="hero-banner-placeholder"><div class="platter"></div></div>`;
    return `
      <a class="hero-banner hero-banner-dish" href="#/recipe?id=${esc(key)}">
        <span class="hero-banner-tag">Dish of the week</span>
        ${media}
        <span class="hero-banner-caption">
          <span class="hero-banner-title">${esc(r.title)}</span>
          <span class="hero-banner-by">by ${esc(r.author || 'A Thaali cook')}</span>
        </span>
      </a>`;
  }

  return '';
}

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
