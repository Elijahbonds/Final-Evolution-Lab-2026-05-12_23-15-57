/**
 * lib/feel/cores/big-air-constants.ts
 * ===================================
 * M9 Step 7 — Big Air skin tunables for the Air-session core.
 *
 * Big Air's identity (LINEUP_SPEC): NEGATIVE runDrag = the SLOPE builds your
 * speed on its own; the kicker launch scales with the speed you carry in;
 * spins in the air; landing judge (stuck/clean/sketchy/crash) over multiple
 * attempts per round. No cadence taps are needed — the hill does the work —
 * so the cadence impulses below exist only so a rider CAN skate-push for a
 * touch more speed; the slope alone reaches the kicker.
 *
 * The proven engineering line kept these in `feelConfig.bigAir`, which was
 * NOT among the ported feel systems, so every value here is fresh scaffolding
 * for Elijah to dial in. All values // TUNE(elijah).
 *
 * A big-air mode is a thin AirSessionSkin: these constants + sensory presets.
 * Adding this mode never edits the shared AirSessionCore.
 */

import type { AirSessionTuning, AirSessionSensoryEvent } from './air-session-core';
import type { SensoryEvent, AirTrickOpts } from '../index';

/** Venice/alpine big-air feel. Every number // TUNE(elijah). */
export const BIG_AIR_TUNING: AirSessionTuning = {
  runDrag: -7.5, // TUNE(elijah) — NEGATIVE: the slope ACCELERATES you (m/s^2)
  maxRunSpeed: 26.0, // TUNE(elijah) — terminal slope speed (m/s)
  perfectImpulse: 2.0, // TUNE(elijah) — optional skate-push in the run-up
  goodImpulse: 1.1, // TUNE(elijah)
  faultSpeedMult: 0.85, // TUNE(elijah) — a stumble barely dents slope speed
  launchZ: -60, // TUNE(elijah) — kicker sits 60m down the hill
  baseLaunch: 6.5, // TUNE(elijah) — minimum pop off the lip (m/s)
  speedLaunchBonus: 7.5, // TUNE(elijah) — extra pop at full slope speed (m/s)
  airForwardMin: 6.0, // TUNE(elijah) — you keep flying forward off a big kicker
  airForwardFactor: 0.85, // TUNE(elijah)
  basePoints: 100, // TUNE(elijah)
  pointsPerRotation: 140, // TUNE(elijah) — big spins score big
  gradePoints: {
    stuck: 2.0, // TUNE(elijah)
    clean: 1.0, // TUNE(elijah)
    sketchy: 0.5, // TUNE(elijah)
    crash: 0, // TUNE(elijah)
  },
  attemptsPerRound: 3, // TUNE(elijah) — three hits down the hill
  landBeatMs: 900, // TUNE(elijah) — beat between attempts
  cadenceTargetMs: 260, // TUNE(elijah) — push rhythm (optional here)
  cadencePerfectMs: 45, // TUNE(elijah)
  cadenceGoodMs: 95, // TUNE(elijah)
};

/** Big-air spin feel — bigger tolerance than a skate flip (huge airtime). // TUNE(elijah) */
export const BIG_AIR_TRICK: AirTrickOpts = {
  perTapRotation: 0.5, // TUNE(elijah) — half a spin per tap
  cleanTolerance: 0.15, // TUNE(elijah)
  stickWindowMs: 220, // TUNE(elijah) — generous stick window on a big landing
};

/** SFX/shake presets per air-session event. // TUNE(elijah). */
export const BIG_AIR_SENSORY: Partial<Record<AirSessionSensoryEvent, SensoryEvent>> = {
  launch: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.6, shake: 0.08 }, // TUNE(elijah)
  trickTap: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.4 }, // TUNE(elijah)
  landClean: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.7, shake: 0.14, hitStopMs: 50 }, // TUNE(elijah)
  landStuck: { sfx: '/audio/sfx_crowd_cheer.mp3', volume: 0.9, shake: 0.2, hitStopMs: 90, rumbleMs: 160, rumbleStrength: 0.7 }, // TUNE(elijah)
  landSketchy: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.5, shake: 0.1 }, // TUNE(elijah)
  landCrash: { sfx: '/audio/sfx_punch_impact.mp3', volume: 1.0, shake: 0.3, hitStopMs: 110, rumbleMs: 320, rumbleStrength: 0.9 }, // TUNE(elijah)
};
