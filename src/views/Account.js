import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn, currentUser } from '../lib/auth.js';
import { ensureOwnProfile } from '../lib/profiles.js';
import { countryName } from '../lib/categories.js';
import { recipes } from '../lib/mockData.js';
import {
  requestDeletion,
  fetchPendingDeletion,
  cancelDeletion,
} from '../lib/account.js';

// Route: #/account → the signed-in cook's account page (profile summary +
// account-deletion request flow). Owner-only; there's no "other user" variant.
export function Account() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  onMount(async () => {
    const wrap = document.getElementById('account-body');
    try {
      const [profile, pending] = await Promise.all([
        ensureOwnProfile(),
        fetchPendingDeletion(),
      ]);
      renderAccount(wrap, profile, pending);
    } catch (err) {
      wrap.innerHTML = `<p class="import-msg warn">Could not load your account: ${esc(err.message)}</p>`;
    }
  });

  return `
    ${Header()}
    <main class="wrap">
      <div id="account-body"><p class="muted">Loading…</p></div>
    </main>
    ${Footer()}
  `;
}

function renderAccount(wrap, profile, pending) {
  const me = currentUser();
  const name = profile?.display_name || 'Unnamed cook';
  const mine = recipes.filter((r) => r.author_id === me.id);

  wrap.innerHTML = `
    <section class="account-head">
      <h2>Your account</h2>
      <p class="muted">Manage your account and data.</p>
    </section>

    <section class="account-card">
      <h3>Profile</h3>
      <dl class="account-facts">
        <div><dt>Name</dt><dd>${esc(name)}</dd></div>
        <div><dt>Email</dt><dd>${esc(me.email || '—')}</dd></div>
        ${profile?.country ? `<div><dt>Country</dt><dd>${esc(countryName(profile.country))}</dd></div>` : ''}
        <div><dt>Recipes</dt><dd>${mine.length}</dd></div>
      </dl>
      <a class="btn btn-ghost" href="#/profile">Edit profile</a>
    </section>

    <section class="account-card danger-zone">
      <h3>Delete account</h3>
      <div id="deletion-region"></div>
    </section>
  `;

  const region = wrap.querySelector('#deletion-region');
  if (pending) {
    renderPending(region, pending);
  } else {
    renderDeleteStart(region, mine.length);
  }
}

// --- Pending state: grayed-out, with cancel-by-email instructions ----------
function renderPending(region, pending) {
  const requested = new Date(pending.requested_at);
  const when = requested.toLocaleString();
  region.innerHTML = `
    <div class="deletion-pending">
      <p><strong>Account deletion requested.</strong></p>
      <p class="muted">
        Requested on ${esc(when)}. Your account is scheduled to be deleted in
        24–48 hours.${pending.delete_recipes
          ? ' Your recipes will be deleted too.'
          : ' Your recipes will be kept and shown as “A Thaali cook”.'}
      </p>
      <p class="muted">
        Changed your mind? You can still use Thaali normally until then. To cancel,
        email <a href="mailto:contact.thaali@gmail.com">contact.thaali@gmail.com</a>
        from this account, or use the button below.
      </p>
      <div class="deletion-actions">
        <button class="btn btn-ghost" data-action="cancel-deletion">Cancel deletion request</button>
        <span class="import-msg" id="deletion-status"></span>
      </div>
    </div>
  `;

  const status = region.querySelector('#deletion-status');
  region.querySelector('[data-action="cancel-deletion"]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    status.textContent = 'Cancelling…';
    status.className = 'import-msg';
    try {
      await cancelDeletion(pending.id);
      status.textContent = 'Cancelled — your account is safe.';
      status.className = 'import-msg ok';
      // Re-render to the start state so they could request again if they wish.
      setTimeout(() => renderDeleteStart(region, null), 900);
    } catch (err) {
      e.target.disabled = false;
      status.textContent = 'Could not cancel: ' + err.message;
      status.className = 'import-msg warn';
    }
  });
}

// --- Start: explain, then a button that opens the confirm flow -------------
function renderDeleteStart(region, recipeCount) {
  const count = typeof recipeCount === 'number' ? recipeCount : 0;
  region.innerHTML = `
    <p class="muted">
      Deleting your account removes your profile, your likes, and your comments.
      This is permanent and can’t be undone once it’s processed.
    </p>
    <button class="btn btn-ghost deletion-trigger" data-action="start-deletion">
      Request account deletion
    </button>
    <div id="deletion-confirm" hidden></div>
  `;

  region.querySelector('[data-action="start-deletion"]')?.addEventListener('click', () => {
    region.querySelector('[data-action="start-deletion"]').hidden = true;
    renderConfirm(region.querySelector('#deletion-confirm'), count);
  });
}

// --- Confirm: type DELETE + choose recipe fate + submit --------------------
function renderConfirm(box, recipeCount) {
  box.hidden = false;
  const hasRecipes = recipeCount > 0;
  box.innerHTML = `
    <div class="deletion-confirm">
      ${
        hasRecipes
          ? `<div class="field">
               <label>What should happen to your ${recipeCount} recipe${recipeCount === 1 ? '' : 's'}?</label>
               <label class="radio-row">
                 <input type="radio" name="recipe-fate" value="keep" checked />
                 Keep them on Thaali, shown as “A Thaali cook”
               </label>
               <label class="radio-row">
                 <input type="radio" name="recipe-fate" value="delete" />
                 Delete my recipes too
               </label>
             </div>`
          : ''
      }
      <div class="field">
        <label for="delete-confirm-input">Type <strong>DELETE</strong> to confirm</label>
        <input type="text" id="delete-confirm-input" autocomplete="off" placeholder="DELETE" />
      </div>
      <div class="deletion-actions">
        <button class="btn btn-ghost" data-action="abort-deletion">Never mind</button>
        <button class="btn btn-primary deletion-confirm-btn" data-action="confirm-deletion" disabled>
          Request deletion
        </button>
        <span class="import-msg" id="deletion-status"></span>
      </div>
    </div>
  `;

  const input = box.querySelector('#delete-confirm-input');
  const confirmBtn = box.querySelector('[data-action="confirm-deletion"]');
  const status = box.querySelector('#deletion-status');

  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value.trim() !== 'DELETE';
  });

  box.querySelector('[data-action="abort-deletion"]')?.addEventListener('click', () => {
    // Collapse back to the start state.
    renderDeleteStart(box.closest('#deletion-region'), recipeCount);
  });

  confirmBtn.addEventListener('click', async () => {
    if (input.value.trim() !== 'DELETE') return;
    const fate = box.querySelector('input[name="recipe-fate"]:checked');
    const deleteRecipes = fate ? fate.value === 'delete' : false;

    confirmBtn.disabled = true;
    status.textContent = 'Submitting…';
    status.className = 'import-msg';
    try {
      const res = await requestDeletion(deleteRecipes);
      const region = box.closest('#deletion-region');
      // Re-render into the pending state. We don't have the row back, so
      // synthesize what renderPending needs from what we just submitted.
      renderPending(region, {
        id: null,
        delete_recipes: deleteRecipes,
        requested_at: new Date().toISOString(),
        status: 'pending',
      });
      // The synthesized row has no id, so disable the in-app cancel button and
      // point them to email (still fully valid). Re-fetch to get the real row.
      refreshPending(region);
    } catch (err) {
      confirmBtn.disabled = false;
      status.textContent = err.message;
      status.className = 'import-msg warn';
    }
  });
}

// After submitting, fetch the real pending row so the cancel button works.
async function refreshPending(region) {
  try {
    const pending = await fetchPendingDeletion();
    if (pending) renderPending(region, pending);
  } catch {
    /* keep the synthesized view; email cancel still works */
  }
}

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
