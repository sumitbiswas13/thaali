import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { loadRecipes, findRecipe } from '../lib/mockData.js';
import { createRecipe, updateRecipe, uploadRecipeImage, canEdit } from '../lib/recipes.js';
import { CUISINES, COURSES, DIFFICULTIES } from '../lib/categories.js';

const MAX_IMAGES = 4;

// Build <option> markup, marking the recipe's current value as selected.
function options(list, current) {
  const sel = (current || '').trim();
  const has = list.some((x) => x.toLowerCase() === sel.toLowerCase());
  const opts = list
    .map((o) => `<option value="${o}" ${o.toLowerCase() === sel.toLowerCase() ? 'selected' : ''}>${o}</option>`)
    .join('');
  const extra = sel && !has ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : '';
  return `<option value="">—</option>${opts}${extra}`;
}

export function Submit(params = {}) {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  // Edit mode: #/submit?edit=<slug|short_code|uuid>
  const editing = params.edit ? findRecipe(params.edit) : null;
  if (params.edit && !editing) {
    navigate('/home');
    return '';
  }
  if (editing && !canEdit(editing)) {
    // Not the owner/admin — bounce to the recipe.
    navigate('/recipe?id=' + (editing.slug || editing.short_code || editing.id));
    return '';
  }

  onMount(() => {
    const formWrap = document.getElementById('submit-form');

    // In edit mode, skip the import bar and render the form straight away,
    // pre-filled from the existing recipe.
    if (editing) {
      renderForm(formWrap, { ...editing, imported_fields: [] }, editing);
      return;
    }

    const importBtn = document.querySelector('[data-action="import"]');
    const urlInput = document.getElementById('import-url');
    const importMsg = document.getElementById('import-msg');

    async function runImport() {
      const url = urlInput.value.trim();
      if (!url) {
        urlInput.focus();
        return;
      }
      importBtn.disabled = true;
      const original = importBtn.textContent;
      importBtn.textContent = 'Reading…';
      importMsg.textContent = '';
      importMsg.className = 'import-msg';

      try {
        const resp = await fetch('/api/import?url=' + encodeURIComponent(url));
        const data = await resp.json();

        if (data.ok && data.recipe) {
          const count = data.recipe.imported_fields?.length || 0;
          importMsg.textContent = count
            ? 'Imported what we could find — review and fill in the rest below.'
            : 'Found the page but no recipe data — start from the blank form below.';
          importMsg.className = 'import-msg ok';
          renderForm(formWrap, { source_url: url, ...data.recipe });
        } else {
          importMsg.textContent =
            (data.error || 'Could not import that page.') + ' You can still add it by hand below.';
          importMsg.className = 'import-msg warn';
          renderForm(formWrap, { ingredients: [], steps: [], imported_fields: [] });
        }
      } catch (err) {
        importMsg.textContent = 'Import service unreachable. Add the recipe by hand below.';
        importMsg.className = 'import-msg warn';
        renderForm(formWrap, { ingredients: [], steps: [], imported_fields: [] });
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = original;
      }
    }

    importBtn?.addEventListener('click', runImport);
    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runImport();
    });

    document.querySelector('[data-action="scratch"]')?.addEventListener('click', () => {
      importMsg.textContent = '';
      importMsg.className = 'import-msg';
      renderForm(formWrap, { ingredients: [], steps: [], imported_fields: [] });
    });
  });

  const heading = editing ? 'Edit recipe' : 'Add a recipe';
  const importSection = editing
    ? ''
    : `
      <div class="import-bar">
        <input type="url" id="import-url" placeholder="Paste a recipe link — yours or anywhere" />
        <button class="btn btn-primary" data-action="import">Read the page</button>
      </div>
      <p class="import-msg" id="import-msg"></p>
      <button class="add-row" data-action="scratch">or start from scratch →</button>`;

  return `
    ${Header()}
    <main class="wrap">
      <div class="section-head"><h2>${heading}</h2></div>
      ${importSection}
      <div id="submit-form"></div>
    </main>
    ${Footer()}
  `;
}

// `existing` is the recipe being edited (or null for a new one).
function renderForm(wrap, data, existing = null) {
  const tag = (f) => (data.imported_fields?.includes(f) ? '<span class="imported-tag">imported</span>' : '');

  // Seed the gallery: existing images[], else the single image_url, else empty.
  let gallery = Array.isArray(data.images) && data.images.length
    ? [...data.images]
    : data.image_url
    ? [data.image_url]
    : [];
  // Title image = image_url if set, else first gallery image.
  let titleImg = data.image_url || gallery[0] || null;

  wrap.innerHTML = `
    <div class="panel" style="max-width:none;margin-top:24px;">

      <div class="field">
        <label>Photos <span class="muted">(up to ${MAX_IMAGES}; tap one to make it the cover)</span></label>
        <div class="gallery-edit" id="gallery"></div>
        <input type="file" id="f-image" accept="image/*" hidden />
        <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
          <button type="button" class="btn btn-ghost" data-action="choose-photo">Add a photo</button>
          <span class="import-msg" id="photo-status"></span>
        </div>
      </div>

      <div class="field">
        <label>Title ${tag('title')}</label>
        <input type="text" id="f-title" value="${esc(data.title)}" placeholder="Name your recipe" />
      </div>
      <div class="field">
        <label>Description</label>
        <textarea id="f-desc" rows="2" placeholder="A line about this dish">${esc(data.description)}</textarea>
      </div>

      <div class="field-row" style="display:flex;gap:12px;flex-wrap:wrap;">
        <div class="field"><label>Cuisine ${tag('cuisine')}</label><select id="f-cuisine">${options(CUISINES, data.cuisine)}</select></div>
        <div class="field"><label>Course ${tag('course')}</label><select id="f-course">${options(COURSES, data.course)}</select></div>
        <div class="field"><label>Difficulty</label><select id="f-difficulty">${options(DIFFICULTIES, data.difficulty)}</select></div>
      </div>
      <div class="field-row" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field"><label>Prep (min)</label><input type="number" id="f-prep" value="${esc(data.prep_time)}" placeholder="10" /></div>
        <div class="field"><label>Cook (min)</label><input type="number" id="f-cook" value="${esc(data.cook_time)}" placeholder="25" /></div>
        <div class="field"><label>Serves</label><input type="number" id="f-servings" value="${esc(data.servings)}" placeholder="4" /></div>
        <div class="field"><label>Total</label><div class="total-time" id="f-total">—</div></div>
      </div>

      <h3 style="margin:24px 0 12px;">Ingredients</h3>
      <div id="ingredients">
        ${(data.ingredients || []).map(ingRow).join('')}
        ${(data.ingredients || []).length === 0 ? ingRow({}) : ''}
      </div>
      <button class="add-row" data-add="ingredient">+ add ingredient</button>

      <h3 style="margin:24px 0 12px;">Method</h3>
      <div id="steps">
        ${(data.steps || []).map((s, i) => stepRow(s, i)).join('')}
        ${(data.steps || []).length === 0 ? stepRow({}, 0) : ''}
      </div>
      <button class="add-row" data-add="step">+ add step</button>

      <div style="margin-top:28px;display:flex;gap:12px;align-items:center;">
        <button class="btn btn-primary" data-action="publish">${existing ? 'Save changes' : 'Publish recipe'}</button>
        <span class="auth-status" id="submit-status"></span>
      </div>
    </div>
  `;

  const formState = {
    gallery,
    titleImg,
    source_url: data.source_url || null,
    editingId: existing ? existing.id : null,
  };
  wireForm(wrap, formState);
}

function ingRow(ing = {}) {
  return `
    <div class="ingredient-row">
      <input type="text" value="${esc(ing.quantity)}" placeholder="1" aria-label="amount" data-f="quantity" />
      <input type="text" value="${esc(ing.unit)}" placeholder="cup" aria-label="unit" data-f="unit" />
      <input type="text" value="${esc(ing.item)}" placeholder="ingredient" aria-label="item" data-f="item" />
      <button class="row-remove" data-remove aria-label="remove">×</button>
    </div>`;
}

function stepRow(step = {}, i = 0) {
  const mins = step.timer_seconds ? Math.round(step.timer_seconds / 60) : '';
  return `
    <div class="step-row">
      <div class="step-num">${i + 1}</div>
      <div class="step-fields">
        <textarea rows="2" placeholder="Describe this step" data-f="instruction">${esc(step.instruction)}</textarea>
        <label class="step-timer">
          <span class="muted">timer</span>
          <input type="number" min="0" value="${mins}" placeholder="0" aria-label="timer minutes" data-f="timer" />
          <span class="muted">min</span>
        </label>
      </div>
      <button class="row-remove" data-remove aria-label="remove">×</button>
    </div>`;
}

function wireForm(wrap, formState) {
  // --- live total-time readout ---
  const updateTotal = () => {
    const prep = Number(wrap.querySelector('#f-prep')?.value) || 0;
    const cook = Number(wrap.querySelector('#f-cook')?.value) || 0;
    const total = prep + cook;
    const el = wrap.querySelector('#f-total');
    if (el) el.textContent = total ? `${total} min` : '—';
  };
  wrap.querySelector('#f-prep')?.addEventListener('input', updateTotal);
  wrap.querySelector('#f-cook')?.addEventListener('input', updateTotal);
  updateTotal();

  // --- gallery (multi-image) ---
  const galleryEl = wrap.querySelector('#gallery');
  const fileInput = wrap.querySelector('#f-image');
  const photoStatus = wrap.querySelector('#photo-status');
  const chooseBtn = wrap.querySelector('[data-action="choose-photo"]');

  function paintGallery() {
    if (!formState.gallery.length) {
      // Graceful empty state: a single dashed drop zone that IS the add
      // affordance (clicking it opens the file picker), instead of stray
      // "No photos yet" text sitting above a separate button.
      galleryEl.innerHTML = `
        <button type="button" class="photo-dropzone" data-action="dropzone">
          <span class="photo-dropzone-icon" aria-hidden="true">+</span>
          <span class="photo-dropzone-text">Add a photo</span>
          <span class="photo-dropzone-hint muted">Up to ${MAX_IMAGES} · tap one later to set the cover</span>
        </button>`;
    } else {
      galleryEl.innerHTML = formState.gallery
        .map((url, idx) => {
          const isTitle = url === formState.titleImg;
          return `
            <div class="gthumb ${isTitle ? 'is-title' : ''}" data-idx="${idx}">
              <img src="${esc(url)}" alt="" />
              ${isTitle ? '<span class="gthumb-badge">Cover</span>' : `<button type="button" class="gthumb-make" data-make="${idx}">Set cover</button>`}
              <button type="button" class="gthumb-remove" data-remove-img="${idx}" aria-label="remove">×</button>
            </div>`;
        })
        .join('');
    }
    // The separate "Add a photo" button only makes sense once photos exist
    // (the empty state has its own drop zone). Hide it when empty or at cap.
    const atCap = formState.gallery.length >= MAX_IMAGES;
    chooseBtn.style.display = formState.gallery.length === 0 || atCap ? 'none' : '';
    bindGallery();
  }

  function bindGallery() {
    // Empty-state drop zone opens the same file picker as the Add button.
    galleryEl.querySelector('[data-action="dropzone"]')?.addEventListener('click', () => fileInput.click());
    galleryEl.querySelectorAll('[data-make]').forEach((btn) => {
      btn.onclick = () => {
        formState.titleImg = formState.gallery[Number(btn.dataset.make)];
        paintGallery();
      };
    });
    galleryEl.querySelectorAll('[data-remove-img]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.removeImg);
        const removed = formState.gallery[idx];
        formState.gallery.splice(idx, 1);
        // If we removed the cover, fall back to the first remaining image.
        if (removed === formState.titleImg) formState.titleImg = formState.gallery[0] || null;
        paintGallery();
      };
    });
  }

  chooseBtn?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (formState.gallery.length >= MAX_IMAGES) {
      photoStatus.textContent = `Up to ${MAX_IMAGES} photos.`;
      photoStatus.className = 'import-msg warn';
      return;
    }
    photoStatus.textContent = 'Uploading photo…';
    photoStatus.className = 'import-msg';
    try {
      const url = await uploadRecipeImage(file);
      formState.gallery.push(url);
      if (!formState.titleImg) formState.titleImg = url; // first one becomes cover
      photoStatus.textContent = 'Photo added.';
      photoStatus.className = 'import-msg ok';
      paintGallery();
    } catch (err) {
      photoStatus.textContent = err.message;
      photoStatus.className = 'import-msg warn';
    } finally {
      fileInput.value = '';
    }
  });
  paintGallery();

  wrap.querySelector('[data-add="ingredient"]')?.addEventListener('click', () => {
    document.getElementById('ingredients').insertAdjacentHTML('beforeend', ingRow({}));
    bindRemovers(wrap);
  });
  wrap.querySelector('[data-add="step"]')?.addEventListener('click', () => {
    const count = document.getElementById('steps').children.length;
    document.getElementById('steps').insertAdjacentHTML('beforeend', stepRow({}, count));
    bindRemovers(wrap);
  });

  wrap.querySelector('[data-action="publish"]')?.addEventListener('click', async (e) => {
    const status = document.getElementById('submit-status');
    const recipe = collect(wrap, formState);
    if (!recipe.title) {
      status.textContent = 'Title is required.';
      return;
    }
    e.target.disabled = true;
    status.textContent = formState.editingId ? 'Saving…' : 'Publishing…';
    try {
      if (formState.editingId) {
        await updateRecipe(formState.editingId, recipe);
      } else {
        await createRecipe(recipe);
      }
      await loadRecipes();
      navigate('/home');
    } catch (err) {
      e.target.disabled = false;
      status.textContent = (formState.editingId ? 'Save' : 'Publish') + ' failed: ' + err.message;
    }
  });
  bindRemovers(wrap);
}

function collect(wrap, formState) {
  const val = (id) => wrap.querySelector('#' + id)?.value.trim() || '';
  const num = (id) => {
    const v = val(id);
    return v === '' ? null : Number(v);
  };

  const ingredients = [...wrap.querySelectorAll('.ingredient-row')]
    .map((row) => ({
      quantity: row.querySelector('[data-f="quantity"]').value.trim(),
      unit: row.querySelector('[data-f="unit"]').value.trim(),
      item: row.querySelector('[data-f="item"]').value.trim(),
    }))
    .filter((i) => i.item);

  const steps = [...wrap.querySelectorAll('.step-row')]
    .map((row) => {
      const instruction = row.querySelector('[data-f="instruction"]').value.trim();
      const mins = Number(row.querySelector('[data-f="timer"]').value);
      const step = { instruction };
      if (mins > 0) step.timer_seconds = Math.round(mins * 60);
      return step;
    })
    .filter((s) => s.instruction);

  // Order the gallery so the cover is first, then persist both fields.
  const cover = formState.titleImg || formState.gallery[0] || null;
  const images = cover
    ? [cover, ...formState.gallery.filter((u) => u !== cover)]
    : [...formState.gallery];

  return {
    title: val('f-title'),
    description: val('f-desc'),
    cuisine: val('f-cuisine'),
    course: val('f-course'),
    difficulty: val('f-difficulty'),
    prep_time: num('f-prep'),
    cook_time: num('f-cook'),
    servings: num('f-servings'),
    image_url: cover,
    images,
    source_url: formState.source_url,
    ingredients,
    steps,
  };
}

function bindRemovers(wrap) {
  wrap.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.onclick = () => btn.closest('.ingredient-row, .step-row').remove();
  });
}

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
