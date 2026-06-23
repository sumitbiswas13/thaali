import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn, isAdmin } from '../lib/auth.js';
import {
  fetchReports,
  setReportStatus,
  deleteReportedComment,
  fetchDeletionRequests,
  actionDeletion,
} from '../lib/admin.js';

// Route: #/admin → moderation queue (reports + deletion requests). Admin-only;
// non-admins are bounced to home. The destructive deletion action re-checks
// admin server-side, so this guard is convenience, not the security boundary.

const GRACE_HOURS = 48;
const REASON_LABEL = {
  spam: 'Spam or junk',
  inappropriate: 'Inappropriate',
  copyright: 'Copyright',
  other: 'Other',
};

export function Admin() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }
  if (!isAdmin()) {
    navigate('/home');
    return '';
  }

  // View state lives in the closure across re-renders.
  const state = { reportStatus: 'open', deletionStatus: 'pending' };

  onMount(() => {
    loadReports(state);
    loadDeletions(state);

    // Delegated handlers for both panels.
    document.getElementById('admin-body')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;

      // Report status filter tabs
      if (act === 'rfilter') {
        state.reportStatus = btn.dataset.val;
        loadReports(state);
        return;
      }
      // Deletion status filter tabs
      if (act === 'dfilter') {
        state.deletionStatus = btn.dataset.val;
        loadDeletions(state);
        return;
      }
      // Report: mark reviewed / dismissed
      if (act === 'review' || act === 'dismiss') {
        btn.disabled = true;
        try {
          await setReportStatus(btn.dataset.id, act === 'review' ? 'reviewed' : 'dismissed');
          loadReports(state);
        } catch (err) {
          flash(btn, err.message);
          btn.disabled = false;
        }
        return;
      }
      // Report: delete the reported comment
      if (act === 'del-comment') {
        if (!confirm('Delete this comment? This cannot be undone.')) return;
        btn.disabled = true;
        try {
          await deleteReportedComment(btn.dataset.cid);
          await setReportStatus(btn.dataset.id, 'reviewed');
          loadReports(state);
        } catch (err) {
          flash(btn, err.message);
          btn.disabled = false;
        }
        return;
      }
      // Deletion: action it (with explicit confirm of the recipe choice)
      if (act === 'action-del') {
        const name = btn.dataset.name || 'this cook';
        const wipe = btn.dataset.wipe === 'true';
        const msg = wipe
          ? `Delete ${name}'s account AND all their recipes? This is irreversible.`
          : `Delete ${name}'s account? Their recipes are kept and reattributed to "A Thaali cook". This is irreversible.`;
        if (!confirm(msg)) return;
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        try {
          await actionDeletion(btn.dataset.uid, wipe);
          loadDeletions(state);
        } catch (err) {
          flash(btn, err.message);
          btn.disabled = false;
          btn.textContent = 'Action deletion';
        }
        return;
      }
    });
  });

  return `
    ${Header()}
    <main class="wrap">
      <section class="account-head">
        <h2>Moderation</h2>
        <p class="muted">Review reports and account-deletion requests.</p>
      </section>
      <div id="admin-body">
        <section class="admin-panel">
          <h3>Reports</h3>
          ${filterTabs('rfilter', state.reportStatus, [
            ['open', 'Open'],
            ['reviewed', 'Reviewed'],
            ['dismissed', 'Dismissed'],
            ['all', 'All'],
          ])}
          <div id="reports-list"><p class="muted">Loading…</p></div>
        </section>

        <section class="admin-panel">
          <h3>Account-deletion requests</h3>
          ${filterTabs('dfilter', state.deletionStatus, [
            ['pending', 'Pending'],
            ['completed', 'Completed'],
            ['cancelled', 'Cancelled'],
            ['all', 'All'],
          ])}
          <div id="deletions-list"><p class="muted">Loading…</p></div>
        </section>
      </div>
    </main>
    ${Footer()}
  `;
}

// --- loaders ---------------------------------------------------------------

async function loadReports(state) {
  const list = document.getElementById('reports-list');
  if (!list) return;
  // Reflect the active tab visually.
  syncTabs('rfilter', state.reportStatus);
  try {
    const rows = await fetchReports(state.reportStatus);
    list.innerHTML = rows.length
      ? rows.map(reportCard).join('')
      : `<p class="muted">No ${state.reportStatus === 'all' ? '' : state.reportStatus + ' '}reports.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="import-msg warn">Could not load reports: ${esc(err.message)}</p>`;
  }
}

async function loadDeletions(state) {
  const list = document.getElementById('deletions-list');
  if (!list) return;
  syncTabs('dfilter', state.deletionStatus);
  try {
    const rows = await fetchDeletionRequests(state.deletionStatus);
    list.innerHTML = rows.length
      ? rows.map(deletionCard).join('')
      : `<p class="muted">No ${state.deletionStatus === 'all' ? '' : state.deletionStatus + ' '}requests.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="import-msg warn">Could not load requests: ${esc(err.message)}</p>`;
  }
}

// --- card renderers --------------------------------------------------------

function reportCard(r) {
  const when = new Date(r.created_at).toLocaleString();
  const reason = REASON_LABEL[r.reason] || r.reason;
  const statusBadge = `<span class="admin-badge admin-${r.status}">${r.status}</span>`;

  const target =
    r.kind === 'recipe'
      ? `<div class="admin-target">
           <span class="admin-kind">Recipe</span>
           <a href="#/recipe?id=${esc(r.recipe_key)}">${esc(r.recipe_title)}</a>
         </div>`
      : `<div class="admin-target">
           <span class="admin-kind">Comment</span>
           <blockquote class="admin-quote">${esc(r.comment_body)}</blockquote>
           ${r.recipe_key ? `<a href="#/recipe?id=${esc(r.recipe_key)}">View in context →</a>` : ''}
         </div>`;

  const open = r.status === 'open';
  const commentDelete =
    r.kind === 'comment' && open
      ? `<button class="btn btn-ghost btn-sm" data-act="del-comment" data-id="${r.id}" data-cid="${esc(r.comment_id)}">Delete comment</button>`
      : '';
  const actions = open
    ? `<div class="admin-actions">
         ${commentDelete}
         <button class="btn btn-ghost btn-sm" data-act="review" data-id="${r.id}">Mark reviewed</button>
         <button class="btn btn-ghost btn-sm" data-act="dismiss" data-id="${r.id}">Dismiss</button>
       </div>`
    : '';

  return `
    <article class="admin-card">
      <div class="admin-card-head">
        <span class="admin-reason">${esc(reason)}</span>
        ${statusBadge}
      </div>
      ${target}
      ${r.note ? `<p class="admin-note">“${esc(r.note)}”</p>` : ''}
      <p class="admin-meta">Reported by ${esc(r.reporter_name)} · ${esc(when)}</p>
      ${actions}
    </article>`;
}

function deletionCard(d) {
  const requested = new Date(d.requested_at);
  const eligible = new Date(requested.getTime() + GRACE_HOURS * 3600 * 1000);
  const now = Date.now();
  const graceOver = now >= eligible.getTime();
  const statusBadge = `<span class="admin-badge admin-${d.status}">${d.status}</span>`;
  const wipe = d.delete_recipes === true;

  const action =
    d.status === 'pending'
      ? `<div class="admin-actions">
           ${
             graceOver
               ? ''
               : `<span class="import-msg warn">Grace window until ${esc(eligible.toLocaleString())}</span>`
           }
           <button class="btn btn-primary btn-sm" data-act="action-del"
             data-uid="${esc(d.user_id)}" data-wipe="${wipe}" data-name="${esc(d.display_name || 'this cook')}">
             Action deletion
           </button>
         </div>`
      : '';

  return `
    <article class="admin-card">
      <div class="admin-card-head">
        <span class="admin-reason">${esc(d.display_name || 'Unnamed cook')}</span>
        ${statusBadge}
      </div>
      <p class="admin-meta">${esc(d.email || '(no email)')}</p>
      <p class="admin-meta">
        Recipes: <strong>${wipe ? 'delete too' : 'keep & reattribute'}</strong> ·
        Requested ${esc(requested.toLocaleString())}
      </p>
      <p class="admin-meta admin-uid">${esc(d.user_id)}</p>
      ${action}
    </article>`;
}

// --- tiny helpers ----------------------------------------------------------

function filterTabs(act, active, opts) {
  return `<div class="admin-tabs">
    ${opts
      .map(
        ([val, label]) =>
          `<button class="admin-tab" data-act="${act}" data-val="${val}" aria-pressed="${val === active}">${label}</button>`
      )
      .join('')}
  </div>`;
}

function syncTabs(act, active) {
  document.querySelectorAll(`[data-act="${act}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.val === active));
  });
}

function flash(btn, msg) {
  const card = btn.closest('.admin-card');
  if (!card) return;
  let el = card.querySelector('.admin-flash');
  if (!el) {
    el = document.createElement('p');
    el.className = 'import-msg warn admin-flash';
    card.appendChild(el);
  }
  el.textContent = msg;
}

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
