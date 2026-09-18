// Active dance-routine store — the bridge that makes a saved dance card fire as a
// dunk celebration. A published dance card carries its DanceStep[] inline
// (ArtPayload.kind==='dance'); "equip" stashes the sequence + bpm here and the
// next made dunk plays it on the avatar. Round-trip: create → save → reload →
// perform in-game.

import type { DanceStep } from '@/lib/creator/creative-card-types';

export interface EquippedRoutine { steps: DanceStep[]; bpm: number }

const KEY = 'fel:danceRoutine';

/** A built-in celebration used when the player hasn't equipped one: exactly 3
 * clips, one MIRRORED — the acceptance shape, so a dunk always celebrates. */
export const DEFAULT_CELEBRATION: EquippedRoutine = {
  bpm: 100, // TUNE(elijah)
  steps: [
    { clipId: 'dance_toprock_basic', beat: 0, holdBeats: 2, mirrored: false },
    { clipId: 'dance_wave_arm',      beat: 2, holdBeats: 1, mirrored: true  },
    { clipId: 'dance_trans_spin',    beat: 3, holdBeats: 1, mirrored: false },
  ],
};

export function setEquippedRoutine(r: EquippedRoutine): void {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage disabled */ }
}

export function getEquippedRoutine(): EquippedRoutine {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EquippedRoutine;
      if (parsed?.steps?.length) return parsed;
    }
  } catch { /* fall through */ }
  return DEFAULT_CELEBRATION;
}

export function clearEquippedRoutine(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
