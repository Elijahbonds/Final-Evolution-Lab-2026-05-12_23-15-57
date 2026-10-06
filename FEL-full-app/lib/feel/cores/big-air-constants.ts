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
import type { AirHill } from './air-hill';
import type { SensoryEvent, AirTrickOpts } from '../index';

/** Venice/alpine big-air feel. Every number // TUNE(elijah). */
export const BIG_AIR_TUNING: AirSessionTuning = {
  // IMPROVE (2026-10-06, item 8) TUNED −7.5 → −5.0: the slope alone hit the 26 m/s cap 17 m before the lip, so strides could
  // add nothing and the run-up had no decision. At −5.0 the slope alone carries 24.5 m/s off the lip — just short of the
  // landing (BIG_AIR_HILL's sweet band is ~24.9–28.3 m/s) — a few strides top it up, boost buys air, too much overshoots.
  runDrag: -5.0, // TUNE(elijah) — NEGATIVE: the slope ACCELERATES you (m/s^2)
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
  pointsNeedTrick: true, // MECHANICS PASS: a straight air off the kicker scores nothing — throw a spin
  pointsPerRotation: 140, // TUNE(elijah) — big spins score big
  gradePoints: {
    stuck: 2.0, // TUNE(elijah)
    clean: 1.0, // TUNE(elijah)
    sketchy: 0.5, // TUNE(elijah)
    crash: 0, // TUNE(elijah)
  },
  // IMPROVE (2026-10-06, item 10) TUNED: the same rotation (direction + half turn) landed again pays 75 %, then 50 %, then
  // 25 % — the judge ignored variety, so one spin five times was the optimal session. ComboChain's own first steps.
  repeatDecay: [1, 0.75, 0.5, 0.25],
  attemptsPerRound: 5, // FIELD-DEPTH W4: three attempts ended in ~22 s — five gives a real final
  landBeatMs: 900, // TUNE(elijah) — beat between attempts
  cadenceTargetMs: 260, // TUNE(elijah) — push rhythm (optional here)
  cadencePerfectMs: 45, // TUNE(elijah)
  cadenceGoodMs: 95, // TUNE(elijah)
};

/**
 * IMPROVE (2026-10-06, items 1 / 2 / 8): THE JUMP (lib/feel/cores/air-hill.ts draws it). The rider used to pop off bare snow
 * at z −60 (the only "kicker" was a 0.5 m box at z −12) and land every air to flat from ~12 m. Now: an 8 m kicker up to a
 * 2 m lip AT launchZ, a 26 m gap, a 10 m table from z −96 to the knuckle at −117, and a 20° landing to the run-out at
 * ~−144.5. Flights carry 70+ m, so the landing is a launch-SPEED window (measured: ~24.9–28.3 m/s lands on it; the
 * test pins it): slower knuckles on the table, faster overshoots onto the flat — both never better than sketchy.
 * TUNED (new): every number below. The table is high and the landing shallow because the flight descends at ~45° and the
 * world's ground is flat at y 0 — a steeper landing would make the speed window a fraction of a m/s.
 */
export const BIG_AIR_HILL: AirHill = {
  kickerLen: 8, // TUNE(elijah) — the kicker's ramp (m)
  lipY: 2, // TUNE(elijah) — the lip's height (m)
  deckFrontZ: -86, // TUNE(elijah) — the landing's front face meets the snow here (45° up to the table)
  deckY: 10, // TUNE(elijah) — the table / knuckle height (m)
  knuckleZ: -117, // TUNE(elijah) — the knuckle; the landing falls away from here
  landPitchDeg: 20, // TUNE(elijah) — the landing slope
  knuckleRoundM: 1.5, // TUNE(elijah) — the knuckle's roll still counts as the knuckle
};

/** Big-air spin feel — bigger tolerance than a skate flip (huge airtime). // TUNE(elijah) */
export const BIG_AIR_TRICK: AirTrickOpts = {
  perTapRotation: 0.5, // TUNE(elijah) — unused while spinRatePerSec is set (kept for a discrete fallback)
  // Owner decision 2026-09-07: the spin is TIME-BASED — A starts it, A again plants it, and you land wherever the rotation
  // is. With discrete half-turn taps the judge's error was always 0 and SKETCHY / CRASH could never happen.
  spinRatePerSec: 1.2, // TUNE(elijah) — turns per second; ~2 s of air = up to ~2.4 turns
  cleanTolerance: 0.15, // TUNE(elijah) — ±0.15 turn of a half turn is clean (≈ 250 ms of spin at 1.2 t/s)
  stickWindowMs: 220, // TUNE(elijah) — generous stick window on a big landing
};

/**
 * Shake / hit-stop / rumble presets per air-session event. // TUNE(elijah).
 * HOTFIX (2026-09-24): no `sfx` here. Every entry named an /audio/sfx_*.mp3 that was never under public/, so the
 * bus played silence. The live host, lib/babylon/modes/AirSessionMode.ts, plays Big Air's own SoundKit cues (trick
 * whoosh, landing score / miss, crash impact). It also builds this core with no bus of its own, so the core's bare
 * bus has no camera and no loop: the shake and hitStopMs numbers below reach nothing until a host passes one. Of
 * this table only the landStuck / landCrash rumble reaches a player (a gamepad); the shake and hit-stop felt in Big
 * Air are the mode's own ctx.juice calls. See lib/feel/sensory-bus.ts.
 */
export const BIG_AIR_SENSORY: Partial<Record<AirSessionSensoryEvent, SensoryEvent>> = {
  launch: { shake: 0.08 }, // TUNE(elijah)
  landClean: { shake: 0.14, hitStopMs: 50 }, // TUNE(elijah)
  landStuck: { shake: 0.2, hitStopMs: 90, rumbleMs: 160, rumbleStrength: 0.7 }, // TUNE(elijah)
  landSketchy: { shake: 0.1 }, // TUNE(elijah)
  landCrash: { shake: 0.3, hitStopMs: 110, rumbleMs: 320, rumbleStrength: 0.9 }, // TUNE(elijah)
};
