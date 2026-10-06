// lib/soundtrack/runTrack.ts — PIPELINES (owner, 2026-10-06, plan K4: "board runs pick a track via the dock").
//
// The player picks one soundtrack track in the dock ("Play this under my games"); the in-game bed (ModeHarness enterBed,
// which every board run gets) then plays THAT track instead of shuffling the bed pool, for as long as it stays in the
// catalogue. No shared mode file is touched: the dock is the only picker. On this device only (localStorage), and
// cleared from the same place. Pure apart from the storage it is handed.

import type { SoundtrackTrack } from './types';

export const RUN_TRACK_KEY = 'fel:soundtrack:runTrack';
const ID_RE = /^(house|card):[A-Za-z0-9_-]{1,120}$/;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function readRunTrack(s: Store | null = store()): string | null {
  try { const v = s?.getItem(RUN_TRACK_KEY) ?? null; return v && ID_RE.test(v) ? v : null; } catch { return null; }
}

export function setRunTrack(id: string | null, s: Store | null = store()): void {
  try { if (id && ID_RE.test(id)) s?.setItem(RUN_TRACK_KEY, id); else s?.removeItem(RUN_TRACK_KEY); } catch { /* storage off */ }
}

/** The bed's pool: the pinned track alone while it is in the catalogue, else `fallback` (the bed's own mood pool). */
export function bedPool(tracks: readonly SoundtrackTrack[], pinned: string | null, fallback: SoundtrackTrack[]): SoundtrackTrack[] {
  const t = pinned ? tracks.find((x) => x.id === pinned) : undefined;
  return t ? [t] : fallback;
}
