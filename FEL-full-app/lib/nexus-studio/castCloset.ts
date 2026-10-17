// "EDIT IN THE CLOSET" (track 3, studio-4b; docs/NEXUS-STUDIO.md §12). A project character is a Closet share code; the Closet
// Studio is its editor. This is the hand-off between the two, on THIS DEVICE only — nothing is sent anywhere:
//
//   Studio  → writes CLOSET_EDIT_KEY  { session, characterId, name, code } and opens /closet?studioEdit=<session> in a tab;
//   Closet  → reads that session (readClosetEdit), opens ONE character from the code, edits it with nothing saved to the account
//             or the device's own look, and on "Back to Nexus Studio" writes CLOSET_RETURN_KEY { session, characterId, code };
//   Studio  → hears the return (a `storage` event, or on focus) and applies it as ONE undo step (edits.ts setCharacterLook),
//             after decoding the code (a code that does not decode changes nothing).
//
// Both keys are cleared when the Studio takes the return. A session goes stale after CLOSET_EDIT_TTL_MS. Everything read here is
// untrusted (another tab, another build): shapes are checked, codes must be code-shaped, strings are capped.
//
// The Closet side is in components/closet-view.tsx, the creator lane's file. It was routed from studio-4b and applied on
// lane/closet-studio (§12.2, §12.5). The Studio also keeps the manual path: copy the code, paste the edited one back.
//
// Pure: storage is injected (storage.ts KV); no DOM, no fetch.

import { looksLikeCode } from './cast';
import { LIMITS } from './doc';
import type { KV } from './storage';

export const CLOSET_EDIT_KEY = 'fel.nexusStudio.closetEdit';
export const CLOSET_RETURN_KEY = 'fel.nexusStudio.closetReturn';
/** The Closet's query parameter that opens it on a Studio hand-off. */
export const CLOSET_EDIT_PARAM = 'studioEdit';
/** A hand-off older than this is not picked up (a tab left open overnight). */
export const CLOSET_EDIT_TTL_MS = 6 * 60 * 60 * 1000;

export interface ClosetEditSession { v: 1; session: string; characterId: string; name: string; code: string; at: number }
export interface ClosetEditReturn { v: 1; session: string; characterId: string; code: string; name?: string; at: number }

const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const ID = /^[A-Za-z0-9_:-]{1,64}$/;
type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const label = (x: unknown): string | undefined => {
  if (typeof x !== 'string') return undefined;
  const s = x.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.name);
  return s || undefined;
};
const read = (kv: KV | null, key: string): Json | null => {
  if (!kv) return null;
  try { const t = kv.getItem(key); if (!t || t.length > LIMITS.code + 2000) return null; const j = JSON.parse(t); return isObj(j) ? j : null; } catch { return null; }
};
const fresh = (at: unknown, now: number) => typeof at === 'number' && Number.isFinite(at) && at <= now + 60_000 && now - at <= CLOSET_EDIT_TTL_MS;

/** A fresh session id (unguessable enough for a same-device hand-off; it only pairs a tab with its return). */
export function newClosetSession(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 16; i++) s += Math.floor(rand() * 36).toString(36);
  return `ce_${s}`;
}

export const closetEditUrl = (session: string): string => `/closet?${CLOSET_EDIT_PARAM}=${encodeURIComponent(session)}`;

/** Studio side: hand a character to the Closet. Null when the character has no code or the device keeps nothing. */
export function startClosetEdit(kv: KV | null, c: { id: string; name: string; lookCode?: string }, now = Date.now(), session = newClosetSession()): { session: string; url: string } | null {
  if (!kv || !c.lookCode || !looksLikeCode(c.lookCode) || !ID.test(c.id)) return null;
  const s: ClosetEditSession = { v: 1, session, characterId: c.id, name: label(c.name) ?? 'Character', code: c.lookCode.replace(/\s+/g, ''), at: now };
  try { kv.removeItem(CLOSET_RETURN_KEY); kv.setItem(CLOSET_EDIT_KEY, JSON.stringify(s)); } catch { return null; }
  return { session, url: closetEditUrl(session) };
}

/** Closet side: the session this tab was opened for, or null (wrong id, stale, not a code). */
export function readClosetEdit(kv: KV | null, session: string | null | undefined, now = Date.now()): ClosetEditSession | null {
  if (!session || !SESSION.test(session)) return null;
  const j = read(kv, CLOSET_EDIT_KEY);
  if (!j || j.v !== 1 || j.session !== session || !fresh(j.at, now)) return null;
  if (typeof j.characterId !== 'string' || !ID.test(j.characterId) || !looksLikeCode(j.code)) return null;
  return { v: 1, session, characterId: j.characterId, name: label(j.name) ?? 'Character', code: (j.code as string).replace(/\s+/g, ''), at: j.at as number };
}

/** Closet side: hand the edited look back. False when the session is gone (taken, stale) or the code is not code-shaped. */
export function writeClosetReturn(kv: KV | null, session: string, code: string, name?: string, now = Date.now()): boolean {
  const s = readClosetEdit(kv, session, now);
  if (!s || !looksLikeCode(code)) return false;
  const r: ClosetEditReturn = { v: 1, session, characterId: s.characterId, code: code.replace(/\s+/g, ''), ...(label(name) ? { name: label(name) } : {}), at: now };
  try { kv!.setItem(CLOSET_RETURN_KEY, JSON.stringify(r)); return true; } catch { return false; }
}

/** Studio side: the return for `session`, if the Closet sent it — read once (both keys are cleared), or null. */
export function takeClosetReturn(kv: KV | null, session: string, now = Date.now()): ClosetEditReturn | null {
  const j = read(kv, CLOSET_RETURN_KEY);
  if (!j || j.v !== 1 || j.session !== session || !fresh(j.at, now)) return null;
  if (typeof j.characterId !== 'string' || !ID.test(j.characterId) || !looksLikeCode(j.code)) return null;
  try { kv!.removeItem(CLOSET_RETURN_KEY); kv!.removeItem(CLOSET_EDIT_KEY); } catch { /* the return is still good */ }
  const name = label(j.name);
  return { v: 1, session, characterId: j.characterId, code: (j.code as string).replace(/\s+/g, ''), ...(name ? { name } : {}), at: j.at as number };
}

/** Studio side: stop waiting (the creator cancelled): the hand-off keys go. */
export function cancelClosetEdit(kv: KV | null): void {
  try { kv?.removeItem(CLOSET_EDIT_KEY); kv?.removeItem(CLOSET_RETURN_KEY); } catch { /* nothing to do */ }
}
