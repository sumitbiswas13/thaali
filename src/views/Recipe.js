import { Header, Footer } from '../components/layout.js';
import { recipes, findRecipe, loadRecipes } from '../lib/mockData.js';
import { isSignedIn } from '../lib/auth.js';
import { canEdit, deleteRecipe } from '../lib/recipes.js';
import { navigate, onMount } from '../lib/router.js';
import {
  fetchLikeState,
  toggleLike,
  fetchComments,
  addComment,
  deleteComment,
  canDeleteComment,
} from '../lib/social.js';

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function Recipe(params) {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  // Resolve from slug, short_code, or raw uuid (back-compat with old links).
  const r = findRecipe(params.id);
  if (!r) {
    navigate('/home');
    return '';
  }

  const ingredients = r.ingredients?.length
    ? r.ingredients
        .map(
          (i) =>
            `<li><span class="amt">${esc([i.quantity, i.unit].filter(Boolean).join(' '))}</span><span>${esc(i.item)}</span></li>`
        )
        .join('')
    : '<li><span>No ingredients listed yet.</span></li>';

  const steps = r.steps?.length
    ? r.steps
        .map((s) => {
          const mins = s.timer_seconds ? Math.round(s.timer_seconds / 60) : 0;
          const timer = mins > 0 ? `<span class="step-timer-badge">⏱ ${mins} min</span>` : '';
          return `<li>${esc(s.instruction)}${timer}</li>`;
        })
        .join('')
    : '<li>No method listed yet.</li>';

  const editable = canEdit(r);
  const eyebrow = [r.cuisine, r.course].filter(Boolean).join(' · ');
  const total = (r.prep_time || 0) + (r.cook_time || 0);
  const metaBits = [
    r.prep_time ? `Prep ${r.prep_time}m` : '',
    r.cook_time ? `Cook ${r.cook_time}m` : '',
    total ? `Total ${total}m` : '',
    r.servings ? `Serves ${r.servings}` : '',
    r.difficulty || '',
  ].filter(Boolean);

  // Gallery: prefer the images[] array; fall back to the single image_url.
  const gallery =
    Array.isArray(r.images) && r.images.length ? r.images : r.image_url ? [r.image_url] : [];
  const cover = r.image_url || gallery[0] || null;

  // Pretty short share URL — prefer slug, then short_code, then uuid.
  const shareKey = r.slug || r.short_code || r.id;
  const shareUrl = `${location.origin}/#/recipe?id=${shareKey}`;

  onMount(() => {
    // --- lightbox: click hero or any thumbnail to view full image ---
    const lightbox = document.querySelector('#lightbox');
    const lightboxImg = document.querySelector('#lightbox-img');
    function openLightbox(src) {
      if (!src) return;
      lightboxImg.src = src;
      lightbox.hidden = false;
    }
    function closeLightbox() {
      lightbox.hidden = true;
      lightboxImg.src = '';
    }
    document.querySelectorAll('[data-img]').forEach((el) => {
      el.addEventListener('click', () => openLightbox(el.dataset.img));
    });
    document.querySelector('[data-action="close-lightbox"]')?.addEventListener('click', closeLightbox);
    lightbox?.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox(); // click backdrop to dismiss
    });

    // --- delete recipe ---
    document.querySelector('[data-action="delete-recipe"]')?.addEventListener('click', async (e) => {
      if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return;
      e.target.disabled = true;
      try {
        await deleteRecipe(r.id);
        await loadRecipes();
        navigate('/home');
      } catch (err) {
        e.target.disabled = false;
        alert('Delete failed: ' + err.message);
      }
    });

    // --- like ---
    const likeBtn = document.querySelector('[data-action="like"]');
    const likeCount = document.querySelector('#like-count');
    let likeState = { count: 0, liked: false };
    let likeBusy = false;

    function paintLike() {
      if (!likeBtn) return;
      likeBtn.setAttribute('aria-pressed', String(likeState.liked));
      likeBtn.classList.toggle('liked', likeState.liked);
      likeBtn.querySelector('.like-heart').textContent = likeState.liked ? '♥' : '♡';
      likeCount.textContent = likeState.count;
    }

    fetchLikeState(r.id)
      .then((s) => {
        likeState = s;
        paintLike();
      })
      .catch(() => {});

    likeBtn?.addEventListener('click', async () => {
      if (likeBusy) return;
      likeBusy = true;
      const prev = { ...likeState };
      likeState = {
        liked: !likeState.liked,
        count: likeState.count + (likeState.liked ? -1 : 1),
      };
      paintLike();
      try {
        likeState = await toggleLike(r.id, prev.liked);
      } catch (err) {
        likeState = prev;
      } finally {
        paintLike();
        likeBusy = false;
      }
    });

    // --- share ---
    const shareBtn = document.querySelector('[data-action="share"]');
    shareBtn?.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: r.title, url: shareUrl });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          const label = shareBtn.querySelector('.share-label');
          const orig = label.textContent;
          label.textContent = 'Link copied!';
          setTimeout(() => (label.textContent = orig), 1600);
        }
      } catch {
        /* dismissed */
      }
    });

    // --- comments ---
    const list = document.querySelector('#comment-list');
    const input = document.querySelector('#comment-input');
    const postBtn = document.querySelector('[data-action="post-comment"]');
    const cStatus = document.querySelector('#comment-status');

    function commentRow(c) {
      const initial = (c.author_name || '?').trim().charAt(0).toUpperCase();
      const av = c.author_avatar
        ? `<img class="c-avatar-img" src="${esc(c.author_avatar)}" alt="" referrerpolicy="no-referrer" />`
        : `<span class="c-avatar-fallback">${initial}</span>`;
      const del = canDeleteComment(c, r)
        ? `<button class="c-delete" data-del="${c.id}" aria-label="delete comment">×</button>`
        : '';
      return `
        <li class="comment" data-cid="${c.id}">
          <a class="c-avatar" href="#/profile?id=${c.user_id}">${av}</a>
          <div class="c-body">
            <div class="c-head">
              <a class="c-name" href="#/profile?id=${c.user_id}">${esc(c.author_name)}</a>
              <span class="c-time muted">${timeAgo(c.created_at)}</span>
              ${del}
            </div>
            <p class="c-text">${esc(c.body)}</p>
          </div>
        </li>`;
    }

    function bindDeletes() {
      list.querySelectorAll('[data-del]').forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm('Delete this comment?')) return;
          try {
            await deleteComment(btn.dataset.del);
            btn.closest('.comment').remove();
            if (!list.children.length) list.innerHTML = '<li class="muted">No comments yet. Be the first.</li>';
          } catch (err) {
            alert('Delete failed: ' + err.message);
          }
        };
      });
    }

    function renderComments(items) {
      list.innerHTML = items.length
        ? items.map(commentRow).join('')
        : '<li class="muted">No comments yet. Be the first.</li>';
      bindDeletes();
    }

    fetchComments(r.id)
      .then(renderComments)
      .catch(() => {
        list.innerHTML = '<li class="muted">Could not load comments.</li>';
      });

    postBtn?.addEventListener('click', async () => {
      const body = input.value.trim();
      if (!body) {
        input.focus();
        return;
      }
      postBtn.disabled = true;
      cStatus.textContent = 'Posting…';
      try {
        await addComment(r.id, body);
        input.value = '';
        cStatus.textContent = '';
        renderComments(await fetchComments(r.id));
      } catch (err) {
        cStatus.textContent = err.message;
      } finally {
        postBtn.disabled = false;
      }
    });
  });

  return `
    ${Header()}
    <main class="wrap recipe-detail">
      <div class="hero-img">${
        cover
          ? `<img class="hero-photo" src="${esc(cover)}" alt="${esc(r.title)}" data-img="${esc(cover)}" />`
          : '<div class="platter"></div>'
      }</div>
      ${
        gallery.length > 1
          ? `<div class="gallery-strip">${gallery
              .map(
                (url) =>
                  `<button class="gstrip-thumb" data-img="${esc(url)}"><img src="${esc(url)}" alt="" /></button>`
              )
              .join('')}</div>`
          : ''
      }
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
      <h1>${esc(r.title)}</h1>
      <p class="lede" style="font-size:1.1rem;">${esc(r.description || '')}</p>
      ${
        metaBits.length
          ? `<div class="card-meta" style="margin:16px 0;">${metaBits.map((m) => `<span>${esc(m)}</span>`).join('')}</div>`
          : ''
      }

      <div class="social-bar">
        <button class="social-btn" data-action="like" aria-pressed="false">
          <span class="like-heart">♡</span> <span id="like-count">0</span>
        </button>
        <button class="social-btn" data-action="share">
          <span>↗</span> <span class="share-label">Share</span>
        </button>
      </div>

      <div class="recipe-cols">
        <div>
          <h3 style="margin-bottom:12px;">Ingredients</h3>
          <ul class="ing-list">${ingredients}</ul>
        </div>
        <div>
          <h3 style="margin-bottom:12px;">Method</h3>
          <ul class="method-list">${steps}</ul>
        </div>
      </div>

      <p class="byline" style="margin-top:32px;">Recipe by ${
        r.author_id
          ? `<a class="byline-link" href="#/profile?id=${r.author_id}">${esc(r.author || 'A Thaali cook')}</a>`
          : esc(r.author || 'A Thaali cook')
      }</p>
      ${
        r.source_url
          ? `<p class="source-link"><a href="${esc(r.source_url)}" target="_blank" rel="noopener noreferrer">View original recipe ↗</a></p>`
          : ''
      }
      ${
        editable
          ? `<div style="margin-top:16px;display:flex;gap:12px;">
               <a class="btn btn-ghost" href="#/submit?edit=${r.slug || r.short_code || r.id}">Edit recipe</a>
               <button class="btn btn-ghost" data-action="delete-recipe">Delete recipe</button>
             </div>`
          : ''
      }

      <section class="comments-section">
        <h3>Comments</h3>
        <div class="comment-compose">
          <textarea id="comment-input" rows="2" placeholder="Add a comment…" maxlength="2000"></textarea>
          <div class="comment-compose-row">
            <button class="btn btn-primary" data-action="post-comment">Post</button>
            <span class="import-msg" id="comment-status"></span>
          </div>
        </div>
        <ul class="comment-list" id="comment-list"><li class="muted">Loading comments…</li></ul>
      </section>

      <div class="lightbox" id="lightbox" hidden>
        <button class="lightbox-close" data-action="close-lightbox" aria-label="close">×</button>
        <img class="lightbox-img" id="lightbox-img" src="" alt="" />
      </div>
    </main>
    ${Footer()}
  `;
}
