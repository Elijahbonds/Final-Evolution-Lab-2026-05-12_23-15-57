// Room codes + peer identity.

import { customAlphabet } from 'nanoid';

// No 0/O/1/I/L — these get read off a TV across a room and typed on a phone,
// and every ambiguous glyph is a support ticket.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/**
 * SIX characters (mission Phase B: "shows a 6-char join code + QR").
 *
 * This was 4, which is ~923k combinations — ample against collision, but thin against GUESSING: with a few
 * hundred live rooms a random four-character try lands in a stranger's game about once in ten thousand
 * attempts, and what it lands on is a controller slot in that game. Six characters is ~887 million, which
 * ends that without costing anything a player notices: the readability problem was never the length, it was
 * ambiguous glyphs, and the alphabet above still excludes every one of them.
 */
const newCode = customAlphabet(CODE_ALPHABET, 6);
export const ROOM_CODE_LEN = 6;

/** Short, human-transcribable room code (6 chars, ~887M combinations). */
export function makeRoomCode(): string {
  return newCode();
}

const newId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

const PEER_KEY = 'fel.controller.peerId';

/**
 * A device's stable identity. Persisted so that a phone which drops WiFi and
 * reconnects is recognised as the SAME player and gets its slot back, rather
 * than showing up as a second ghost player in the lobby.
 */
export function getOrCreatePeerId(): string {
  if (typeof window === 'undefined') return newId();
  try {
    const existing = window.localStorage.getItem(PEER_KEY);
    if (existing) return existing;
    const fresh = newId();
    window.localStorage.setItem(PEER_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage blocked — a per-tab id still works for one session,
    // it just cannot survive a reload.
    return newId();
  }
}

/** Absolute URL a phone opens to join. Must be same-origin as the host page. */
export function joinUrl(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/controller/${code}`;
}
