// Prototype auth state — purely in-memory, mocked.
// At the Supabase stage this is replaced by supabase.auth (Google OAuth +
// magic link), and the same isSignedIn()/getUser() interface stays.

let user = null;
const listeners = [];

export const isSignedIn = () => user !== null;
export const getUser = () => user;

export function signIn(displayName = 'Guest Cook') {
  user = { id: 'local', display_name: displayName };
  listeners.forEach((fn) => fn(user));
}

export function signOut() {
  user = null;
  listeners.forEach((fn) => fn(user));
}

export function onAuthChange(fn) { listeners.push(fn); }
