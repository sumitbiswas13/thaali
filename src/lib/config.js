// ---------------------------------------------------------------------------
// Public client config. These values are safe to ship in the browser bundle.
//
// VITE_TURNSTILE_SITE_KEY is the Cloudflare Turnstile *site* key (public, meant
// to be embedded in the page). The *secret* key lives only on the server side
// (the contact Function) and is never exposed here.
//
// If the var is unset, the contact form simply renders without the CAPTCHA and
// the server Function won't enforce it — so the form keeps working until you
// turn Turnstile on.
// ---------------------------------------------------------------------------

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
