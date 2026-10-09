/**
 * lib/feel/cores/sprint-constants.ts
 * ==================================
 * M9 Step 11 — Sprint (100m dash) skin tunables for the Rhythm/UI archetype.
 *
 * The proven line kept these in `feelConfig.sprint`, which was NOT one of the
 * ported feel systems, so every value here is fresh scaffolding for Elijah to
 * dial in. All values // TUNE(elijah). A sprint mode is a thin SprintSkin:
 * these constants + sensory presets. Adding it never edits the SprintCore.
 */

import type { SprintTuning, SprintSensory } from './sprint-core';

/** 100m dash feel. Every number // TUNE(elijah). */
export const SPRINT_TUNING: SprintTuning = {
  targetIntervalMs: 200, // TUNE(elijah) — target ms between alternating footstrikes
  perfectWindowMs: 35, // TUNE(elijah) — +/- window scoring perfect
  goodWindowMs: 80, // TUNE(elijah) — +/- window scoring good
  readyMs: 900, // TUNE(elijah) — time on the blocks before SET
  setMs: 700, // TUNE(elijah) — SET hold before the gun (GO)
  perfectImpulse: 1.1, // TUNE(elijah) — m/s added on a perfect step
  goodImpulse: 0.7, // TUNE(elijah) — m/s added on a good/first step
  offImpulse: 0, // TUNE(elijah) — m/s added on a sloppy step. FLAG 0.25 → 0 (MODES-SHARED-10). A frame-rate mash at 0.25 finishes the 100 m under WIN_TIME 13 s (scripts/sprint-core-tests.ts). Off-beat taps add nothing. A body-graded jog then finishes at about 19.5 s, past the old 18.4 s grace; that gate is flagged in rideBody.gate.test.ts.
  stumblePenalty: 0.6, // TUNE(elijah) — speed multiplier on a same-side stumble
  maxSpeed: 12.0, // TUNE(elijah) — top sprint speed (m/s)
  drag: 1.2, // TUNE(elijah) — passive m/s^2 decel between steps
  raceDistanceM: 100, // TUNE(elijah) — dash length
};

/**
 * IMPROVE (2026-10-06): the SET hold's random spread, ms. READY 900 ms and SET 700 ms were fixed, so the gun could be
 * timed from memory and a "reaction" was a rehearsed count. The Babylon sprint draws each SET hold uniformly from
 * [setMs, setMs + SPRINT_SET_JITTER_MS] — never SHORTER than the signed-off 700 ms, at most 1.3 s. Opt-in through
 * makeSprintSkin({ setHoldMs }): SPRINT_TUNING itself is unchanged, so the 2D surface and every fixed-clock test are too.
 * // TUNE(elijah)
 */
export const SPRINT_SET_JITTER_MS = 600;

/** Sprint sensory presets. // TUNE(elijah) */
export const SPRINT_SENSORY: SprintSensory = {
  gun: { sfx: 'impact', volume: 0.6 }, // TUNE(elijah) — the starting gun
  stumble: { sfx: 'impact', volume: 0.5, shake: 0.08 }, // TUNE(elijah)
  falseStart: { sfx: 'impact', volume: 0.9, shake: 0.12 }, // TUNE(elijah)
  perfectStep: { sfx: 'swoosh', volume: 0.35 }, // TUNE(elijah)
  finish: { sfx: 'crowd', volume: 0.8, shake: 0.15, hitStopMs: 80, rumbleMs: 200 }, // TUNE(elijah)
};
