// lib/party/social/persist.ts — what a party page keeps on this device (PARTY-CHAT lane, 2026-10-13).
//
//   THE PARTY TOKEN  sessionStorage `fel.party.session`: {code, resume, at}. Per tab, so a reload of this tab rejoins the
//                    same party as the same member (netd's resume secret) and a second tab does not steal the place.
//                    Stale after RESUME_GRACE_MS + a minute: netd has let the place go by then.
//   BLOCKS           localStorage `fel.party.blocks`: [{pub, name}]. A block outlives the party: `pub` is netd's stable,
//                    opaque handle for an account (an HMAC of the id, never the id), so the same person is hidden in
//                    every later party. A guest's handle is per party, so a guest block lasts that party.
//   MUTES            localStorage `fel.party.mutes`: [pub]. "I don't want to hear them" without blocking.
//   VOICE PREFS      localStorage `fel.party.voice`: {ptt}. Push-to-talk on or off.
//
// No message, no name typed by anyone else, and no account id is ever stored. Every access is wrapped: private mode,
// blocked storage or a quota error means "nothing remembered", never a crash.

import { RESUME_GRACE_MS } from '@/server/netd/src/partyRules';

const SESSION_KEY = 'fel.party.session';
const BLOCKS_KEY = 'fel.party.blocks';
const MUTES_KEY = 'fel.party.mutes';
const VOICE_KEY = 'fel.party.voice';
const LIST_MAX = 200;

export interface StoredParty { code: string; resume: string; at: number }

function read<T>(store: 'local' | 'session', key: string): T | null {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
function write(store: 'local' | 'session', key: string, value: unknown): void {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key); else s.setItem(key, JSON.stringify(value));
  } catch { /* nothing remembered */ }
}

export function loadStoredParty(now: number = Date.now()): StoredParty | null {
  const p = read<StoredParty>('session', SESSION_KEY);
  if (!p || typeof p.code !== 'string' || typeof p.resume !== 'string' || typeof p.at !== 'number') return null;
  if (now - p.at > RESUME_GRACE_MS + 60_000) { write('session', SESSION_KEY, null); return null; }
  return p;
}
export function storeParty(p: StoredParty | null): void { write('session', SESSION_KEY, p); }

export interface BlockEntry { pub: string; name: string }
export function loadBlocks(): BlockEntry[] {
  const l = read<BlockEntry[]>('local', BLOCKS_KEY);
  return Array.isArray(l) ? l.filter((b) => b && typeof b.pub === 'string').slice(-LIST_MAX) : [];
}
export function saveBlocks(l: BlockEntry[]): void { write('local', BLOCKS_KEY, l.slice(-LIST_MAX)); }

export function loadMutes(): string[] {
  const l = read<string[]>('local', MUTES_KEY);
  return Array.isArray(l) ? l.filter((x) => typeof x === 'string').slice(-LIST_MAX) : [];
}
export function saveMutes(l: string[]): void { write('local', MUTES_KEY, l.slice(-LIST_MAX)); }

export interface VoicePrefs { ptt: boolean }
export function loadVoicePrefs(): VoicePrefs {
  const v = read<VoicePrefs>('local', VOICE_KEY);
  return { ptt: v?.ptt === true };
}
export function saveVoicePrefs(v: VoicePrefs): void { write('local', VOICE_KEY, v); }
