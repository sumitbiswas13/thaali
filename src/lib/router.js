// Minimal path router — no framework, vanilla JS.
// Uses the History API (real URLs like /recipe/palak-paneer-a1b9) instead of
// hash routing, so pages are crawlable/indexable by search engines.
//
// Routes map a path pattern to a render function that returns an HTML string.
// Patterns may contain params, e.g. route('/recipe/:slug', Recipe). The render
// function receives a single params object merging path params and query params:
//   /recipe/dal-tadka-a1b9?ref=news  ->  { slug: 'dal-tadka-a1b9', ref: 'news' }
//
// Internal navigation works two ways:
//   1. navigate('/home')                — programmatic
//   2. <a href="/home">…</a>            — a global click listener intercepts
//      same-origin anchors and routes them without a full page reload.

const routes = [];
let notFound = () => '<div class="wrap"><p>Not found.</p></div>';

// Register a route. `pattern` is a path like '/' or '/recipe/:slug'.
export function route(pattern, render) {
  routes.push({ pattern, render, keys: paramKeys(pattern), rx: patternToRegex(pattern) });
}
export function setNotFound(fn) { notFound = fn; }

function paramKeys(pattern) {
  return (pattern.match(/:([A-Za-z0-9_]+)/g) || []).map((s) => s.slice(1));
}

function patternToRegex(pattern) {
  // Turn :param into a capture group FIRST (while the colon is still a plain
  // ':'), then escape the remaining regex-special chars. Escaping first would
  // leave the colon untouched (':' isn't special) but the param regex looked
  // for an escaped '\:' that never existed — so params never matched.
  const src = pattern
    .replace(/:([A-Za-z0-9_]+)/g, '\x00$1\x00')          // mark params with a placeholder
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')               // escape the rest
    .replace(/\x00([A-Za-z0-9_]+)\x00/g, '([^/]+)');      // params → capture group
  return new RegExp('^' + src + '/?$');
}

// Programmatic navigation. Pushes a new history entry and renders.
export function navigate(path) {
  if (location.pathname + location.search !== path) {
    history.pushState({}, '', path);
  }
  render();
}

// Replace (no new history entry) — used for guard redirects so Back doesn't
// bounce the user through the guarded page.
export function redirect(path) {
  history.replaceState({}, '', path);
  render();
}

function match(pathname) {
  for (const r of routes) {
    const m = pathname.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { render: r.render, params };
    }
  }
  return null;
}

function parse() {
  const pathname = location.pathname || '/';
  const query = Object.fromEntries(new URLSearchParams(location.search || ''));
  const hit = match(pathname);
  if (!hit) return { render: notFound, params: query };
  return { render: hit.render, params: { ...query, ...hit.params } };
}

let mountFns = [];
export function onMount(fn) { mountFns.push(fn); }

function render() {
  const { render: view, params } = parse();
  const app = document.getElementById('app');
  mountFns = [];
  app.innerHTML = view(params);
  window.scrollTo(0, 0);
  mountFns.forEach((fn) => fn());
}

// Re-render on Back/Forward.
function onPopState() { render(); }

// Intercept clicks on internal links so <a href="/…"> routes client-side.
// Skips: external links, new-tab/modified clicks, download/target attrs,
// hash-only anchors, and links opting out via data-native.
function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if (!a) return;
  if (a.hasAttribute('data-native') || a.target === '_blank' || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:')) return;
  // Same-origin absolute-path links only.
  const url = new URL(a.href, location.origin);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
}

export function startRouter() {
  window.addEventListener('popstate', onPopState);
  document.addEventListener('click', onLinkClick);
  render();
}
