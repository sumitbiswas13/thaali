import { isSignedIn, currentUser, isAdmin } from '../lib/auth.js';
import { cachedAvatarUrl } from '../lib/profileCache.js';

function headerAvatar() {
  const u = currentUser();
  if (!u) return '';
  // Prefer the cook's uploaded avatar; fall back to the Google photo, then an initial.
  const url = cachedAvatarUrl() || u.user_metadata?.avatar_url || u.user_metadata?.picture || null;
  const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email || '?';
  const initial = name.trim().charAt(0).toUpperCase();
  const inner = url
    ? `<img src="${url}" alt="" class="nav-avatar-img" referrerpolicy="no-referrer" />`
    : `<span class="nav-avatar-fallback">${initial}</span>`;
  // Avatar is now a dropdown trigger; menu holds Profile + Sign out.
  return `
    <div class="nav-avatar-menu">
      <button class="nav-avatar" data-action="avatar-toggle" aria-haspopup="true" aria-expanded="false" title="Account">
        ${inner}
      </button>
      <div class="nav-dropdown" data-avatar-dropdown hidden>
        <a class="nav-dropdown-item" href="/profile">Your profile</a>
        <a class="nav-dropdown-item" href="/account">Your account</a>
        ${isAdmin() ? `<a class="nav-dropdown-item" href="/admin">Moderation</a>` : ''}
        <button class="nav-dropdown-item" data-action="signout">Sign out</button>
      </div>
    </div>`;
}

// Centered search box. Only shown when signed in (everything is members-only).
// Submitting routes to /home?q=<term>; Home.js reads q as a text filter.
// Wired by wireHeaderSearch(), called once from main.js after each render.
function headerSearch() {
  if (!isSignedIn()) return '';
  return `
    <div class="header-search">
      <input
        type="search"
        id="header-search-input"
        placeholder="Search recipes…"
        aria-label="Search recipes"
        autocomplete="off"
      />
    </div>`;
}

export function Header() {
  const signedIn = isSignedIn();
  return `
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">
          <img class="brand-icon" src="/logo/thaali-logo-256.png" alt="Thaali" width="64" height="64" />
          <span class="brand-text">
            <span class="brand-mark">Thaali<span class="dot">.</span></span>
            <span class="brand-slogan">Cook. Share. Serve.</span>
          </span>
        </a>
        ${headerSearch()}
        <nav class="nav-actions">
          ${
            signedIn
              ? `<a class="btn btn-ghost" href="/home">Browse</a>
                 <a class="btn btn-ghost" href="/news">News</a>
                 <a class="btn btn-ghost" href="/games">Games</a>
                 <a class="btn btn-ghost" href="/submit">Add a recipe</a>
                 ${headerAvatar()}`
              : `<a class="btn btn-ghost" href="/auth">Sign in</a>
                 <a class="btn btn-primary" href="/auth">Join free</a>`
          }
        </nav>
      </div>
    </header>
  `;
}

// Attach the search behaviour via event delegation in main.js (a single
// global listener), so it works across every view without per-render wiring.
// On render, prefill the box from the current ?q= if present.
export function prefillHeaderSearch() {
  const input = document.getElementById('header-search-input');
  if (!input) return;
  const q = new URLSearchParams(location.search).get('q');
  input.value = q || '';
}

export function Footer() {
  return `
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-brand">
          <div class="footer-mark">Thaali<span class="dot">.</span></div>
          <p class="footer-tagline">By cooks, for everyone.<br>No ads, no paywall, ever.</p>
        </div>
        <div class="footer-right">
          <nav class="footer-links" aria-label="Footer">
            <a href="/contact">Contact</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
          <p class="footer-copy">© ${new Date().getFullYear()} · thaali.app</p>
        </div>
      </div>
    </footer>
  `;
}
