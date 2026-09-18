/**
 * lib/feel/cores/surf-constants.ts
 * ================================
 * M9 Step 6 — Surf skin tunables for the Ride/carve core.
 *
 * Reference: reference__SurfMode.js — "ride/carve skin on the skate core
 * (wide + flowing; the rail is the wave-lip trim line)". Same archetype as the
 * skateboard, tuned wide + flowing: broad lane, floaty airs, gentle braking,
 * and the "rail" is the wave-lip trim line you ride for points.
 *
 * The proven line kept these under `feelConfig.surf`, which was NOT part of the
 * six ported feel systems, so every value here is fresh scaffolding.
 * All values // TUNE(elijah).
 */

import type { RideTuning, RideRail, RideSensoryEvent } from './ride-core';
import type { SensoryEvent, AirTrickOpts } from '../index';

/** Wave-face surf feel — wide + flowing. Every number // TUNE(elijah). */
export const SURF_TUNING: RideTuning = {
  cruiseSpeed: 9.0, // TUNE(elijah) — flowing glide down the line
  minSpeed: 4.0, // TUNE(elijah)
  maxSpeed: 18.0, // TUNE(elijah)
  pumpAccel: 5.0, // TUNE(elijah) — pumping the face builds speed gently
  brakeDecel: 5.5, // TUNE(elijah) — water carries you; braking is soft
  steerSpeed: 8.0, // TUNE(elijah) — wide, sweeping carves
  laneHalfWidth: 7.5, // TUNE(elijah) — the widest run of the ride modes
  ollieImpulse: 5.6, // TUNE(elijah) — floaty off-the-lip air
  setupMs: 120, // TUNE(elijah) — a longer wind-up to launch off the lip
  landMs: 200, // TUNE(elijah) — flowing re-entry
  bailMs: 750, // TUNE(elijah)
  bailSpeed: 3.5, // TUNE(elijah)
  hardLandingVy: 10.0, // TUNE(elijah)
  stripLength: 320, // TUNE(elijah) — a long wave
};

/** Air-reverse / spin feel. // TUNE(elijah) */
export const SURF_TRICK: AirTrickOpts = {
  perTapRotation: 0.5, // TUNE(elijah)
  cleanTolerance: 0.15, // TUNE(elijah) — forgiving, flowing style
  stickWindowMs: 200, // TUNE(elijah) — a longer window to set the rail on re-entry
};

/** Scoring. // TUNE(elijah) */
export const SURF_SCORING = {
  olliePoints: 45, // TUNE(elijah)
  trickPoints: 140, // TUNE(elijah)
  cleanBonus: 70, // TUNE(elijah)
};

/** The wave-lip trim line, ridden like a rail. Every number // TUNE(elijah). */
export const SURF_RAIL: RideRail = {
  x: 3.0, // TUNE(elijah) — the lip sits out toward the shoulder
  y: 0.4, // TUNE(elijah) — trim line is low, near the face
  zStart: -20, // TUNE(elijah)
  zEnd: -50, // TUNE(elijah) — a long trim section
  lockRadius: 2.4, // TUNE(elijah) — wide, forgiving trim lock
  grindSpeed: 11.0, // TUNE(elijah)
  pointsPerSec: 200, // TUNE(elijah)
  snapMs: 260, // TUNE(elijah) — a smooth, flowing set onto the line
};

/** Theme colours (for the eventual live scene). // TUNE(elijah). */
export const SURF_THEME = {
  stripColor: '#2E6E8E', // TUNE(elijah)
  railColor: '#EAF6FA', // TUNE(elijah)
  playerColor: '#F2C14E', // TUNE(elijah)
};

/** SFX/shake presets per ride event. // TUNE(elijah). */
export const SURF_SENSORY: Partial<Record<RideSensoryEvent, SensoryEvent>> = {
  ollie: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.45, shake: 0.04 }, // TUNE(elijah)
  landClean: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.5, shake: 0.14, hitStopMs: 30 }, // TUNE(elijah)
  landStuck: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.6, shake: 0.2, hitStopMs: 55, rumbleMs: 120 }, // TUNE(elijah)
  landSketchy: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.35, shake: 0.1 }, // TUNE(elijah)
  bail: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.85, shake: 0.45, hitStopMs: 110, rumbleMs: 300, rumbleStrength: 0.75 }, // TUNE(elijah)
  railContact: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.4, shake: 0.06 }, // TUNE(elijah)
  grindPop: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.5, shake: 0.08 }, // TUNE(elijah)
};
