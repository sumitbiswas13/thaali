import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { fetchNews } from '../lib/news.js';

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Remove any HTML tags and decode common entities. The Guardian's trailText
// can arrive with <p>…</p> wrappers; we want clean plain text, then esc() it.
function stripHtml(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

function newsCard(item) {
  const title = stripHtml(item.title);
  const summary = stripHtml(item.summary);
  const media = item.image
    ? `<div class="news-media"><img src="${esc(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></div>`
    : `<div class="news-media news-media-empty"><span>🍴</span></div>`;
  const byline = [stripHtml(item.author), timeAgo(item.published)].filter(Boolean).join(' · ');
  return `
    <a class="news-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
      ${media}
      <div class="news-body">
        <span class="news-section">${esc(stripHtml(item.section) || 'Food')}</span>
        <h3 class="news-title">${esc(title)}</h3>
        ${summary ? `<p class="news-summary">${esc(summary)}</p>` : ''}
        <div class="news-foot">
          ${byline ? `<span class="news-byline">${esc(byline)}</span>` : '<span></span>'}
          <span class="news-readmore">Read on The Guardian ↗</span>
        </div>
      </div>
    </a>`;
}

export function News() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  onMount(async () => {
    const list = document.getElementById('news-list');
    try {
      const items = await fetchNews();
      if (!items.length) {
        list.innerHTML = `<p class="muted">No food stories right now — check back soon.</p>`;
        return;
      }
      list.innerHTML = items.map(newsCard).join('');
    } catch {
      list.innerHTML = `<p class="import-msg warn">Couldn't load the news feed right now. Please try again later.</p>`;
    }
  });

  return `
    ${Header()}
    <main class="wrap">
      <div class="section-head">
        <h2>Fresh from the kitchen</h2>
        <span class="muted">Food &amp; cooking stories — a little something to read between recipes.</span>
      </div>
      <div class="news-grid" id="news-list">
        <p class="muted">Loading stories…</p>
      </div>
      <p class="news-credit muted">News via <a href="https://www.theguardian.com/food" target="_blank" rel="noopener noreferrer">The Guardian — Food</a>.</p>
    </main>
    ${Footer()}
  `;
}
