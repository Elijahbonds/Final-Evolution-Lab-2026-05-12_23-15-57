// lib/soundtrack/musicPayload.ts — CREATOR SOUNDTRACK: the one adapter between a music card's payload and the soundtrack.
//
// lane/create-hub owns the payload v2 contract in lib/creator/creative-card-types.ts (the plan's piece A: mixUrl, mime,
// bytes, durationSec, loudnessLufs, loop {startSec,endSec}, origin, rights {text,version,at}, chart, bars, moods). Until
// it lands, this reads that shape defensively from the stored JSON, so nothing in lib/soundtrack imports a type that does
// not exist yet. When C's types land, only this file changes. Pure.
//
// A v1 music card (2-bar WAV stems, no mix) is not playable as a soundtrack: readMusicV2 returns null for it.

import { MOODS, type Mood } from '@/lib/creator/creative-card-review';
import { isValidRights, type RightsRecord } from './rights';

/** What the browser can be asked to play; a track in another type is left out of the catalogue. */
export const PLAYABLE_MIME = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/wav'] as const;
export const MAX_TRACK_SEC = 240;

export interface MusicV2 {
  mixUrl: string;
  mime: string;
  durationSec: number;
  loudnessLufs: number | null;
  loop: { startSec: number; endSec: number } | null;
  moods: Mood[];
  bpm: number | null;
  coverArtUrl: string | null;
  origin: 'academy' | 'maker' | 'upload' | 'house' | null;
  rights: RightsRecord | null;
}

const num = (v: unknown, lo: number, hi: number): number | null =>
  (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const https = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\/\S+$/i.test(v) && v.length <= 600 ? v : null);

/** The playable part of a music card, or null when it has none (v1 stems, a bad URL, no length, too long). */
export function readMusicV2(art: unknown): MusicV2 | null {
  const a = (art ?? {}) as Record<string, unknown>;
  if (a.kind !== 'music') return null;
  const mixUrl = https(a.mixUrl);
  const mime = typeof a.mime === 'string' && (PLAYABLE_MIME as readonly string[]).includes(a.mime) ? a.mime : null;
  const durationSec = num(a.durationSec, 1, MAX_TRACK_SEC);
  if (!mixUrl || !mime || durationSec === null) return null;
  const l = (a.loop ?? null) as Record<string, unknown> | null;
  const ls = l ? num(l.startSec, 0, durationSec) : null;
  const le = l ? num(l.endSec, 0, durationSec) : null;
  const moods = Array.isArray(a.moods) ? [...new Set(a.moods.filter((m): m is Mood => (MOODS as readonly unknown[]).includes(m)))] : [];
  const origin = ['academy', 'maker', 'upload', 'house'].includes(String(a.origin)) ? a.origin as MusicV2['origin'] : null;
  return {
    mixUrl, mime, durationSec,
    loudnessLufs: num(a.loudnessLufs, -70, 0),
    loop: ls !== null && le !== null && le - ls >= 1 ? { startSec: ls, endSec: le } : null,
    moods,
    bpm: num(a.bpm, 40, 300),
    coverArtUrl: https(a.coverArtUrl),
    origin,
    rights: isValidRights(a.rights) ? a.rights : null,
  };
}
