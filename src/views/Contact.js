import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn, currentUser } from '../lib/auth.js';
import { TURNSTILE_SITE_KEY } from '../lib/config.js';

const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;

function esc(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function Contact() {
  if (!isSignedIn()) {
    navigate('/auth');
    return '';
  }

  const user = currentUser();
  const email = user?.email || '';

  // If no site key is configured, the form still works (the Function only
  // enforces Turnstile when ITS secret is set). We just skip rendering the
  // widget and leave the Send button enabled.
  const captchaOn = Boolean(TURNSTILE_SITE_KEY);

  onMount(() => {
    const subject = document.getElementById('c-subject');
    const message = document.getElementById('c-message');
    const subjCount = document.getElementById('c-subject-count');
    const msgCount = document.getElementById('c-message-count');
    const sendBtn = document.querySelector('[data-action="send-contact"]');
    const status = document.getElementById('c-status');

    let captchaToken = null;

    const sync = () => {
      subjCount.textContent = `${subject.value.length}/${SUBJECT_MAX}`;
      msgCount.textContent = `${message.value.length}/${MESSAGE_MAX}`;
    };
    subject.addEventListener('input', sync);
    message.addEventListener('input', sync);
    sync();

    // --- Turnstile (explicit render — required for an SPA where the form
    //     mounts after page load) ---------------------------------------------
    let widgetId = null;
    if (captchaOn) {
      sendBtn.disabled = true; // gated until the green check
      const renderWidget = () => {
        if (!window.turnstile) return false;
        widgetId = window.turnstile.render('#c-turnstile', {
          sitekey: TURNSTILE_SITE_KEY,
          action: 'contact',
          callback: (token) => {
            captchaToken = token;
            sendBtn.disabled = false;
          },
          'expired-callback': () => {
            captchaToken = null;
            sendBtn.disabled = true;
          },
          'error-callback': () => {
            captchaToken = null;
            sendBtn.disabled = true;
          },
        });
        return true;
      };
      // The script may still be loading; poll briefly until it's ready.
      if (!renderWidget()) {
        const iv = setInterval(() => {
          if (renderWidget()) clearInterval(iv);
        }, 200);
        setTimeout(() => clearInterval(iv), 8000);
      }
    }

    sendBtn.addEventListener('click', async () => {
      const subj = subject.value.trim();
      const msg = message.value.trim();
      if (!subj) {
        status.textContent = 'Please add a subject.';
        subject.focus();
        return;
      }
      if (!msg) {
        status.textContent = 'Please add a message.';
        message.focus();
        return;
      }
      if (captchaOn && !captchaToken) {
        status.textContent = 'Please complete the verification below.';
        return;
      }

      sendBtn.disabled = true;
      status.textContent = 'Sending…';
      try {
        const resp = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            subject: subj,
            message: msg,
            turnstileToken: captchaToken,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          throw new Error(data.error || 'Could not send your message.');
        }
        // Replace the form with a thank-you state.
        document.getElementById('contact-panel').innerHTML = `
          <h2>Message sent</h2>
          <p class="sub">Thanks for getting in touch. We read every note and will
          reply to <strong>${esc(email)}</strong> if a response is needed.</p>
          <a class="btn btn-ghost" href="/home">Back to recipes</a>
        `;
      } catch (err) {
        status.textContent = err.message || 'Could not send your message.';
        // Re-arm: the token is single-use, so reset the widget for a retry.
        captchaToken = null;
        if (captchaOn && window.turnstile && widgetId !== null) {
          window.turnstile.reset(widgetId);
          sendBtn.disabled = true;
        } else {
          sendBtn.disabled = false;
        }
      }
    });
  });

  return `
    ${Header()}
    <main>
      <div class="panel" id="contact-panel">
        <h2>Contact &amp; support</h2>
        <p class="lede-serif">
          Found a bug, got a question, or dreamed up something that'd make Thaali
          better? We're all ears — drop us a line below and a real person will read it.
        </p>

        <div class="field">
          <label for="c-email">Your email</label>
          <input id="c-email" type="email" value="${esc(email)}" readonly disabled
            aria-readonly="true" />
        </div>

        <div class="field">
          <label for="c-subject">
            Subject
            <span class="char-count muted" id="c-subject-count">0/${SUBJECT_MAX}</span>
          </label>
          <input id="c-subject" type="text" maxlength="${SUBJECT_MAX}"
            placeholder="What's this about?" autocomplete="off" />
        </div>

        <div class="field">
          <label for="c-message">
            Message
            <span class="char-count muted" id="c-message-count">0/${MESSAGE_MAX}</span>
          </label>
          <textarea id="c-message" rows="6" maxlength="${MESSAGE_MAX}"
            placeholder="Tell us what's on your mind — issues, concerns, or suggestions."></textarea>
        </div>

        ${captchaOn ? `<div class="cf-turnstile-wrap"><div id="c-turnstile"></div></div>` : ''}

        <button class="btn btn-primary btn-block" data-action="send-contact">Send message</button>
        <p class="auth-status" id="c-status"></p>
      </div>
    </main>
    ${Footer()}
  `;
}
