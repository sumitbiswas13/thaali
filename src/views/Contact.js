import { Header, Footer } from '../components/layout.js';
import { onMount, navigate } from '../lib/router.js';
import { isSignedIn, currentUser } from '../lib/auth.js';

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

  onMount(() => {
    const subject = document.getElementById('c-subject');
    const message = document.getElementById('c-message');
    const subjCount = document.getElementById('c-subject-count');
    const msgCount = document.getElementById('c-message-count');
    const sendBtn = document.querySelector('[data-action="send-contact"]');
    const status = document.getElementById('c-status');

    const sync = () => {
      subjCount.textContent = `${subject.value.length}/${SUBJECT_MAX}`;
      msgCount.textContent = `${message.value.length}/${MESSAGE_MAX}`;
    };
    subject.addEventListener('input', sync);
    message.addEventListener('input', sync);
    sync();

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

      sendBtn.disabled = true;
      status.textContent = 'Sending…';
      try {
        const resp = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, subject: subj, message: msg }),
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
          <a class="btn btn-ghost" href="#/home">Back to recipes</a>
        `;
      } catch (err) {
        sendBtn.disabled = false;
        status.textContent = err.message || 'Could not send your message.';
      }
    });
  });

  return `
    ${Header()}
    <main>
      <div class="panel" id="contact-panel">
        <h2>Contact &amp; support</h2>
        <p class="sub">
          Hit a bug, have a concern, or an idea to make Thaali better? Send it our
          way through this form — we'd love to hear from you.
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

        <button class="btn btn-primary btn-block" data-action="send-contact">Send message</button>
        <p class="auth-status" id="c-status"></p>
      </div>
    </main>
    ${Footer()}
  `;
}
