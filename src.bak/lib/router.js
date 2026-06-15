// Minimal hash router — no framework, vanilla JS.
// Routes map a path to a render function that returns an HTML string.

const routes = {};
let notFound = () => '<div class="wrap"><p>Not found.</p></div>';

export function route(path, render) { routes[path] = render; }
export function setNotFound(fn) { notFound = fn; }

export function navigate(path) {
  if (location.hash !== '#' + path) location.hash = path;
  else render();
}

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { path, params };
}

let mountFns = [];
export function onMount(fn) { mountFns.push(fn); }

function render() {
  const { path, params } = parse();
  const app = document.getElementById('app');
  mountFns = [];
  const view = routes[path] || notFound;
  app.innerHTML = view(params);
  window.scrollTo(0, 0);
  mountFns.forEach((fn) => fn());
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
