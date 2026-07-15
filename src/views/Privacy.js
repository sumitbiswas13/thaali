import { Header, Footer } from '../components/layout.js';

// Route: /privacy → Thaali's privacy policy. PUBLIC — no auth guard, so it's
// reachable by anyone (and by Google's OAuth brand-verification reviewer, who
// is not signed in). Plain informational content; no data collection here.

const UPDATED = 'July 14, 2026';

export function Privacy() {
  return `
    ${Header()}
    <main class="wrap legal-page">
      <h1>Privacy Policy</h1>
      <p class="muted">Last updated: ${UPDATED}</p>

      <p class="lede-serif">
        Thaali is a free, ad-free community cookbook — built by cooks, for everyone.
        Here's exactly what we collect, why, and the say you have in it. It's short and
        plain on purpose, because that's how we run: <strong>no ads, no paywall, and
        we never sell your data — ever.</strong>
      </p>

      <h2>Why we ask for an email</h2>
      <p>
        Thaali is free and always will be — no ads, no paywall, no premium tier,
        and we never sell your data. You don't even need an account to <em>read</em>
        recipes; those are open to everyone. We ask for an email for one reason: so
        you have an account. It's your login, and it's what lets you like and
        comment, follow the cooks you love, and save and share your own recipes.
        We use it only to sign you in and to contact you about your account if we
        ever need to — never marketing, never spam. <strong>An account, not a
        price.</strong>
      </p>

      <h2>Who we are</h2>
      <p>
        Thaali (“we”, “us”) operates the website at
        <a href="https://thaali.app">thaali.app</a>. You can reach us any time
        through our <a href="/contact">contact form</a>.
      </p>

      <h2>Information we collect</h2>
      <p>We collect only what we need to run the cookbook:</p>
      <ul class="legal-list">
        <li>
          <strong>Account information.</strong> When you sign in with Google, we
          receive your name, email address, and profile picture from your Google
          account. If you sign in with a magic link instead, we receive your
          email address. We use this to create and identify your account.
        </li>
        <li>
          <strong>Profile details you provide.</strong> Anything you choose to
          add to your profile — a display name, bio, country, or an avatar image
          you upload.
        </li>
        <li>
          <strong>Content you create.</strong> Recipes you write or import,
          photos you upload, comments, likes, and follows.
        </li>
        <li>
          <strong>Basic technical data.</strong> Standard information your
          browser sends (such as your IP address) and minimal logs needed to
          keep the service secure and working.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul class="legal-list">
        <li>To create your account and let you sign in.</li>
        <li>To publish and display the recipes, photos, and comments you post.</li>
        <li>To show your name and avatar alongside content you create.</li>
        <li>To respond when you contact us for support.</li>
        <li>To keep the service secure and prevent abuse.</li>
      </ul>
      <p>
        We use the data Google provides solely to operate your Thaali account as
        described above. We do not use it for advertising, and we do not sell or
        rent it to anyone.
      </p>

      <h2>What we don’t do</h2>
      <ul class="legal-list">
        <li>We don’t show ads.</li>
        <li>We don’t sell, rent, or trade your personal information.</li>
        <li>We don’t use your data to train advertising profiles.</li>
      </ul>

      <h2>How your information is shared</h2>
      <p>
        Recipes you publish — along with their photos, your display name, and your
        avatar — are <strong>public</strong>: they can be viewed by anyone on the
        web, including search engines like Google, so people can find and cook them.
        Comments, likes, and follows are visible to other signed-in members. We do
        not otherwise share your personal information, except:
      </p>
      <ul class="legal-list">
        <li>
          <strong>Service providers</strong> that help us run Thaali, namely
          Supabase (database, authentication, and file storage), Cloudflare
          (hosting), and Brevo (sending support and notification emails). These
          providers process data only to provide their services to us.
        </li>
        <li>
          <strong>Legal reasons</strong>, if we are required by law to disclose
          information.
        </li>
      </ul>

      <h2>Data storage and security</h2>
      <p>
        Your data is stored with our hosting and database providers and
        protected with industry-standard safeguards. No method of storage or
        transmission is perfectly secure, but we take reasonable steps to protect
        your information.
      </p>

      <h2>Your choices and rights</h2>
      <ul class="legal-list">
        <li>You can edit your profile and your content at any time while signed in.</li>
        <li>
          You can request deletion of your account from your account page
          (<a href="/account">Your account</a>). When an account is deleted, your
          profile and associated data are removed; you may choose whether your
          recipes are deleted or kept and shown as “A Thaali cook”.
        </li>
        <li>
          You can also revoke Thaali’s access to your Google account at any time
          from your
          <a href="https://myaccount.google.com/permissions">Google Account permissions</a>.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Thaali is not directed to children under 13, and we do not knowingly
        collect personal information from them.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. When we do, we’ll revise the
        “last updated” date above. Significant changes will be reflected on this
        page.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach us through our
        <a href="/contact">contact form</a>.
      </p>
    </main>
    ${Footer()}
  `;
}
