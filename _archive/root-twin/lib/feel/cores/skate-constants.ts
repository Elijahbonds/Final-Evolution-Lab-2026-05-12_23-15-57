/**
 * lib/feel/cores/skate-constants.ts
 * =================================
 * M9 Step 4 — Skateboard skin tunables for the Ride/carve core.
 *
 * The proven engineering line kept ride numbers in `feelConfig.skate`, which
 * was NOT part of the six ported feel systems, so every value here is fresh
 * scaffolding for Elijah to dial in. All values // TUNE(elijah).
 *
 * A skate mode is a thin RideSkin: these constants + one rail resolver +
 * sensory presets. Adding this mode never edits the shared RideCore.
 */

import type { RideTuning, RideRail, RideSensoryEvent } from './ride-core';
import type { SensoryEvent, AirTrickOpts } from '../index';

/** Venice-strip skate feel. Every number // TUNE(elijah). */
export const SKATE_TUNING: RideTuning = {
  cruiseSpeed: 8.0, // TUNE(elijah) — m/s resting roll speed
  minSpeed: 3.0, // TUNE(elijah)
  maxSpeed: 16.0, // TUNE(elijah)
  pumpAccel: 6.0, // TUNE(elijah) — m/s^2 when pumping
  brakeDecel: 10.0, // TUNE(elijah) — m/s^2 when braking
  steerSpeed: 5.5, // TUNE(elijah) — lateral m/s at full stick
  laneHalfWidth: 4.5, // TUNE(elijah) — half the strip width (m)
  ollieImpulse: 5.2, // TUNE(elijah) — takeoff vertical velocity (m/s)
  setupMs: 90, // TUNE(elijah) — crouch/pop window before takeoff
  landMs: 160, // TUNE(elijah) — clean-landing recovery
  bailMs: 700, // TUNE(elijah) — crash recovery
  bailSpeed: 3.0, // TUNE(elijah) — speed you drop to on a bail
  hardLandingVy: 9.0, // TUNE(elijah) — impact speed above which you must stick or bail
  stripLength: 240, // TUNE(elijah) — endless-strip wrap length (m)
};

/** Ollie/kickflip rotation feel. // TUNE(elijah) */
export const SKATE_TRICK: AirTrickOpts = {
  perTapRotation: 0.5, // TUNE(elijah) — half a flip per tap
  cleanTolerance: 0.13, // TUNE(elijah)
  stickWindowMs: 160, // TUNE(elijah)
};

/** Scoring. // TUNE(elijah) */
export const SKATE_SCORING = {
  olliePoints: 40, // TUNE(elijah)
  trickPoints: 120, // TUNE(elijah)
  cleanBonus: 60, // TUNE(elijah)
};

/** The single grind rail on the Venice strip. Every number // TUNE(elijah). */
export const SKATE_RAIL: RideRail = {
  x: 1.6, // TUNE(elijah) — rail lateral offset
  y: 0.55, // TUNE(elijah) — rail height (m)
  zStart: -18, // TUNE(elijah) — where the rail begins (ahead of spawn)
  zEnd: -34, // TUNE(elijah) — where the rail ends (further down-strip)
  lockRadius: 1.4, // TUNE(elijah) — grind lock-on radius
  grindSpeed: 9.0, // TUNE(elijah) — slide speed along the rail (m/s)
  pointsPerSec: 180, // TUNE(elijah)
  snapMs: 200, // TUNE(elijah) — ArcDrive snap-to-rail time
};

/** SFX/shake presets per ride event. // TUNE(elijah). */
export const SKATE_SENSORY: Partial<Record<RideSensoryEvent, SensoryEvent>> = {
  ollie: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.5, shake: 0.05 }, // TUNE(elijah)
  landClean: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.6, shake: 0.18, hitStopMs: 40 }, // TUNE(elijah)
  landStuck: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.7, shake: 0.24, hitStopMs: 60, rumbleMs: 120 }, // TUNE(elijah)
  landSketchy: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.4, shake: 0.12 }, // TUNE(elijah)
  bail: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.9, shake: 0.5, hitStopMs: 120, rumbleMs: 300, rumbleStrength: 0.8 }, // TUNE(elijah)
  railContact: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.4, shake: 0.08 }, // TUNE(elijah)
  grindPop: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.55, shake: 0.1 }, // TUNE(elijah)
};
