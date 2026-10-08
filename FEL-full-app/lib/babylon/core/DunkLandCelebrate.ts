// DunkLandCelebrate — the live landing + celebration timeline (DUNK-LAND-CELEBRATE, 2026-09-30).
// Pure module: contact → heel-down → absorb bottom → rise → celebration start / end → hold end.
// DunkMode reads it; DunkCuts' d-pad map is reused for thrown picks.
import { CELEBRATIONS, RIVAL_CELEB, type CelebId, type Bands } from './DunkCuts';
import { CELEB_ROAR_SEC, CELEB_TOO_SMALL_SEC, CELEB_ITS_OVER_SEC, CELEB_SPIDERMAN_SEC } from '../anim/authored/dunkCelebrations';
import { LAND_ABSORB_SEC, HEEL_DOWN_T, ABSORB_BOTTOM_T, RISE_START_T } from '../anim/authored/dunkLandAbsorb';

export const DUNK_LAND_ABSORB_CLIP = 'dunk_land_absorb';
export const CELEB_BLEND_SEC = 0.22;
export const CELEB_TARGET_SEC = 1.5;
export const CELEB_TOLERANCE_SEC = 0.3;
export const MISS_HOLD_MS = 380;

export type RotCelebId = 'roar' | 'toosmall' | 'itsover';
const ROTATION: readonly RotCelebId[] = ['roar', 'toosmall', 'itsover'];

export interface LandCelebrateTimeline {
  contactSec: number;
  heelDownSec: number;
  absorbBottomSec: number;
  riseStartSec: number;
  celebStartSec: number;
  celebEndSec: number;
  holdEndSec: number;
}

export function landCelebrateTimeline(celebSec: number, made: boolean): LandCelebrateTimeline {
  const celebStart = made ? RISE_START_T : LAND_ABSORB_SEC;
  const celebEnd = made ? celebStart + celebSec : celebStart;
  const holdEnd = made ? celebEnd : HEEL_DOWN_T + MISS_HOLD_MS / 1000;
  return {
    contactSec: 0,
    heelDownSec: HEEL_DOWN_T,
    absorbBottomSec: ABSORB_BOTTOM_T,
    riseStartSec: RISE_START_T,
    celebStartSec: celebStart,
    celebEndSec: celebEnd,
    holdEndSec: made ? celebEnd : LAND_ABSORB_SEC,
  };
}

export function celebDuration(id: CelebId): number {
  switch (id) {
    case 'spiderman': return CELEB_SPIDERMAN_SEC;
    case 'itsover': return CELEB_ITS_OVER_SEC;
    case 'roar': return CELEB_ROAR_SEC;
    case 'toosmall': return CELEB_TOO_SMALL_SEC;
    case 'armsup': return 0.9;
    default: return CELEB_TARGET_SEC;
  }
}

const pick = <T>(xs: readonly T[], seed: number): T => xs[Math.abs(Math.floor(seed)) % xs.length];

/** assumption: rotation set is roar → too_small → it's over, never the same twice in a row. */
export function nextRotation(last: RotCelebId | null, seed: number): RotCelebId {
  const pool = last ? ROTATION.filter((c) => c !== last) : ROTATION;
  return pick(pool, seed);
}

/** assumption: every make celebrates live; Spider-Man is d-pad only; armsup is not in the rotation. */
export function pickLiveCelebration(o: {
  made: boolean;
  chosen?: CelebId | null;
  rivalId?: string | null;
  total: number;
  bands: Bands;
  seed?: number;
  lastRot?: RotCelebId | null;
}): CelebId | null {
  if (!o.made) return null;
  if (o.chosen) return o.chosen;
  if (o.rivalId && o.total >= o.bands.approval) return RIVAL_CELEB[o.rivalId] ?? 'armsup';
  const seed = o.seed ?? o.total;
  return nextRotation(o.lastRot ?? null, seed);
}

export function celebStartMs(): number { return Math.round(RISE_START_T * 1000); }

/** Hold after feet-down before finishAttempt: landing + celebration on a make; unchanged on a miss. */
export function holdEndMs(made: boolean, celeb: CelebId | null): number {
  if (!made) return MISS_HOLD_MS;
  if (!celeb) return Math.round(LAND_ABSORB_SEC * 1000);
  return Math.round((RISE_START_T + celebDuration(celeb)) * 1000);
}

export function celebrationInRiseWindow(celebStartMs: number): boolean {
  const riseMs = RISE_START_T * 1000;
  return celebStartMs >= riseMs - 50 && celebStartMs <= riseMs + 100;
}

export function celebrationLengthOk(sec: number, id: CelebId): boolean {
  if (id === 'spiderman') return sec >= CELEB_SPIDERMAN_SEC - 0.05;
  return Math.abs(sec - CELEB_TARGET_SEC) <= CELEB_TOLERANCE_SEC;
}

export function clipFor(id: CelebId): string { return CELEBRATIONS[id].clip; }
