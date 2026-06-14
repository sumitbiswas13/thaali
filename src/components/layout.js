import { isSignedIn } from '../lib/auth.js';

export function Header() {
  const signedIn = isSignedIn();
  return `
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="#/">Thaali<span class="dot">.</span></a>
        <nav class="nav-actions">
          ${
            signedIn
              ? `<a class="btn btn-ghost" href="#/submit">Add a recipe</a>
                 <button class="btn btn-ghost" data-action="signout">Sign out</button>`
              : `<a class="btn btn-ghost" href="#/auth">Sign in</a>
                 <a class="btn btn-primary" href="#/auth">Join free</a>`
          }
        </nav>
      </div>
    </header>
  `;
}

export function Footer() {
  return `
    <footer class="site-footer">
      <div class="wrap">
        <span>Thaali — by cooks, for everyone. No ads, no paywall, ever.</span>
        <span>© ${new Date().getFullYear()} · thaali.app</span>
      </div>
    </footer>
  `;
}
