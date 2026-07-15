import { Header, Footer } from '../components/layout.js';
import { onMount } from '../lib/router.js';
import { signInWithGoogle, signInWithEmail } from '../lib/auth.js';

export function Auth() {
  onMount(() => {
    const google = document.querySelector('[data-action="google"]');
    const magic = document.querySelector('[data-action="magic"]');
    const panel = document.getElementById('auth-panel');

    google?.addEventListener('click', async () => {
      google.disabled = true;
      try {
        await signInWithGoogle();
        // Browser redirects to Google; on return, the session is detected and
        // main.js's auth listener navigates to /home automatically.
      } catch (err) {
        google.disabled = false;
        alert(err.message || 'Google sign-in failed.');
      }
    });

    magic?.addEventListener('click', async () => {
      const input = document.getElementById('email');
      const email = input.value.trim();
      if (!email || !email.includes('@')) {
        input.focus();
        return;
      }
      magic.disabled = true;
      try {
        await signInWithEmail(email);
        panel.innerHTML = `
          <h2>Check your inbox</h2>
          <p class="sub">We sent a sign-in link to <strong>${esc(email)}</strong>.</p>
          <div class="inbox-state">
            <p>Open the email and tap the link to finish signing in. You can close this tab.</p>
          </div>
        `;
      } catch (err) {
        magic.disabled = false;
        alert(err.message || 'Could not send the sign-in link.');
      }
    });
  });

  return `
    ${Header()}
    <main>
      <div class="panel" id="auth-panel">
        <h2>Join Thaali — free, forever.</h2>
        <p class="sub">No ads, no paywall, no selling your data — ever. Reading recipes doesn't even need an account. We ask for an email so you have one: it's what lets you save recipes, comment, follow cooks, and share your own.</p>
        <button class="btn btn-ghost btn-block" data-action="google">Continue with Google</button>
        <div class="divider">or</div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" placeholder="you@example.com" autocomplete="email" />
        </div>
        <button class="btn btn-primary btn-block" data-action="magic">Send me a sign-in link</button>
        <p class="auth-fineprint">We use your email only to sign you in and secure your account — no marketing, no spam, and we never sell it.</p>
      </div>
    </main>
    ${Footer()}
  `;
}

// Escape user input before it's injected into innerHTML (the confirmation
// message echoes the typed email). Low risk since a cook can only feed their
// own input back to themselves, but raw interpolation into HTML is a sink we
// close on principle.
function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
