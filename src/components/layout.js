import { isSignedIn, currentUser } from '../lib/auth.js';

function headerAvatar() {
  const u = currentUser();
  if (!u) return '';
  const url = u.user_metadata?.avatar_url || u.user_metadata?.picture || null;
  const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email || '?';
  const initial = name.trim().charAt(0).toUpperCase();
  const inner = url
    ? `<img src="${url}" alt="" class="nav-avatar-img" referrerpolicy="no-referrer" />`
    : `<span class="nav-avatar-fallback">${initial}</span>`;
  return `<a class="nav-avatar" href="#/profile" title="Your profile">${inner}</a>`;
}

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
              ? `<a class="btn btn-ghost" href="#/home">Browse</a>
                 <a class="btn btn-ghost" href="#/submit">Add a recipe</a>
                 <button class="btn btn-ghost" data-action="signout">Sign out</button>
                 ${headerAvatar()}`
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
