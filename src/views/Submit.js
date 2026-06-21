import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { loadRecipes } from '../lib/mockData.js';
import { createRecipe, uploadRecipeImage } from '../lib/recipes.js';
import { CUISINES, COURSES, DIFFICULTIES } from '../lib/categories.js';

// Build <option> markup, marking the recipe's current value as selected.
function options(list, current) {
  const sel = (current || '').trim();
  const has = list.some((x) => x.toLowerCase() === sel.toLowerCase());
  const opts = list
    .map((o) => `<option value="${o}" ${o.toLowerCase() === sel.toLowerCase() ? 'selected' : ''}>${o}</option>`)
    .join('');
  // If an imported value isn't in our list, keep it as a one-off selected option.
  const extra = sel && !has ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : '';
  return `<option value="">—</option>${opts}${extra}`;
}

export function Submit() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  onMount(() => {
    const importBtn = document.querySelector('[data-action="import"]');
    const urlInput = document.getElementById('import-url');
    const importMsg = document.getElementById('import-msg');
    const formWrap = document.getElementById('submit-form');

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
          // Carry the original link through to publish for attribution.
          renderForm(formWrap, { source_url: url, ...data.recipe });
        } else {
          // Graceful fallback: open a blank form so the cook can type it in.
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

  return `
    ${Header()}
    <main class="wrap">
      <div class="section-head"><h2>Add a recipe</h2></div>

      <div class="import-bar">
        <input type="url" id="import-url" placeholder="Paste a recipe link — yours or anywhere" />
        <button class="btn btn-primary" data-action="import">Read the page</button>
      </div>
      <p class="import-msg" id="import-msg"></p>
      <button class="add-row" data-action="scratch">or start from scratch →</button>

      <div id="submit-form"></div>
    </main>
    ${Footer()}
  `;
}

function renderForm(wrap, data) {
  const tag = (f) => (data.imported_fields?.includes(f) ? '<span class="imported-tag">imported</span>' : '');

  wrap.innerHTML = `
    <div class="panel" style="max-width:none;margin-top:24px;">

      <div class="field">
        <label>Photo</label>
        <div class="photo-field">
          <div class="photo-preview" id="photo-preview">
            ${data.image_url ? `<img src="${esc(data.image_url)}" alt="" />` : '<span class="muted">No photo yet</span>'}
          </div>
          <input type="file" id="f-image" accept="image/*" hidden />
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
        <button class="btn btn-primary" data-action="publish">Publish recipe</button>
        <span class="auth-status" id="submit-status"></span>
      </div>
    </div>
  `;

  // State the form holds onto across edits: the uploaded photo URL and the
  // original source link (set when imported).
  const formState = { image_url: data.image_url || null, source_url: data.source_url || null };
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
  // timer_seconds is stored in seconds; show it to cooks as minutes.
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

  // --- photo upload ---
  const fileInput = wrap.querySelector('#f-image');
  const photoStatus = wrap.querySelector('#photo-status');
  const preview = wrap.querySelector('#photo-preview');
  wrap.querySelector('[data-action="choose-photo"]')?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    photoStatus.textContent = 'Uploading photo…';
    photoStatus.className = 'import-msg';
    try {
      formState.image_url = await uploadRecipeImage(file);
      preview.innerHTML = `<img src="${formState.image_url}" alt="" />`;
      photoStatus.textContent = 'Photo ready.';
      photoStatus.className = 'import-msg ok';
    } catch (err) {
      photoStatus.textContent = err.message;
      photoStatus.className = 'import-msg warn';
    }
  });

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
    status.textContent = 'Publishing…';
    try {
      await createRecipe(recipe);
      await loadRecipes();
      navigate('/home');
    } catch (err) {
      e.target.disabled = false;
      status.textContent = 'Publish failed: ' + err.message;
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

  return {
    title: val('f-title'),
    description: val('f-desc'),
    cuisine: val('f-cuisine'),
    course: val('f-course'),
    difficulty: val('f-difficulty'),
    prep_time: num('f-prep'),
    cook_time: num('f-cook'),
    servings: num('f-servings'),
    image_url: formState.image_url,
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
