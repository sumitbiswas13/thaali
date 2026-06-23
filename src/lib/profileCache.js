// ---------------------------------------------------------------------------
// Profile cache.
//
// The header renders synchronously (it returns an HTML string), but a cook's
// uploaded avatar lives in the async `profiles` table — not in the auth
// session. This mirrors the auth session-cache pattern: loadOwnProfile() runs
// once at boot (after initAuth), and cachedAvatarUrl() / cachedProfile() read
// the result synchronously from render code.
//
// When the cook saves a new photo, setCachedProfile() updates the cache so the
// header reflects it immediately, no reload needed.
// ---------------------------------------------------------------------------

import { fetchProfile, ensureOwnProfile } from './profiles.js';
import { currentUser } from './auth.js';

let cachedProfile = null;

// Load the signed-in user's profile into the cache. Call once at boot, after
// initAuth(), and again on each sign-in transition. Safe when signed out.
//
// On a brand-new cook's first sign-in the DB trigger creates their profile row,
// but a redirect-back race can mean fetchProfile() runs a beat too early and
// sees no row. ensureOwnProfile() closes that gap by creating the row if it's
// missing, so the cache is always populated for a signed-in cook.
export async function loadOwnProfile() {
  const user = currentUser();
  if (!user) {
    cachedProfile = null;
    return null;
  }
  try {
    cachedProfile = (await fetchProfile(user.id)) || (await ensureOwnProfile());
  } catch {
    cachedProfile = null; // header falls back to the Google photo / initial
  }
  return cachedProfile;
}

// Synchronous read for render code.
export function cachedProfileData() {
  return cachedProfile;
}

// The uploaded avatar URL, or null if none / not loaded yet.
export function cachedAvatarUrl() {
  return cachedProfile?.avatar_url || null;
}

// Update the cache after an edit so the header refreshes without a reload.
export function setCachedProfile(profile) {
  cachedProfile = profile || null;
}

// Clear on sign-out.
export function clearCachedProfile() {
  cachedProfile = null;
}
