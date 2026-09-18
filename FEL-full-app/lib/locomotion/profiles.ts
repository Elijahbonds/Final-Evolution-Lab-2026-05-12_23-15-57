// LOCOMOTION CORE — per-mode profiles (Phase 1, 2026-09-12).
//
// DATA ONLY. Adding a mode means adding a profile here; it must never mean editing the core.
// Numbers for basketball and the board family are carried across from the systems Phase 0
// measured, so this module starts by reproducing today's feel rather than silently retuning
// eight games at once:
//   basketball  <- CourtMovement.ts:42-47 (accel 26, decel 34, plant x1.4, turn 540 deg/s)
//   board       <- BoardMovement.ts SKATE_TUNING
//   combat      <- Biomech.lockOnYaw's 9 rad/s cap (~516 deg/s), BIOMECH-WAVE2

import type { LocomotionProfile, RingClips } from './types';

/** The live clip set (clipRegistry.ts:32-36) has no diagonals, no backpedal and no slide.
 *  Points left undefined fall back to their nearest authored neighbour in BlendSpace2D, so
 *  the core is correct today and simply gets better as clips are authored. */
const IDLE: RingClips = { speed: 0, dirs: { F: 'idle_stand' } };
const WALK: RingClips = { speed: 1.6, dirs: { F: 'walk', L: 'strafe_left', R: 'strafe_right' } };
const RUN: RingClips = { speed: 4.2, dirs: { F: 'run', L: 'strafe_left', R: 'strafe_right' } };
const SPRINT: RingClips = { speed: 6.4, dirs: { F: 'run' } };
const SLIDE: RingClips = { speed: 2.4, dirs: { L: 'strafe_left', R: 'strafe_right' } };

const base = {
  rings: { idle: IDLE, shuffle: WALK, jog: RUN, sprint: SPRINT },
  minBlendSec: 0.08,     // the brief's 80ms floor: no clip enters at full weight
  minStateSec: 0.12,     // the brief's 120ms hysteresis guard
} as const;

export const PROFILES: Readonly<Record<string, LocomotionProfile>> = {
  basketball_onball: {
    ...base, id: 'basketball_onball', facingMode: 'TARGET_LOCK',
    accel: 26, decel: 34, plantDecel: 34 * 1.4, maxSpeed: 6.4,
    maxTurnRateDegPerSec: 540, turnInPlaceSpeed: 0.6, turnInPlaceThresholdDeg: 45,
    plantCutSpeed: 4.0, slideRing: SLIDE,
  },
  basketball_offball: {
    ...base, id: 'basketball_offball', facingMode: 'HYBRID',
    accel: 26, decel: 34, plantDecel: 34 * 1.4, maxSpeed: 6.4,
    maxTurnRateDegPerSec: 620, turnInPlaceSpeed: 0.6, turnInPlaceThresholdDeg: 50,
    plantCutSpeed: 4.4, slideRing: SLIDE,
  },
  basketball_defense: {
    ...base, id: 'basketball_defense', facingMode: 'TARGET_LOCK',
    accel: 22, decel: 34, plantDecel: 34 * 1.4, maxSpeed: 4.8,
    maxTurnRateDegPerSec: 480, turnInPlaceSpeed: 0.5, turnInPlaceThresholdDeg: 40,
    plantCutSpeed: 3.4, slideRing: SLIDE,
  },
  karate: {
    ...base, id: 'karate', facingMode: 'TARGET_LOCK',
    accel: 20, decel: 30, plantDecel: 40, maxSpeed: 3.6,
    maxTurnRateDegPerSec: 516, turnInPlaceSpeed: 0.4, turnInPlaceThresholdDeg: 35,
    plantCutSpeed: 2.6, slideRing: SLIDE,
  },
  skate: {
    ...base, id: 'skate', facingMode: 'VELOCITY',
    accel: 8, decel: 6, plantDecel: 18, maxSpeed: 8.2,
    maxTurnRateDegPerSec: 220, turnInPlaceSpeed: 0.3, turnInPlaceThresholdDeg: 90,
    plantCutSpeed: 6.0,
  },
  surf: {
    ...base, id: 'surf', facingMode: 'VELOCITY',
    accel: 7, decel: 5, plantDecel: 14, maxSpeed: 7.4,
    maxTurnRateDegPerSec: 200, turnInPlaceSpeed: 0.3, turnInPlaceThresholdDeg: 90,
    plantCutSpeed: 5.5,
  },
  snowboard: {
    ...base, id: 'snowboard', facingMode: 'VELOCITY',
    accel: 9, decel: 5, plantDecel: 16, maxSpeed: 12.0,
    maxTurnRateDegPerSec: 190, turnInPlaceSpeed: 0.3, turnInPlaceThresholdDeg: 90,
    plantCutSpeed: 7.0,
  },
  generic_run: {
    ...base, id: 'generic_run', facingMode: 'HYBRID',
    accel: 24, decel: 30, plantDecel: 38, maxSpeed: 5.8,
    maxTurnRateDegPerSec: 560, turnInPlaceSpeed: 0.6, turnInPlaceThresholdDeg: 45,
    plantCutSpeed: 4.0,
  },
};

export function profile(id: string): LocomotionProfile {
  const p = PROFILES[id];
  if (!p) throw new Error(`[locomotion] unknown profile "${id}" — add it to profiles.ts, never branch in the core`);
  return p;
}
