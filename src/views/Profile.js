import { Header, Footer } from '../components/layout.js';
import { RecipeCard } from '../components/RecipeCard.js';
import { recipes } from '../lib/mockData.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn, currentUser } from '../lib/auth.js';
import { fetchProfile, ensureOwnProfile, updateProfile, uploadAvatar } from '../lib/profiles.js';

// Route: #/profile           → own profile
//        #/profile?id=<uid>  → another cook's profile
export function Profile(params) {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  const me = currentUser();
  const targetId = params.id || me.id;
  const isOwner = targetId === me.id;

  onMount(async () => {
    const wrap = document.getElementById('profile-body');
    try {
      const profile = isOwner ? await ensureOwnProfile() : await fetchProfile(targetId);
      if (!profile) {
        wrap.innerHTML = `<p class="muted">That cook could not be found.</p>`;
        return;
      }
      renderProfile(wrap, profile, isOwner);
    } catch (err) {
      wrap.innerHTML = `<p class="import-msg warn">Could not load profile: ${esc(err.message)}</p>`;
    }
  });

  return `
    ${Header()}
    <main class="wrap">
      <div id="profile-body"><p class="muted">Loading…</p></div>
    </main>
    ${Footer()}
  `;
}

function renderProfile(wrap, profile, isOwner) {
  const name = profile.display_name || 'Unnamed cook';
  const theirRecipes = recipes.filter((r) => r.author_id === profile.id);

  wrap.innerHTML = `
    <section class="profile-head">
      ${avatarMarkup(profile.avatar_url, name)}
      <div class="profile-meta">
        <h2 class="profile-name">${esc(name)}</h2>
        <p class="profile-bio">${profile.bio ? esc(profile.bio) : '<span class="muted">No bio yet.</span>'}</p>
        ${isOwner ? `<button class="btn btn-ghost" data-action="edit-profile">Edit profile</button>` : ''}
      </div>
    </section>

    <div class="section-head" style="margin-top:32px;">
      <h3>${isOwner ? 'Your recipes' : 'Recipes'} <span class="muted">(${theirRecipes.length})</span></h3>
    </div>
    ${
      theirRecipes.length
        ? `<div class="grid">${theirRecipes.map(RecipeCard).join('')}</div>`
        : `<p class="muted">${
            isOwner
              ? 'You haven’t posted a recipe yet. <a href="#/submit">Add your first →</a>'
              : 'This cook hasn’t posted any recipes yet.'
          }</p>`
    }
  `;

  if (isOwner) {
    wrap.querySelector('[data-action="edit-profile"]')?.addEventListener('click', () => {
      renderEditForm(wrap, profile);
    });
  }
}

function renderEditForm(wrap, profile) {
  wrap.innerHTML = `
    <section class="profile-head">
      ${avatarMarkup(profile.avatar_url, profile.display_name || 'cook', true)}
      <div class="profile-meta" style="flex:1;">
        <div class="field">
          <label>Display name</label>
          <input type="text" id="p-name" value="${esc(profile.display_name || '')}" placeholder="What should cooks call you?" />
        </div>
        <div class="field">
          <label>Bio</label>
          <textarea id="p-bio" rows="3" placeholder="A line or two about you and how you cook">${esc(profile.bio || '')}</textarea>
        </div>
        <input type="file" id="p-avatar" accept="image/*" hidden />
        <div style="display:flex;gap:12px;align-items:center;margin-top:8px;">
          <button class="btn btn-primary" data-action="save-profile">Save</button>
          <button class="btn btn-ghost" data-action="cancel-profile">Cancel</button>
          <span class="import-msg" id="p-status"></span>
        </div>
      </div>
    </section>
  `;

  let pendingAvatarUrl = profile.avatar_url;

  const status = wrap.querySelector('#p-status');
  const fileInput = wrap.querySelector('#p-avatar');
  const avatarBtn = wrap.querySelector('[data-action="change-avatar"]');

  avatarBtn?.addEventListener('click', () => fileInput.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = 'Uploading photo…';
    status.className = 'import-msg';
    try {
      pendingAvatarUrl = await uploadAvatar(file);
      const img = wrap.querySelector('.profile-avatar-img');
      const fallback = wrap.querySelector('.profile-avatar-fallback');
      if (img) {
        img.src = pendingAvatarUrl;
      } else if (fallback) {
        fallback.outerHTML = `<img class="profile-avatar-img" src="${pendingAvatarUrl}" alt="" />`;
      }
      status.textContent = 'Photo ready — Save to keep it.';
      status.className = 'import-msg ok';
    } catch (err) {
      status.textContent = err.message;
      status.className = 'import-msg warn';
    }
  });

  wrap.querySelector('[data-action="cancel-profile"]')?.addEventListener('click', () => {
    renderProfile(wrap, profile, true);
  });

  wrap.querySelector('[data-action="save-profile"]')?.addEventListener('click', async (e) => {
    const display_name = wrap.querySelector('#p-name').value.trim();
    const bio = wrap.querySelector('#p-bio').value.trim();
    if (!display_name) {
      status.textContent = 'A display name is required.';
      status.className = 'import-msg warn';
      return;
    }
    e.target.disabled = true;
    status.textContent = 'Saving…';
    status.className = 'import-msg';
    try {
      const updated = await updateProfile({ display_name, bio, avatar_url: pendingAvatarUrl });
      renderProfile(wrap, updated, true);
    } catch (err) {
      e.target.disabled = false;
      status.textContent = 'Save failed: ' + err.message;
      status.className = 'import-msg warn';
    }
  });
}

function avatarMarkup(url, name, editable = false) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const inner = url
    ? `<img class="profile-avatar-img" src="${esc(url)}" alt="" />`
    : `<div class="profile-avatar-fallback">${esc(initial)}</div>`;
  return `
    <div class="profile-avatar ${editable ? 'editable' : ''}">
      ${inner}
      ${editable ? `<button class="avatar-edit-btn" data-action="change-avatar" title="Change photo">Change</button>` : ''}
    </div>
  `;
}

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
