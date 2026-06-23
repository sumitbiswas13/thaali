import { Header, Footer } from '../components/layout.js';

// Route: #/terms → Thaali's terms of service. PUBLIC — no auth guard.

const UPDATED = 'June 23, 2026';

export function Terms() {
  return `
    ${Header()}
    <main class="wrap legal-page">
      <h1>Terms of Service</h1>
      <p class="muted">Last updated: ${UPDATED}</p>

      <p>
        Welcome to Thaali, a free community cookbook at
        <a href="https://thaali.app">thaali.app</a>. By creating an account or
        using the service, you agree to these terms. Please read them — they’re
        short.
      </p>

      <h2>Using Thaali</h2>
      <ul class="legal-list">
        <li>You must be at least 13 years old to use Thaali.</li>
        <li>
          You’re responsible for activity on your account. Keep your sign-in
          method secure.
        </li>
        <li>
          Thaali is provided free of charge, for personal, non-commercial use.
        </li>
      </ul>

      <h2>Your content</h2>
      <ul class="legal-list">
        <li>
          You keep ownership of the recipes, photos, and comments you post.
        </li>
        <li>
          By posting content, you grant Thaali permission to display and
          distribute it within the service so other members can view it.
        </li>
        <li>
          You’re responsible for what you post. Only share content you have the
          right to share, and make imported recipes your own by adding your own
          contribution.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Please don’t use Thaali to:</p>
      <ul class="legal-list">
        <li>Post unlawful, harmful, hateful, or infringing content.</li>
        <li>Harass, impersonate, or mislead others.</li>
        <li>Spam, scrape, or disrupt the service or other members.</li>
        <li>Attempt to gain unauthorized access to the service or its data.</li>
      </ul>
      <p>
        Members can report content that breaks these rules, and we may remove
        content or suspend accounts that violate them.
      </p>

      <h2>Moderation</h2>
      <p>
        We review reported content and may edit or remove content, or remove
        accounts, at our discretion to keep Thaali safe and welcoming. Where
        possible we favor a light touch.
      </p>

      <h2>Account deletion</h2>
      <p>
        You can request deletion of your account at any time from
        <a href="#/account">Your account</a>. See our
        <a href="#/privacy">Privacy Policy</a> for how data is handled when an
        account is deleted.
      </p>

      <h2>No warranty</h2>
      <p>
        Thaali is provided “as is,” without warranties of any kind. We do our
        best to keep it running and accurate, but we can’t guarantee it will
        always be available, error-free, or that recipes will turn out perfectly.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, Thaali is not liable for any indirect or
        consequential damages arising from your use of the service.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms from time to time. When we do, we’ll revise the
        “last updated” date above. Continued use of Thaali after changes means
        you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Reach us through our
        <a href="#/contact">contact form</a>.
      </p>
    </main>
    ${Footer()}
  `;
}
