// Room codes + peer identity.

import { customAlphabet } from 'nanoid';

// No 0/O/1/I/L — these get read off a TV across a room and typed on a phone,
// and every ambiguous glyph is a support ticket.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const newCode = customAlphabet(CODE_ALPHABET, 4);

/** Short, human-transcribable room code (4 chars, ~923k combinations). */
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
