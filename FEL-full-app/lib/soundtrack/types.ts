// lib/soundtrack/types.ts — CREATOR SOUNDTRACK (owner, 2026-10-06, "2K Beats for creators"): the shapes every piece of
// the soundtrack shares. Pure types and constants; safe in any bundle.

import type { Mood } from '@/lib/creator/creative-card-review';

export type TrackSource = 'house' | 'card';

/** One playable track, as the catalogue route serves it: slim, never the card's payload. */
export interface SoundtrackTrack {
  /** 'house:<songId>' or 'card:<creativeCardId>'. */
  id: string;
  source: TrackSource;
  title: string;
  /** Credit. `href` is the creator's published athlete card, or null (a teen, no card, or FEL's own house songs). */
  creator: { name: string; href: string | null };
  url: string;
  mime: string;
  durationSec: number;
  /** Gain that brings this track to the soundtrack's reference loudness (normalisation; clamped). */
  gainDb: number;
  bpm: number | null;
  /** A gap-free loop region, when the track has one (the Academy's walk-out loops do). */
  loop: { startSec: number; endSec: number } | null;
  moods: Mood[];
  plays: number;
  featured: boolean;
  coverUrl: string | null;
}

export interface SoundtrackCatalogue { tracks: SoundtrackTrack[]; generatedAt: string }

/**
 * Where the soundtrack is playing. `menu` and `loading` are the menus and the boot screens at the menu level; `bed` is
 * under a game; `end` is the end screen and replays; `off` is silent (a room with its own music holds focus, or the
 * player turned it off).
 */
export type SoundtrackStage = 'menu' | 'loading' | 'bed' | 'end' | 'off';

export const trackKey = {
  house: (songId: string) => `house:${songId}`,
  card: (cardId: string) => `card:${cardId}`,
};

/** 'house:x' → {source:'house', ref:'x'}; anything malformed → null. */
export function parseTrackId(id: unknown): { source: TrackSource; ref: string } | null {
  if (typeof id !== 'string') return null;
  const m = /^(house|card):([A-Za-z0-9_-]{1,120})$/.exec(id);
  return m ? { source: m[1] as TrackSource, ref: m[2] } : null;
}
