import { supabase } from './supabase.js';
import { recipes } from './mockData.js';
import {
  fetchLikeCounts,
  fetchCommentCounts,
  fetchLikeCountsSince,
  fetchCommentCountsSince,
} from './social.js';

// ---------------------------------------------------------------------------
// Banner — the home-page hero image.
//
// Two sources, in priority order:
//   1. OCCASION banner: an admin-managed row in `banners` whose date window
//      contains now() (festivals, food days, etc). Highest priority wins.
//   2. AUTO fallback: the single top "dish of the week" by the same score the
//      Trending strip uses (likes + 2×comments, 7-day window, all-time
//      fallback). No row needed — computed from live data.
//
// loadBanner() runs once at boot (before first paint) so the hero knows which
// shape to render on first render — no empty-then-pop flash. The image file
// itself still streams in async, but the layout is decided up front.
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 7;

// Populated by loadBanner() at boot; read synchronously by the Landing view.
// shape: { kind: 'occasion', image_url, alt, link_url }
//      | { kind: 'dish', recipe }       (auto fallback, a live recipe object)
//      | null                            (nothing to show — plain hero)
export let activeBanner = null;

// Fetch the current occasion banner (if any). Returns the row or null.
// The date-window + active filter is applied here, not in SQL policy, so an
// expired/future row sitting in the table is simply ignored.
export async function fetchOccasionBanner() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .eq('active', true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return data && data.length ? data[0] : null;
}

// Pick the single top recipe for the auto "dish of the week".
//
// Ranks by engagement earned IN THE LAST 7 DAYS (likes + 2×comments whose
// created_at falls in the window) — so the featured dish reflects what the
// community is engaging with *now* and rotates as that shifts, instead of
// getting permanently stuck on the all-time most-liked recipe.
//
// If NOTHING was engaged with this week (a quiet week), fall back to the
// all-time top so the hero is never empty. Ties broken by newest recipe, so a
// fresh dish edges out an older one at equal score.
async function topDishOfWeek() {
  const all = recipes || [];
  if (all.length === 0) return null;
  try {
    const ids = all.map((r) => r.id);
    const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Recent-window engagement first.
    const [wLikes, wComments] = await Promise.all([
      fetchLikeCountsSince(ids, sinceIso),
      fetchCommentCountsSince(ids, sinceIso),
    ]);
    const recentScore = (r) => (wLikes.get(r.id) || 0) + 2 * (wComments.get(r.id) || 0);

    const newest = (r) => (r.created_at ? new Date(r.created_at).getTime() : 0);
    const pick = (pool, scoreFn) =>
      [...pool].sort((a, b) => scoreFn(b) - scoreFn(a) || newest(b) - newest(a))[0] || null;

    const recentlyEngaged = all.filter((r) => recentScore(r) > 0);
    if (recentlyEngaged.length > 0) {
      return pick(recentlyEngaged, recentScore);
    }

    // Quiet week — fall back to all-time top so the hero still shows something.
    const [aLikes, aComments] = await Promise.all([
      fetchLikeCounts(ids),
      fetchCommentCounts(ids),
    ]);
    const allScore = (r) => (aLikes.get(r.id) || 0) + 2 * (aComments.get(r.id) || 0);
    const engaged = all.filter((r) => allScore(r) > 0);
    if (engaged.length === 0) return null; // nothing has any engagement yet
    return pick(engaged, allScore);
  } catch {
    return null;
  }
}

// Boot entry point. Resolves activeBanner. Never throws — a banner is
// decorative, so any failure just yields a plain hero.
export async function loadBanner() {
  try {
    const occ = await fetchOccasionBanner();
    if (occ && occ.image_url) {
      activeBanner = {
        kind: 'occasion',
        image_url: occ.image_url,
        alt: occ.alt || '',
        link_url: occ.link_url || null,
      };
      return activeBanner;
    }
    const dish = await topDishOfWeek();
    activeBanner = dish ? { kind: 'dish', recipe: dish } : null;
  } catch {
    activeBanner = null;
  }
  return activeBanner;
}

// ---------------------------------------------------------------------------
// Admin CRUD + storage upload (used only by the Admin banner panel).
// ---------------------------------------------------------------------------

// List ALL banners (any status/date) for the admin panel, newest first.
export async function fetchAllBanners() {
  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Downscale + re-encode in the browser before upload (mirrors recipes.js).
// Banners are wide hero images, so cap the long edge higher than recipe cards.
async function downscale(file, maxEdge = 1600, quality = 0.85) {
  if (!('createImageBitmap' in window)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale >= 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file; // unsupported — upload original
  }
}

// Upload a banner image to the `banners` bucket; return its public URL.
// Path: banners/<timestamp>.<ext>. Admin-only by bucket RLS.
export async function uploadBannerImage(file) {
  const payload = await downscale(file);
  const ext = (payload.type || file.type || '').includes('png') ? 'png' : 'jpg';
  const path = `${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('banners')
    .upload(path, payload, {
      upsert: true,
      cacheControl: '3600',
      contentType: payload.type || file.type || 'image/jpeg',
    });
  if (upErr) throw new Error(upErr.message);
  const { data } = supabase.storage.from('banners').getPublicUrl(path);
  return data.publicUrl;
}

// Insert a banner row. `fields` = { image_url, alt, link_url, starts_at,
// ends_at, priority, active }. Admin-only by table RLS.
export async function createBanner(fields) {
  const { data, error } = await supabase
    .from('banners')
    .insert(fields)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Flip a banner's active flag (the quick on/off kill switch).
export async function setBannerActive(id, active) {
  const { error } = await supabase
    .from('banners')
    .update({ active })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Permanently remove a banner row. (The image file in storage is left in
// place — harmless, and avoids accidentally breaking a row that reuses it.)
export async function deleteBanner(id) {
  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
