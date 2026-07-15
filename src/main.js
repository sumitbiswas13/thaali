import './styles/tokens.css';
import './styles/components.css';

import { route, startRouter, navigate } from './lib/router.js';
import { signOut, initAuth, onAuthTransition } from './lib/auth.js';
import { loadRecipes } from './lib/mockData.js';
import { loadBanner } from './lib/banner.js';
import { prefillHeaderSearch } from './components/layout.js';
import { loadOwnProfile, clearCachedProfile } from './lib/profileCache.js';
import { Landing } from './views/Landing.js';
import { Auth } from './views/Auth.js';
import { Home } from './views/Home.js';
import { Submit } from './views/Submit.js';
import { Recipe } from './views/Recipe.js';
import { Profile } from './views/Profile.js';
import { News } from './views/News.js';
import { Contact } from './views/Contact.js';
import { Account } from './views/Account.js';
import { Admin } from './views/Admin.js';
import { Privacy } from './views/Privacy.js';
import { Terms } from './views/Terms.js';
import { Games, Guess } from './views/Games.js';
import { TURNSTILE_SITE_KEY } from './lib/config.js';

// Load fonts (Fraunces display, Inter body, IBM Plex Mono utility).
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
document.head.appendChild(fonts);

// Load the Cloudflare Turnstile script once (explicit render mode — the
// contact form mounts after navigation, so we render the widget ourselves).
// Only loaded when a site key is configured. The exact api.js URL must be used
// (Cloudflare requires it not be proxied/cached).
if (TURNSTILE_SITE_KEY) {
  const ts = document.createElement('script');
  ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  ts.async = true;
  ts.defer = true;
  document.head.appendChild(ts);
}

// Routes
route('/', Landing);
route('/auth', Auth);
route('/home', Home);
route('/submit', Submit);
route('/recipe/:slug', Recipe);
route('/profile', Profile);
route('/profile/:id', Profile);
route('/news', News);
route('/contact', Contact);
route('/account', Account);
route('/admin', Admin);
route('/privacy', Privacy);
route('/terms', Terms);
route('/games', Games);
route('/games/guess', Guess);

// Global sign-out handler (header button exists across views)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="signout"]')) {
    clearCachedProfile();
    signOut().then(() => navigate('/'));
  }
});

// Avatar dropdown: toggle on click, close on outside click or navigation.
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-action="avatar-toggle"]');
  const dropdown = document.querySelector('[data-avatar-dropdown]');
  if (!dropdown) return;
  if (toggle) {
    const open = dropdown.hidden;
    dropdown.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  } else if (!e.target.closest('[data-avatar-dropdown]')) {
    // Clicked anywhere else (including a menu link) — close it.
    dropdown.hidden = true;
    document.querySelector('[data-action="avatar-toggle"]')?.setAttribute('aria-expanded', 'false');
  }
});

// Global header-search handler — one delegated listener for the whole app.
// Enter in the header search box routes to Browse with ?q=<term>.
document.addEventListener('keydown', (e) => {
  const input = e.target.closest?.('#header-search-input');
  if (!input || e.key !== 'Enter') return;
  const term = input.value.trim();
  navigate(term ? `/home?q=${encodeURIComponent(term)}` : '/home');
});

// Keep the search box in sync with the URL on every navigation.
window.addEventListener('popstate', prefillHeaderSearch);

// Keep the profile/avatar cache in sync on every sign-in/sign-out transition,
// not just at boot. On first OAuth sign-in the redirect-back fires an auth
// change AFTER boot's loadOwnProfile() (which ran while signed out), so without
// this the header wouldn't show the cook's uploaded avatar until a reload.
// auth.js awaits this before navigating, so the first post-sign-in paint has it.
onAuthTransition(async (user) => {
  if (user) {
    await loadOwnProfile();
  } else {
    clearCachedProfile();
  }
});

// Boot: establish session + load data BEFORE first render, so the synchronous
// isSignedIn() guards and the recipes array are accurate on the first paint.
(async () => {
  await initAuth();
  await loadRecipes();
  await loadBanner();
  await loadOwnProfile();
  startRouter();
  prefillHeaderSearch();
})();
