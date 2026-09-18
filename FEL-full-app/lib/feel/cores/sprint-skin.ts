/**
 * lib/feel/cores/sprint-skin.ts
 * =============================
 * M9 Step 11 — Sprint skin for the Rhythm/UI archetype (SprintCore).
 *
 * A mode is a thin skin: constants (sprint-constants.ts) + sensory presets,
 * wired into a `SprintSkin` the SprintCore can run. Adds NO behaviour to the
 * core — sprint is the archetype dressed with numbers. All tunables live in
 * sprint-constants.ts, every value // TUNE(elijah).
 */

import { SprintCore, type SprintSkin } from './sprint-core';
import { SensoryBus } from '../index';
import { SPRINT_TUNING, SPRINT_SENSORY } from './sprint-constants';

export interface SprintSkinOpts {
  onSensory?: SprintSkin['onSensory'];
  onPhase?: SprintSkin['onPhase'];
  onFinish?: SprintSkin['onFinish'];
}

/** Build the sprint SprintSkin. */
export function makeSprintSkin(opts: SprintSkinOpts = {}): SprintSkin {
  return {
    tuning: SPRINT_TUNING,
    sensory: SPRINT_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onFinish: opts.onFinish,
  };
}

/** Convenience constructor: a SprintCore already wearing the sprint skin. */
export function makeSprintRace(bus?: SensoryBus, opts: SprintSkinOpts = {}): SprintCore {
  return new SprintCore(makeSprintSkin(opts), bus);
}

export { SPRINT_TUNING, SPRINT_SENSORY } from './sprint-constants';
