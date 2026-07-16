import { Header, Footer } from '../components/layout.js';
import { recipes, findRecipe, loadRecipes } from '../lib/mockData.js';
import { isSignedIn, currentUser } from '../lib/auth.js';
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
import { reportRecipe, reportComment, REPORT_REASONS } from '../lib/report.js';

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Light formatting for cook-authored prose (description + step instructions).
// SAFETY: escapes ALL html first (via esc), THEN converts a tiny markdown
// subset on the already-escaped string — so no raw user html ever survives.
// Supported: **bold**, *italic*, and line breaks. Nothing else.
function fmt(v) {
  return esc(v)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\r?\n/g, '<br>');
}

// Signup gate shown to logged-out visitors below a recipe. States the promise
// (free, no ads, no paywall, ever) and why an email is still needed — clearly,
// in Thaali's voice. The recipe itself stays fully readable above this.
function signupGate() {
  return `
    <section class="signup-gate">
      <h3 class="signup-gate-title">Cook along with the community</h3>
      <p class="signup-gate-lede">
        You just read the whole recipe — no paywall, no sign-in wall. That's how
        Thaali works, and always will: <strong>free, ad-free, no paywall, ever.</strong>
      </p>
      <p class="signup-gate-why">
        We ask for an email for one reason — so you have an account. It's what lets
        you like and comment, follow the cooks you love, and save and share your own
        recipes. No ads, we never sell your data, and we'll only email you about your
        account. That's the whole deal.
      </p>
      <div class="signup-gate-actions">
        <a class="btn btn-primary" href="/auth">Join free</a>
        <a class="btn btn-ghost" href="/auth">Sign in</a>
      </div>
    </section>`;
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
  // Recipe pages are PUBLIC (readable by anyone, incl. search engines). Logged-
  // out visitors see the full recipe with a friendly signup gate on the social
  // features (like/comment/report). Signed-in users get the full experience.
  const signedIn = isSignedIn();

  // Resolve from slug, short_code, or raw uuid (back-compat with old links).
  const r = findRecipe(params.slug || params.id);
  if (!r) {
    navigate(signedIn ? '/home' : '/');
    return '';
  }

  // Ingredients render in one of two shapes:
  //   Simple  → a single { raw } entry, shown as a free-text block.
  //   Detailed → [{ quantity, unit, item }], shown as a structured list.
  const isSimpleIng =
    r.ingredients?.length === 1 && typeof r.ingredients[0]?.raw === 'string';
  const ingredients = isSimpleIng
    ? `<li class="ing-raw">${fmt(r.ingredients[0].raw)}</li>`
    : r.ingredients?.length
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
          return `<li>${fmt(s.instruction)}${timer}</li>`;
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
  const shareUrl = `${location.origin}/recipe/${shareKey}`;

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

    // --- delete recipe (in-app confirmation modal, not native confirm) ---
    const deleteModal = document.querySelector('#delete-modal');
    const openDelete = document.querySelector('[data-action="delete-recipe"]');
    const cancelDelete = document.querySelector('[data-action="delete-cancel"]');
    const confirmDelete = document.querySelector('[data-action="delete-confirm"]');
    const deleteStatus = document.querySelector('#delete-status');

    function showDeleteModal() {
      if (!deleteModal) return;
      deleteModal.hidden = false;
      confirmDelete?.focus();
      document.addEventListener('keydown', onDeleteKey);
    }
    function hideDeleteModal() {
      if (!deleteModal) return;
      deleteModal.hidden = true;
      document.removeEventListener('keydown', onDeleteKey);
      openDelete?.focus();
    }
    function onDeleteKey(ev) {
      if (ev.key === 'Escape') hideDeleteModal();
    }

    openDelete?.addEventListener('click', showDeleteModal);
    cancelDelete?.addEventListener('click', hideDeleteModal);
    // Click the dark backdrop (outside the card) to dismiss.
    deleteModal?.addEventListener('click', (ev) => {
      if (ev.target === deleteModal) hideDeleteModal();
    });

    confirmDelete?.addEventListener('click', async () => {
      confirmDelete.disabled = true;
      if (cancelDelete) cancelDelete.disabled = true;
      if (deleteStatus) deleteStatus.textContent = 'Deleting…';
      try {
        await deleteRecipe(r.id);
        await loadRecipes();
        navigate('/home');
      } catch (err) {
        confirmDelete.disabled = false;
        if (cancelDelete) cancelDelete.disabled = false;
        if (deleteStatus) {
          deleteStatus.textContent = 'Delete failed: ' + err.message;
          deleteStatus.className = 'modal-status import-msg warn';
        }
      }
    });

    // Social features (like / report / comment posting) require sign-in. For
    // logged-out visitors these controls are replaced by a signup gate in the
    // markup, so there's nothing to wire — bail out of the interactive setup.
    if (!signedIn) return;

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

    // --- report ---
    const reportBtn = document.querySelector('[data-action="report"]');
    const reportForm = document.querySelector('#report-form');
    if (reportBtn && reportForm) {
      let reported = false; // once filed, don't allow re-open in this view
      reportBtn.addEventListener('click', () => {
        if (reported) return;
        if (!reportForm.hidden) {
          reportForm.hidden = true;
          return;
        }
        reportForm.hidden = false;
        reportForm.innerHTML = `
          <div class="field">
            <label for="report-reason">Why are you reporting this recipe?</label>
            <select id="report-reason">
              ${REPORT_REASONS.map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="report-note">Add a note <span class="muted">(optional)</span></label>
            <textarea id="report-note" rows="2" maxlength="1000" placeholder="Anything that helps us review"></textarea>
          </div>
          <div class="report-actions">
            <button class="btn btn-ghost" data-action="report-cancel">Cancel</button>
            <button class="btn btn-primary" data-action="report-submit">Submit report</button>
            <span class="import-msg" id="report-status"></span>
          </div>
        `;

        const status = reportForm.querySelector('#report-status');
        reportForm.querySelector('[data-action="report-cancel"]')?.addEventListener('click', () => {
          reportForm.hidden = true;
        });
        reportForm.querySelector('[data-action="report-submit"]')?.addEventListener('click', async (e) => {
          const reason = reportForm.querySelector('#report-reason').value;
          const note = reportForm.querySelector('#report-note').value.trim();
          e.target.disabled = true;
          status.textContent = 'Submitting…';
          status.className = 'import-msg';
          try {
            await reportRecipe(r.id, reason, note);
            reported = true;
            reportForm.innerHTML = '<p class="import-msg ok">Thanks — your report has been sent for review.</p>';
            // Soften the button so it reads as done.
            reportBtn.querySelector('.report-label').textContent = 'Reported';
            reportBtn.disabled = true;
          } catch (err) {
            e.target.disabled = false;
            status.textContent = err.message;
            status.className = 'import-msg warn';
          }
        });
      });
    }

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
      // Report link: shown to signed-in cooks who didn't write the comment.
      const me = currentUser();
      const canReport = me && c.user_id !== me.id;
      const report = canReport
        ? `<button class="c-report" data-report-comment="${c.id}" aria-label="report comment" title="Report comment">⚑</button>`
        : '';
      return `
        <li class="comment" data-cid="${c.id}">
          <a class="c-avatar" href="/profile/${c.user_id}">${av}</a>
          <div class="c-body">
            <div class="c-head">
              <a class="c-name" href="/profile/${c.user_id}">${esc(c.author_name)}</a>
              <span class="c-time muted">${timeAgo(c.created_at)}</span>
              ${del}
              ${report}
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

      // Report a comment: pick a reason, optionally add a note, file it.
      list.querySelectorAll('[data-report-comment]').forEach((btn) => {
        btn.onclick = async () => {
          if (btn.dataset.done === '1') return;
          const reasons = REPORT_REASONS.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
          const pick = prompt(`Report this comment — choose a reason:\n${reasons}\n\nEnter 1-${REPORT_REASONS.length}:`);
          if (!pick) return;
          const idx = parseInt(pick, 10) - 1;
          const reason = REPORT_REASONS[idx]?.value;
          if (!reason) {
            alert('Please enter a number from the list.');
            return;
          }
          const note = prompt('Add a note (optional):') || '';
          btn.disabled = true;
          try {
            await reportComment(btn.dataset.reportComment, reason, note);
            btn.dataset.done = '1';
            btn.textContent = '✓';
            btn.title = 'Reported';
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
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
      <p class="lede" style="font-size:1.1rem;">${fmt(r.description || '')}</p>
      ${
        metaBits.length
          ? `<div class="card-meta" style="margin:16px 0;">${metaBits.map((m) => `<span>${esc(m)}</span>`).join('')}</div>`
          : ''
      }
      ${
        Array.isArray(r.diet_tags) && r.diet_tags.length
          ? `<div class="diet-tag-row">${r.diet_tags.map((t) => `<span class="diet-tag">${esc(t)}</span>`).join('')}</div>`
          : ''
      }

      <div class="social-bar">
        ${
          signedIn
            ? `<button class="social-btn" data-action="like" aria-pressed="false">
                 <span class="like-heart">♡</span> <span id="like-count">0</span>
               </button>`
            : ''
        }
        <button class="social-btn" data-action="share">
          <span>↗</span> <span class="share-label">Share</span>
        </button>
        ${
          signedIn && !editable
            ? `<button class="social-btn report-btn" data-action="report" title="Report this recipe">
                 <span>⚑</span> <span class="report-label">Report</span>
               </button>`
            : ''
        }
      </div>
      ${signedIn && !editable ? '<div class="report-form" id="report-form" hidden></div>' : ''}

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
          ? `<a class="byline-link" href="/profile/${r.author_id}">${esc(r.author || 'A Thaali cook')}</a>`
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
               <a class="btn btn-ghost" href="/submit?edit=${r.slug || r.short_code || r.id}">Edit recipe</a>
               <button class="btn btn-ghost" data-action="delete-recipe">Delete recipe</button>
             </div>`
          : ''
      }

      ${
        signedIn
          ? `<section class="comments-section">
        <h3>Comments</h3>
        <div class="comment-compose">
          <textarea id="comment-input" rows="2" placeholder="Add a comment…" maxlength="2000"></textarea>
          <div class="comment-compose-row">
            <button class="btn btn-primary" data-action="post-comment">Post</button>
            <span class="import-msg" id="comment-status"></span>
          </div>
        </div>
        <ul class="comment-list" id="comment-list"><li class="muted">Loading comments…</li></ul>
      </section>`
          : signupGate()
      }

      <div class="lightbox" id="lightbox" hidden>
        <button class="lightbox-close" data-action="close-lightbox" aria-label="close">×</button>
        <img class="lightbox-img" id="lightbox-img" src="" alt="" />
      </div>
      ${
        editable
          ? `<div class="modal-overlay" id="delete-modal" hidden role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <div class="modal-card">
          <h3 id="delete-modal-title">Delete this recipe?</h3>
          <p class="modal-body">“${esc(r.title)}” will be permanently removed. This can’t be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-action="delete-cancel">Cancel</button>
            <button class="btn btn-danger" data-action="delete-confirm">Delete recipe</button>
          </div>
          <p class="modal-status import-msg" id="delete-status"></p>
        </div>
      </div>`
          : ''
      }
    </main>
    ${Footer()}
  `;
}
