import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn } from '../lib/auth.js';
import { recipes } from '../lib/mockData.js';
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
          <div class="game-card-emoji">🍲</div>
          <h3>Guess the Recipe</h3>
          <p>See a photo and a few ingredients — can you name the dish? 10 rounds, beat your best.</p>
          <span class="game-card-cta">Play →</span>
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

// Pull readable ingredient names (handles both structured and simple/raw shapes).
function ingredientNames(r) {
  const arr = Array.isArray(r.ingredients) ? r.ingredients : [];
  const out = [];
  for (const ing of arr) {
    if (typeof ing === 'string') { if (ing.trim()) out.push(ing.trim()); continue; }
    if (ing && typeof ing === 'object') {
      const name = ing.item || ing.raw || '';
      if (name && String(name).trim()) out.push(String(name).trim());
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

    async function loadLeaderboard() {
      const el = document.getElementById('guess-leaderboard');
      try {
        const { window: win, rows } = await fetchLeaderboard(GAMES.GUESS);
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
