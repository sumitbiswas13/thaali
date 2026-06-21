import { isSignedIn } from '../lib/auth.js';

export function Header() {
  const signedIn = isSignedIn();
  return `
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="#/">
          <img class="brand-icon" src="/logo/thaali-logo-256.png" alt="Thaali" width="64" height="64" />
          <span class="brand-text">
            <span class="brand-mark">Thaali<span class="dot">.</span></span>
            <span class="brand-slogan">Cook. Share. Serve.</span>
          </span>
        </a>
        <nav class="nav-actions">
          ${
            signedIn
              ? `<a class="btn btn-ghost" href="#/submit">Add a recipe</a>
                 <a class="btn btn-ghost" href="#/profile">Profile</a>
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
