import { supabase, isSupabaseReady } from './supabase.js';
import { navigate } from './router.js';

// ---------------------------------------------------------------------------
// Auth module.
//
// The whole app calls isSignedIn() / currentUser() SYNCHRONOUSLY from inside
// render functions that return HTML strings. Supabase session reads are async.
// We bridge that with a module-level cache: initAuth() loads the session once
// at boot, onAuthStateChange keeps it fresh, and the sync getters read the
// cache. main.js awaits initAuth() before startRouter().
// ---------------------------------------------------------------------------

let cachedUser = null;     // decorated user object, or null
let authReady = false;     // has the first session load completed?

// Optional hook fired on a sign-in/sign-out transition, BEFORE we navigate.
// main.js registers one to refresh the profile cache so the header shows the
// cook's uploaded avatar immediately on first sign-in (no reload needed).
// Kept as a callback (not a direct import) to avoid an auth ⇄ profileCache
// circular import — profileCache.js already imports from this module.
let onTransition = null;
export function onAuthTransition(fn) {
  onTransition = typeof fn === 'function' ? fn : null;
}

// Decorate a raw Supabase user with a convenient isAdmin flag.
function decorate(user) {
  if (!user) return null;
  const role = user.app_metadata?.role || user.user_metadata?.role || null;
  return { ...user, isAdmin: role === 'admin' };
}

// Call once at boot, before startRouter(). Loads the current session and
// subscribes to changes so the sync getters stay accurate.
export async function initAuth() {
  if (!isSupabaseReady()) {
    authReady = true;
    return;
  }

  const { data } = await supabase.auth.getSession();
  cachedUser = decorate(data.session?.user ?? null);
  authReady = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    const next = decorate(session?.user ?? null);
    const was = cachedUser?.id ?? null;
    cachedUser = next;
    // Re-render the current route so guards/UI reflect the new state.
    // Only navigate on an actual transition to avoid redirect loops.
    if ((was === null) !== (next === null)) {
      // Refresh dependent caches (e.g. the profile/avatar cache) first, THEN
      // navigate, so the first paint after sign-in already has the avatar.
      Promise.resolve(onTransition?.(next)).finally(() => {
        navigate(next ? '/home' : '/');
      });
    }
  });
}

// ---- Synchronous getters (safe to call from render functions) -------------
export function isSignedIn() {
  return Boolean(cachedUser);
}

export function currentUser() {
  return cachedUser;
}

export function isAdmin() {
  return Boolean(cachedUser?.isAdmin);
}

export function authIsReady() {
  return authReady;
}

// ---- Sign-in: Google OAuth ------------------------------------------------
export async function signInWithGoogle() {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
}

// ---- Sign-in: magic link --------------------------------------------------
export async function signInWithEmail(email) {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
  return { sent: true };
}

// ---- Sign-out -------------------------------------------------------------
export async function signOut() {
  if (isSupabaseReady()) {
    await supabase.auth.signOut();
  }
  cachedUser = null;
}
