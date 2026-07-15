import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { recipes } from '../lib/mockData.js';
import { fetchLikeCounts } from '../lib/social.js';
import { GAMES, submitScore, fetchLeaderboard, fetchMyBest } from '../lib/games.js';

// ---------------------------------------------------------------------------
// Games section.
//   /games        → hub listing available games
//   /games/guess  → "Guess the Recipe" game
// Signed-in only (mirrors the rest of the app's members features). Content is
// drawn from the live recipe catalog, so games grow as cooks post.
// ---------------------------------------------------------------------------

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Shared leaderboard renderer — both games use the same board (fetches the
// weekly-or-all-time top for a game slug and paints it into `el`).
async function renderLeaderboardInto(el, game) {
  try {
    const { window: win, rows } = await fetchLeaderboard(game);
    if (!rows.length) {
      el.innerHTML = `<h3>Leaderboard</h3><p class="muted">No scores yet — you might be first!</p>`;
      return;
    }
    const label = win === 'weekly' ? 'This week' : 'All time';
    const items = rows
      .map((row, i) => {
        const name = esc(row.display_name || 'A Thaali cook');
        const initial = (row.display_name || '?').trim().charAt(0).toUpperCase();
        const av = row.avatar_url
          ? `<img class="lb-avatar-img" src="${esc(row.avatar_url)}" alt="" referrerpolicy="no-referrer" />`
          : `<span class="lb-avatar-fallback">${esc(initial)}</span>`;
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        return `
          <li class="lb-row">
            <span class="lb-rank">${medal}</span>
            <span class="lb-avatar">${av}</span>
            <span class="lb-name">${name}</span>
            <span class="lb-score">${row.best_score}</span>
          </li>`;
      })
      .join('');
    el.innerHTML = `
      <div class="lb-head"><h3>Leaderboard</h3><span class="lb-window">${label}</span></div>
      <ul class="lb-list">${items}</ul>
    `;
  } catch {
    el.innerHTML = `<h3>Leaderboard</h3><p class="muted">Couldn’t load the leaderboard right now.</p>`;
  }
}

// ── Hub ────────────────────────────────────────────────────────────────────
export function Games() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }
  return `
    ${Header()}
    <main class="wrap games-hub">
      <p class="eyebrow">थाली · play</p>
      <h1>Games</h1>
      <p class="lede">A little fun between recipes — and a leaderboard to climb. More games coming.</p>
      <div class="games-grid">
        <a class="game-card" href="/games/guess">
          <div class="game-card-band"><span class="game-card-emoji">🍲</span></div>
          <div class="game-card-body">
            <h3>Guess the Recipe</h3>
            <p>See a photo and a few ingredients — can you name the dish? 10 rounds, beat your best.</p>
            <span class="game-card-cta">Play →</span>
          </div>
        </a>
        <a class="game-card" href="/games/higher-lower">
          <div class="game-card-band"><span class="game-card-emoji">⚖️</span></div>
          <div class="game-card-body">
            <h3>Higher or Lower</h3>
            <p>Two dishes, one question: which is more loved — or slower to cook? Keep your streak alive.</p>
            <span class="game-card-cta">Play →</span>
          </div>
        </a>
      </div>
    </main>
    ${Footer()}
  `;
}

// ── Guess the Recipe ─────────────────────────────────────────────────────────
const ROUNDS = 10;
const BASE_POINTS = 10;      // per correct answer
const STREAK_BONUS = 2;      // extra points per consecutive correct (capped)
const STREAK_CAP = 5;

// A recipe is usable if it has a title, a photo, and at least one ingredient we
// can show as a clue.
function isPlayable(r) {
  const hasPhoto = Boolean(r.image_url || (Array.isArray(r.images) && r.images.length));
  const hasTitle = Boolean(r.title && r.title.trim());
  const ings = ingredientNames(r);
  return hasPhoto && hasTitle && ings.length >= 1;
}

function coverOf(r) {
  if (r.image_url) return r.image_url;
  if (Array.isArray(r.images) && r.images.length) {
    const first = r.images[0];
    return typeof first === 'string' ? first : first?.url || null;
  }
  return null;
}

// Common measurement units + amount phrases that sometimes get typed INTO the
// ingredient name (e.g. "to taste Water", "1 cup water"). We strip a leading
// run of these so the clue chip reads as a clean ingredient ("Water").
const UNIT_WORDS = new Set([
  'cup', 'cups', 'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons',
  'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'l', 'liter', 'litre', 'liters', 'litres',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'pinch', 'pinches', 'dash', 'handful', 'clove', 'cloves', 'slice', 'slices',
  'piece', 'pieces', 'can', 'cans', 'packet', 'packets', 'stick', 'sticks',
  'bunch', 'sprig', 'sprigs', 'stalk', 'stalks',
]);

// Strip a leading amount/unit phrase from an ingredient string.
// Handles: numbers/fractions ("2", "1/2", "1.5"), unicode fractions (½),
// units from UNIT_WORDS, and the phrases "to taste", "a"/"an", "of".
function cleanIngredientName(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  // "to taste" often leads a raw line; drop it wherever it sits at the start.
  s = s.replace(/^to\s+taste\s+/i, '');
  // Repeatedly peel leading tokens that are amounts or units.
  const isAmount = (t) => /^[\d]+([./][\d]+)?$/.test(t) || /^[¼½¾⅓⅔⅛]+$/.test(t) || /^\d*[¼½¾⅓⅔⅛]$/.test(t);
  let guard = 0;
  while (guard++ < 6) {
    const m = s.match(/^(\S+)\s+(.*)$/);
    if (!m) break;
    const first = m[1].toLowerCase().replace(/[.,]$/, '');
    if (isAmount(first) || UNIT_WORDS.has(first) || first === 'a' || first === 'an' || first === 'of') {
      s = m[2].trim();
    } else break;
  }
  // If stripping ate everything (e.g. the name WAS just "to taste"), fall back
  // to the original so we never show an empty chip.
  return s || String(raw).trim();
}

// Pull readable ingredient names (handles both structured and simple/raw shapes).
// Prefers a clean `item`; for raw/simple lines, strips any leading amount/unit.
function ingredientNames(r) {
  const arr = Array.isArray(r.ingredients) ? r.ingredients : [];
  const out = [];
  for (const ing of arr) {
    if (typeof ing === 'string') {
      const c = cleanIngredientName(ing);
      if (c) out.push(c);
      continue;
    }
    if (ing && typeof ing === 'object') {
      // Structured mode: `item` is the name (quantity/unit live in their own
      // fields). Simple mode: `raw` holds the whole line. Either way, clean it.
      const name = ing.item || ing.raw || '';
      const c = cleanIngredientName(name);
      if (c) out.push(c);
    }
  }
  return out;
}

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build the round list: pick ROUNDS distinct playable recipes; for each, choose
// 3 decoy titles from OTHER recipes (random). Exposed for testing.
export function buildRounds(pool, count = ROUNDS) {
  const playable = pool.filter(isPlayable);
  const chosen = shuffle(playable).slice(0, Math.min(count, playable.length));
  // Distinct titles across the whole catalog, used as the decoy source.
  const allTitles = [...new Set(pool.map((r) => (r.title || '').trim()).filter(Boolean))];

  return chosen.map((r) => {
    const correct = r.title.trim();
    const decoyPool = shuffle(allTitles.filter((t) => t !== correct));
    const decoys = decoyPool.slice(0, 3);
    const choices = shuffle([correct, ...decoys]);
    return {
      recipeId: r.id,
      cover: coverOf(r),
      clues: shuffle(ingredientNames(r)).slice(0, 3),
      correct,
      choices,
    };
  });
}

export function Guess() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  const pool = recipes || [];
  const playableCount = pool.filter(isPlayable).length;

  // Need at least a handful of playable recipes (4 for choices) to run.
  if (playableCount < 4) {
    return `
      ${Header()}
      <main class="wrap games-hub">
        <h1>Guess the Recipe</h1>
        <p class="lede">This game needs a few more recipes with photos before it can start.
        Add some recipes (with a photo and ingredients) and check back!</p>
        <a class="btn btn-ghost" href="/games">← Back to games</a>
      </main>
      ${Footer()}
    `;
  }

  const rounds = buildRounds(pool, ROUNDS);

  onMount(() => {
    let idx = 0;
    let score = 0;
    let streak = 0;
    let answered = false;

    const boardEl = document.getElementById('guess-board');

    function paintRound() {
      answered = false;
      const round = rounds[idx];
      const clueList = round.clues.map((c) => `<li>${esc(c)}</li>`).join('');
      const choiceBtns = round.choices
        .map(
          (c) =>
            `<button class="guess-choice" data-choice="${esc(c)}">${esc(c)}</button>`
        )
        .join('');
      boardEl.innerHTML = `
        <div class="guess-topbar">
          <span class="guess-progress">Round ${idx + 1} / ${rounds.length}</span>
          <span class="guess-score">Score: <strong id="guess-score-n">${score}</strong></span>
        </div>
        <div class="guess-photo">${
          round.cover
            ? `<img src="${esc(round.cover)}" alt="Mystery dish" />`
            : '<div class="platter"></div>'
        }</div>
        <p class="guess-hint">Hints: featuring…</p>
        <ul class="guess-clues">${clueList}</ul>
        <div class="guess-choices">${choiceBtns}</div>
        <p class="guess-feedback" id="guess-feedback"></p>
        <div class="guess-next-wrap"><button class="btn btn-primary" id="guess-next" hidden>Next →</button></div>
      `;

      boardEl.querySelectorAll('.guess-choice').forEach((btn) => {
        btn.addEventListener('click', () => onAnswer(btn));
      });
      document.getElementById('guess-next').addEventListener('click', nextRound);
    }

    function onAnswer(btn) {
      if (answered) return;
      answered = true;
      const round = rounds[idx];
      const picked = btn.dataset.choice;
      const correct = picked === round.correct;

      boardEl.querySelectorAll('.guess-choice').forEach((b) => {
        b.disabled = true;
        if (b.dataset.choice === round.correct) b.classList.add('correct');
        else if (b === btn) b.classList.add('wrong');
      });

      const feedback = document.getElementById('guess-feedback');
      if (correct) {
        streak += 1;
        const bonus = Math.min(streak - 1, STREAK_CAP) * STREAK_BONUS;
        const gained = BASE_POINTS + bonus;
        score += gained;
        feedback.innerHTML = `✅ Correct! <strong>+${gained}</strong>${bonus ? ` (streak ×${streak})` : ''}`;
        feedback.className = 'guess-feedback ok';
        document.getElementById('guess-score-n').textContent = score;
      } else {
        streak = 0;
        feedback.innerHTML = `❌ It was <strong>${esc(round.correct)}</strong>`;
        feedback.className = 'guess-feedback bad';
      }

      const nextBtn = document.getElementById('guess-next');
      nextBtn.hidden = false;
      nextBtn.textContent = idx + 1 >= rounds.length ? 'See results →' : 'Next →';
    }

    function nextRound() {
      idx += 1;
      if (idx >= rounds.length) return endGame();
      paintRound();
    }

    async function endGame() {
      const maxScore = rounds.length * (BASE_POINTS + Math.min(STREAK_CAP, rounds.length - 1) * STREAK_BONUS);
      boardEl.innerHTML = `
        <div class="guess-end">
          <h2>Nicely done!</h2>
          <p class="guess-final">You scored <strong>${score}</strong> point${score === 1 ? '' : 's'}.</p>
          <p class="guess-savestate muted" id="guess-savestate">Saving your score…</p>
          <div class="guess-end-actions">
            <a class="btn btn-ghost" href="/games/guess" data-native>Play again</a>
            <a class="btn btn-ghost" href="/games">Back to games</a>
          </div>
          <section class="leaderboard" id="guess-leaderboard">
            <h3>Leaderboard</h3>
            <p class="muted">Loading…</p>
          </section>
        </div>
      `;

      // Save the score, then load the leaderboard.
      const saveEl = document.getElementById('guess-savestate');
      try {
        await submitScore(GAMES.GUESS, score);
        const my = await fetchMyBest(GAMES.GUESS);
        saveEl.textContent = `Saved. Your best this week: ${my.weekly} · all-time: ${my.allTime}.`;
      } catch (err) {
        saveEl.textContent = 'Could not save your score, but here’s the leaderboard.';
      }
      loadLeaderboard();
    }

    function loadLeaderboard() {
      renderLeaderboardInto(document.getElementById('guess-leaderboard'), GAMES.GUESS);
    }

    paintRound();
  });

  return `
    ${Header()}
    <main class="wrap guess-game">
      <a class="game-back" href="/games">← Games</a>
      <div id="guess-board" class="guess-board"></div>
    </main>
    ${Footer()}
  `;
}

// ── Higher or Lower ──────────────────────────────────────────────────────────
// Endless streak: each round reveals recipe A's value and asks whether recipe B
// is higher or lower on a metric (likes or cook time, mixed). Wrong answer ends
// the run; the streak length is the score. Reuses the shared leaderboard.

// Build the pool of comparable recipes for a metric. `likeCounts` is a
// Map<id, count>. Returns [{ id, title, cover, metric, value, valueLabel }].
export function comparableItems(pool, likeCounts) {
  const items = [];
  for (const r of pool) {
    if (!r.title || !r.title.trim()) continue;
    const cover = coverOf(r);
    const cook = Number(r.cook_time) || 0;
    const likes = likeCounts.get(r.id) || 0;
    items.push({ id: r.id, title: r.title.trim(), cover, cook, likes });
  }
  return items;
}

// Decide which metrics are viable given the data, then return a round:
// { metric, a, b, aValue, bValue, higher } where `higher` is true if B >= A.
// Returns null if no valid distinct pair can be formed.
export function buildHLRound(items, prevIds = []) {
  // Which metrics have enough signal? cook_time needs ≥2 recipes with a time;
  // likes needs ≥2 recipes with any likes (else every pair is 0 vs 0).
  const withCook = items.filter((i) => i.cook > 0);
  const withLikes = items.filter((i) => i.likes > 0);
  const metrics = [];
  if (withCook.length >= 2) metrics.push('cook');
  if (withLikes.length >= 1 && items.length >= 2) metrics.push('likes');
  if (metrics.length === 0) return null;

  const metric = metrics[Math.floor(Math.random() * metrics.length)];
  // Value picker per metric.
  const valOf = (it) => (metric === 'cook' ? it.cook : it.likes);
  // Pool to draw from: for cook, only timed recipes; for likes, all (0s allowed
  // as the *lower* side, but we avoid 0-vs-0 by requiring distinct values).
  const source = metric === 'cook' ? withCook : items;

  // Try a bunch of random distinct pairs with distinct values (no ties).
  for (let attempt = 0; attempt < 40; attempt++) {
    const pair = shuffle(source).slice(0, 2);
    if (pair.length < 2) break;
    const [a, b] = pair;
    if (a.id === b.id) continue;
    const av = valOf(a);
    const bv = valOf(b);
    if (av === bv) continue; // no ties — keeps the answer unambiguous
    // Avoid immediately repeating the same A the player just saw.
    if (prevIds.includes(a.id) && prevIds.includes(b.id)) continue;
    return { metric, a, b, aValue: av, bValue: bv, higher: bv > av };
  }
  return null;
}

function metricPrompt(metric) {
  return metric === 'cook'
    ? { verbHigher: 'longer to cook', verbLower: 'quicker to cook', label: 'cook time', unit: 'min' }
    : { verbHigher: 'more loved', verbLower: 'less loved', label: 'likes', unit: '♥' };
}

export function HigherLower() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  onMount(async () => {
    const boardEl = document.getElementById('hl-board');

    // Fetch like counts once for the whole catalog, then play off memory.
    let likeCounts = new Map();
    try {
      likeCounts = await fetchLikeCounts((recipes || []).map((r) => r.id));
    } catch {
      likeCounts = new Map();
    }
    const items = comparableItems(recipes || [], likeCounts);

    // Need a viable first round to play at all.
    if (!buildHLRound(items)) {
      boardEl.innerHTML = `
        <div class="hl-empty">
          <h2>Higher or Lower</h2>
          <p class="lede">This game needs a few more recipes with cook times or likes before it can start.
          Add some recipes (and give a few a ♥) and check back!</p>
          <a class="btn btn-ghost" href="/games">← Back to games</a>
        </div>`;
      return;
    }

    let streak = 0;
    let round = buildHLRound(items);
    let busy = false;

    function paintRound() {
      const { metric, a, b, aValue } = round;
      const p = metricPrompt(metric);
      boardEl.innerHTML = `
        <div class="hl-topbar">
          <span class="hl-metric">${p.label === 'likes' ? 'Which is more loved?' : 'Which takes longer to cook?'}</span>
          <span class="hl-streak">Streak: <strong id="hl-streak-n">${streak}</strong></span>
        </div>
        <div class="hl-cards">
          <div class="hl-card hl-known">
            <div class="hl-photo">${a.cover ? `<img src="${esc(a.cover)}" alt="${esc(a.title)}" />` : '<div class="platter"></div>'}</div>
            <h3>${esc(a.title)}</h3>
            <p class="hl-value">${aValue} ${p.unit}</p>
          </div>
          <div class="hl-vs">vs</div>
          <div class="hl-card hl-unknown">
            <div class="hl-photo">${b.cover ? `<img src="${esc(b.cover)}" alt="${esc(b.title)}" />` : '<div class="platter"></div>'}</div>
            <h3>${esc(b.title)}</h3>
            <p class="hl-value hl-value-hidden" id="hl-b-value">?</p>
            <div class="hl-choices">
              <button class="btn btn-primary hl-guess" data-guess="higher">${metric === 'cook' ? 'Longer ▲' : 'More ▲'}</button>
              <button class="btn btn-ghost hl-guess" data-guess="lower">${metric === 'cook' ? 'Shorter ▼' : 'Fewer ▼'}</button>
            </div>
          </div>
        </div>
        <p class="hl-feedback" id="hl-feedback"></p>
      `;
      boardEl.querySelectorAll('.hl-guess').forEach((btn) =>
        btn.addEventListener('click', () => onGuess(btn.dataset.guess))
      );
    }

    function onGuess(guess) {
      if (busy) return;
      busy = true;
      const correct = (guess === 'higher') === round.higher;

      // Reveal B's value.
      const bEl = document.getElementById('hl-b-value');
      const p = metricPrompt(round.metric);
      bEl.textContent = `${round.bValue} ${p.unit}`;
      bEl.classList.remove('hl-value-hidden');
      boardEl.querySelectorAll('.hl-guess').forEach((b) => (b.disabled = true));

      const feedback = document.getElementById('hl-feedback');
      if (correct) {
        streak += 1;
        // Update the top-bar counter immediately so it doesn't lag the feedback.
        const streakEl = document.getElementById('hl-streak-n');
        if (streakEl) streakEl.textContent = streak;
        feedback.innerHTML = `✅ Right! Streak ${streak} — <button class="btn btn-primary" id="hl-next">Next →</button>`;
        feedback.className = 'hl-feedback ok';
        document.getElementById('hl-next').addEventListener('click', () => {
          const next = buildHLRound(items, [round.a.id, round.b.id]);
          if (!next) return endGame(); // ran out of viable pairs — bank the streak
          round = next;
          busy = false;
          paintRound();
        });
      } else {
        feedback.innerHTML = `❌ Not quite. Final streak: <strong>${streak}</strong>.`;
        feedback.className = 'hl-feedback bad';
        endGame();
      }
    }

    async function endGame() {
      const finalStreak = streak;
      boardEl.innerHTML = `
        <div class="guess-end">
          <h2>${finalStreak >= 5 ? 'On a roll!' : 'Good run!'}</h2>
          <p class="guess-final">Your streak: <strong>${finalStreak}</strong>.</p>
          <p class="guess-savestate muted" id="hl-savestate">Saving your score…</p>
          <div class="guess-end-actions">
            <a class="btn btn-ghost" href="/games/higher-lower" data-native>Play again</a>
            <a class="btn btn-ghost" href="/games">Back to games</a>
          </div>
          <section class="leaderboard" id="hl-leaderboard"><h3>Leaderboard</h3><p class="muted">Loading…</p></section>
        </div>
      `;
      const saveEl = document.getElementById('hl-savestate');
      try {
        await submitScore(GAMES.HIGHER_LOWER, finalStreak);
        const my = await fetchMyBest(GAMES.HIGHER_LOWER);
        saveEl.textContent = `Saved. Your best this week: ${my.weekly} · all-time: ${my.allTime}.`;
      } catch {
        saveEl.textContent = 'Could not save your score, but here’s the leaderboard.';
      }
      renderLeaderboardInto(document.getElementById('hl-leaderboard'), GAMES.HIGHER_LOWER);
    }

    paintRound();
  });

  return `
    ${Header()}
    <main class="wrap guess-game">
      <a class="game-back" href="/games">← Games</a>
      <div id="hl-board" class="guess-board"></div>
    </main>
    ${Footer()}
  `;
}
