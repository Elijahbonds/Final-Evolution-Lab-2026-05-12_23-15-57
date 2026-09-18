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
  offImpulse: 0.25, // TUNE(elijah) — m/s added on a sloppy step
  stumblePenalty: 0.6, // TUNE(elijah) — speed multiplier on a same-side stumble
  maxSpeed: 12.0, // TUNE(elijah) — top sprint speed (m/s)
  drag: 1.2, // TUNE(elijah) — passive m/s^2 decel between steps
  raceDistanceM: 100, // TUNE(elijah) — dash length
};

/** Sprint sensory presets. // TUNE(elijah) */
export const SPRINT_SENSORY: SprintSensory = {
  gun: { sfx: 'impact', volume: 0.6 }, // TUNE(elijah) — the starting gun
  stumble: { sfx: 'impact', volume: 0.5, shake: 0.08 }, // TUNE(elijah)
  falseStart: { sfx: 'impact', volume: 0.9, shake: 0.12 }, // TUNE(elijah)
  perfectStep: { sfx: 'swoosh', volume: 0.35 }, // TUNE(elijah)
  finish: { sfx: 'crowd', volume: 0.8, shake: 0.15, hitStopMs: 80, rumbleMs: 200 }, // TUNE(elijah)
};
