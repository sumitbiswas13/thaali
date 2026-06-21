import './styles/tokens.css';
import './styles/components.css';

import { route, startRouter, navigate } from './lib/router.js';
import { signOut, initAuth } from './lib/auth.js';
import { loadRecipes } from './lib/mockData.js';
import { prefillHeaderSearch } from './components/layout.js';
import { Landing } from './views/Landing.js';
import { Auth } from './views/Auth.js';
import { Home } from './views/Home.js';
import { Submit } from './views/Submit.js';
import { Recipe } from './views/Recipe.js';
import { Profile } from './views/Profile.js';

// Load fonts (Fraunces display, Inter body, IBM Plex Mono utility).
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
document.head.appendChild(fonts);

// Routes
route('/', Landing);
route('/auth', Auth);
route('/home', Home);
route('/submit', Submit);
route('/recipe', Recipe);
route('/profile', Profile);

// Global sign-out handler (header button exists across views)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="signout"]')) {
    signOut().then(() => navigate('/'));
  }
});

// Global header-search handler — one delegated listener for the whole app.
// Enter in the header search box routes to Browse with ?q=<term>.
document.addEventListener('keydown', (e) => {
  const input = e.target.closest?.('#header-search-input');
  if (!input || e.key !== 'Enter') return;
  const term = input.value.trim();
  location.hash = term ? `/home?q=${encodeURIComponent(term)}` : '/home';
});

// Keep the search box in sync with the URL on every navigation.
window.addEventListener('hashchange', prefillHeaderSearch);

// Boot: establish session + load data BEFORE first render, so the synchronous
// isSignedIn() guards and the recipes array are accurate on the first paint.
(async () => {
  await initAuth();
  await loadRecipes();
  startRouter();
  prefillHeaderSearch();
})();
