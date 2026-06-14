import { isSignedIn } from '../lib/auth.js';

export function Header() {
  const signedIn = isSignedIn();
  return `
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="#/">
          <svg class="brand-icon" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="var(--saffron)"/>
            <circle cx="32" cy="32" r="22" fill="none" stroke="#fff" stroke-width="3" opacity="0.85"/>
            <circle cx="32" cy="32" r="13" fill="none" stroke="#fff" stroke-width="3" opacity="0.6"/>
            <circle cx="32" cy="32" r="5" fill="#fff" opacity="0.9"/>
          </svg>
          <span class="brand-text">
            <span class="brand-mark">Thaali<span class="dot">.</span></span>
            <span class="brand-slogan">Cook. Share. Serve.</span>
          </span>
        </a>
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
