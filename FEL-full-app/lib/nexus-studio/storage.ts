// SAVE AND LOAD (docs/NEXUS-STUDIO.md §2.1). Browser-local first: the project in localStorage, an autosave a beat after
// the last change, and a JSON file out and in. No server: no /api/studio route stores a project (cartridges are paid
// marketplace listings), and this lane changes no schema.
//
// Storage is injected (`KV`) so every path — a full quota, a private window that throws on access, a blob another build
// wrote — is tested in node. Nothing here throws: a failed write says why, a bad read is `null`.

import { parseProject, serializeProject, type StudioProject } from './doc';
import { parseVenueExport, type StudioVenueExport } from './exportVenue';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const PROJECT_KEY = 'fel.nexusStudio.v1';
export const PLAYTEST_PREFIX = 'fel.nexusStudio.playtest.';
/** Autosave this long after the last change. */
export const AUTOSAVE_MS = 1500;

/** The browser's localStorage, or null where touching it throws (a private window, blocked site data, SSR). */
export function browserKV(): KV | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__fel_ns_probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch { return null; }
}

export type SaveResult = { ok: true; bytes: number } | { ok: false; error: string };

export function saveProject(kv: KV | null, p: StudioProject): SaveResult {
  if (!kv) return { ok: false, error: 'this browser is not keeping site data — export the project to keep it' };
  const text = JSON.stringify(p);
  try {
    kv.setItem(PROJECT_KEY, text);
    return { ok: true, bytes: text.length };
  } catch (e) {
    const quota = e instanceof Error && /quota/i.test(`${e.name} ${e.message}`);
    return { ok: false, error: quota ? 'this device is out of room for the project — export it to a file' : 'the project could not be saved on this device' };
  }
}

export function loadProject(kv: KV | null): StudioProject | null {
  if (!kv) return null;
  let text: string | null = null;
  try { text = kv.getItem(PROJECT_KEY); } catch { return null; }
  if (!text) return null;
  const r = parseProject(text);
  return r.ok ? r.project : null;
}

/** The download: the whole project, pretty-printed, under a file name made from its name. */
export function exportFile(p: StudioProject): { name: string; text: string; type: string } {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
  return { name: `${slug}.nexus.json`, text: serializeProject(p), type: 'application/json' };
}

// ── the play-test hand-off ───────────────────────────────────────────────────────────────────────────────────────────

/** A venue id as it may appear in a URL and a storage key. */
const VENUE_REF = /^[A-Za-z0-9_-]{1,64}$/;

export function writePlaytest(kv: KV | null, exp: StudioVenueExport): SaveResult {
  if (!kv) return { ok: false, error: 'no site storage to hand the venue over — use the inline link' };
  if (!VENUE_REF.test(exp.venueId)) return { ok: false, error: 'bad venue id' };
  const text = JSON.stringify(exp);
  try { kv.setItem(PLAYTEST_PREFIX + exp.venueId, text); return { ok: true, bytes: text.length }; }
  catch { return { ok: false, error: 'the venue could not be handed to the mode on this device' }; }
}

export function readPlaytest(kv: KV | null, venueId: string): StudioVenueExport | null {
  if (!kv || !VENUE_REF.test(venueId)) return null;
  let text: string | null = null;
  try { text = kv.getItem(PLAYTEST_PREFIX + venueId); } catch { return null; }
  if (!text) return null;
  return parseVenueExport(text);
}

// base64url without Buffer (the browser) or btoa (node < 16 has Buffer; both have TextEncoder)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function toB64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}
function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < s.length ? B64.indexOf(s[i + k]) : -1));
    const n = (c[0] << 18) | (Math.max(0, c[1]) << 12) | (Math.max(0, c[2]) << 6) | Math.max(0, c[3]);
    out.push((n >> 16) & 255);
    if (c[2] >= 0) out.push((n >> 8) & 255);
    if (c[3] >= 0) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

/** The longest inline export a link carries (a URL past ~8 kB is cut by some servers and proxies). */
export const INLINE_MAX = 6000;

/** `b64:<base64url JSON>` for `?venue=`, or null when the venue is too big to ride a link. */
export function encodeInline(exp: StudioVenueExport): string | null {
  const s = 'b64:' + toB64url(new TextEncoder().encode(JSON.stringify(exp)));
  return s.length <= INLINE_MAX ? s : null;
}

export function decodeInline(v: string): StudioVenueExport | null {
  if (!v.startsWith('b64:') || v.length > INLINE_MAX) return null;
  const bytes = fromB64url(v.slice(4));
  if (!bytes) return null;
  try { return parseVenueExport(new TextDecoder().decode(bytes)); } catch { return null; }
}
