import { Header, Footer } from '../components/layout.js';
import { onMount } from '../lib/router.js';
import { signIn } from '../lib/auth.js';
import { navigate } from '../lib/router.js';

export function Auth() {
  onMount(() => {
    const google = document.querySelector('[data-action="google"]');
    const magic = document.querySelector('[data-action="magic"]');
    const panel = document.getElementById('auth-panel');

    google?.addEventListener('click', () => {
      signIn('Sumi');
      navigate('/home');
    });

    magic?.addEventListener('click', () => {
      const email = document.getElementById('email').value.trim();
      if (!email) {
        document.getElementById('email').focus();
        return;
      }
      // Mocked magic-link: show the "check your inbox" state.
      panel.innerHTML = `
        <h2>Check your inbox</h2>
        <p class="sub">We sent a sign-in link to <strong>${email}</strong>.</p>
        <div class="inbox-state">
          <p>Open the email and tap the link to finish signing in.</p>
        </div>
        <div class="divider">demo</div>
        <button class="btn btn-primary btn-block" data-action="simulate">Simulate clicking the link</button>
      `;
      panel.querySelector('[data-action="simulate"]').addEventListener('click', () => {
        signIn(email.split('@')[0]);
        navigate('/home');
      });
    });
  });

  return `
    ${Header()}
    <main>
      <div class="panel" id="auth-panel">
        <h2>Join Thaali</h2>
        <p class="sub">Free forever. One step and you're in.</p>
        <button class="btn btn-ghost btn-block" data-action="google">Continue with Google</button>
        <div class="divider">or</div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" placeholder="you@example.com" autocomplete="email" />
        </div>
        <button class="btn btn-primary btn-block" data-action="magic">Send me a sign-in link</button>
      </div>
    </main>
    ${Footer()}
  `;
}
