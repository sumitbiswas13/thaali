import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { demoImport } from '../lib/mockData.js';

export function Submit() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  onMount(() => {
    const importBtn = document.querySelector('[data-action="import"]');
    const formWrap = document.getElementById('submit-form');

    importBtn?.addEventListener('click', () => {
      // Prototype: URL import is simulated and always returns the demo recipe.
      // Real version: server-side fetch parses schema.org Recipe JSON-LD, with
      // an AI fallback for messy pages (Cloudflare Pages Function).
      renderForm(formWrap, demoImport);
    });

    document.querySelector('[data-action="scratch"]')?.addEventListener('click', () => {
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
        <label>Title ${tag('title')}</label>
        <input type="text" value="${data.title || ''}" placeholder="Name your recipe" />
      </div>
      <div class="field">
        <label>Description</label>
        <textarea rows="2" placeholder="A line about this dish">${data.description || ''}</textarea>
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

      <div style="margin-top:28px;display:flex;gap:12px;">
        <button class="btn btn-primary" data-action="publish">Publish recipe</button>
        <button class="btn btn-ghost" data-action="draft">Save draft</button>
      </div>
    </div>
  `;

  wireForm(wrap);
}

function ingRow(ing = {}) {
  return `
    <div class="ingredient-row">
      <input type="text" value="${ing.quantity || ''}" placeholder="1" aria-label="amount" />
      <input type="text" value="${ing.unit || ''}" placeholder="cup" aria-label="unit" />
      <input type="text" value="${ing.item || ''}" placeholder="ingredient" aria-label="item" />
      <button class="row-remove" data-remove aria-label="remove">×</button>
    </div>`;
}

function stepRow(step = {}, i = 0) {
  return `
    <div class="step-row">
      <div class="step-num">${i + 1}</div>
      <textarea rows="2" placeholder="Describe this step">${step.instruction || ''}</textarea>
      <button class="row-remove" data-remove aria-label="remove">×</button>
    </div>`;
}

function wireForm(wrap) {
  wrap.querySelector('[data-add="ingredient"]')?.addEventListener('click', () => {
    document.getElementById('ingredients').insertAdjacentHTML('beforeend', ingRow({}));
    bindRemovers(wrap);
  });
  wrap.querySelector('[data-add="step"]')?.addEventListener('click', () => {
    const count = document.getElementById('steps').children.length;
    document.getElementById('steps').insertAdjacentHTML('beforeend', stepRow({}, count));
    bindRemovers(wrap);
  });
  wrap.querySelector('[data-action="publish"]')?.addEventListener('click', () => {
    alert('Prototype: recipe would be published to Supabase here.');
    navigate('/home');
  });
  bindRemovers(wrap);
}

function bindRemovers(wrap) {
  wrap.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.onclick = () => btn.closest('.ingredient-row, .step-row').remove();
  });
}
