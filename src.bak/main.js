import './styles/tokens.css';
import './styles/components.css';

import { route, startRouter, navigate } from './lib/router.js';
import { signOut, initAuth } from './lib/auth.js';
import { loadRecipes } from './lib/mockData.js';
import { Landing } from './views/Landing.js';
import { Auth } from './views/Auth.js';
import { Home } from './views/Home.js';
import { Submit } from './views/Submit.js';
import { Recipe } from './views/Recipe.js';

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

// Global sign-out handler (header button exists across views)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="signout"]')) {
    signOut().then(() => navigate('/'));
  }
});

// Boot: establish session + load data BEFORE first render, so the synchronous
// isSignedIn() guards and the recipes array are accurate on the first paint.
(async () => {
  await initAuth();
  await loadRecipes();
  startRouter();
})();
