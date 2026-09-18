/**
 * lib/feel/cores/snowboard-constants.ts
 * =====================================
 * M9 Step 5 — Snowboard skin tunables for the Ride/carve core.
 *
 * Reference: reference__SnowboardMode.js — "ride/carve skin on the skate core
 * (steeper + faster; the rail is a rock ledge)". Same archetype as the
 * skateboard, dialled steeper and faster with a themed rock-ledge rail.
 *
 * The proven line kept these under `feelConfig.snowboard`, which was NOT part
 * of the six ported feel systems, so every value here is fresh scaffolding.
 * All values // TUNE(elijah).
 */

import type { RideTuning, RideRail, RideSensoryEvent } from './ride-core';
import type { SensoryEvent, AirTrickOpts } from '../index';

/** Alpine board feel — steeper + faster than skate. Every number // TUNE(elijah). */
export const SNOWBOARD_TUNING: RideTuning = {
  cruiseSpeed: 11.0, // TUNE(elijah) — faster resting glide
  minSpeed: 5.0, // TUNE(elijah)
  maxSpeed: 22.0, // TUNE(elijah) — steeper slope tops out higher
  pumpAccel: 7.5, // TUNE(elijah)
  brakeDecel: 8.0, // TUNE(elijah) — edges bite less than pavement
  steerSpeed: 6.5, // TUNE(elijah) — wider carve
  laneHalfWidth: 6.0, // TUNE(elijah) — wider run
  ollieImpulse: 6.4, // TUNE(elijah) — bigger kicker air
  setupMs: 100, // TUNE(elijah)
  landMs: 180, // TUNE(elijah)
  bailMs: 800, // TUNE(elijah) — wipeouts cost more in powder
  bailSpeed: 4.0, // TUNE(elijah)
  hardLandingVy: 11.0, // TUNE(elijah) — faster/steeper → higher hard-landing bar
  stripLength: 300, // TUNE(elijah) — longer alpine run
};

/** Board-grab / spin feel. // TUNE(elijah) */
export const SNOWBOARD_TRICK: AirTrickOpts = {
  perTapRotation: 0.5, // TUNE(elijah)
  cleanTolerance: 0.14, // TUNE(elijah) — slightly more forgiving in snow
  stickWindowMs: 180, // TUNE(elijah)
};

/** Scoring. // TUNE(elijah) */
export const SNOWBOARD_SCORING = {
  olliePoints: 50, // TUNE(elijah)
  trickPoints: 150, // TUNE(elijah)
  cleanBonus: 80, // TUNE(elijah)
};

/** The rock-ledge "rail". Every number // TUNE(elijah). */
export const SNOWBOARD_RAIL: RideRail = {
  x: 2.2, // TUNE(elijah)
  y: 0.7, // TUNE(elijah) — ledge sits higher
  zStart: -24, // TUNE(elijah)
  zEnd: -46, // TUNE(elijah) — longer ledge
  lockRadius: 1.8, // TUNE(elijah) — easier lock in snow
  grindSpeed: 12.0, // TUNE(elijah) — faster slide
  pointsPerSec: 220, // TUNE(elijah)
  snapMs: 220, // TUNE(elijah)
};

/** Theme colours (for the eventual live scene). // TUNE(elijah). */
export const SNOWBOARD_THEME = {
  stripColor: '#E8EEF4', // TUNE(elijah)
  railColor: '#8A8F98', // TUNE(elijah)
  playerColor: '#D0552E', // TUNE(elijah)
};

/** SFX/shake presets per ride event. // TUNE(elijah). */
export const SNOWBOARD_SENSORY: Partial<Record<RideSensoryEvent, SensoryEvent>> = {
  ollie: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.55, shake: 0.06 }, // TUNE(elijah)
  landClean: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.55, shake: 0.2, hitStopMs: 45 }, // TUNE(elijah)
  landStuck: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.65, shake: 0.26, hitStopMs: 70, rumbleMs: 140 }, // TUNE(elijah)
  landSketchy: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.4, shake: 0.14 }, // TUNE(elijah)
  bail: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.95, shake: 0.55, hitStopMs: 130, rumbleMs: 340, rumbleStrength: 0.85 }, // TUNE(elijah)
  railContact: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.45, shake: 0.09 }, // TUNE(elijah)
  grindPop: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.6, shake: 0.12 }, // TUNE(elijah)
};
