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
import { SPRINT_TUNING, SPRINT_SENSORY, SPRINT_SET_JITTER_MS } from './sprint-constants';

export interface SprintSkinOpts {
  onSensory?: SprintSkin['onSensory'];
  onPhase?: SprintSkin['onPhase'];
  onFinish?: SprintSkin['onFinish'];
  /** IMPROVE (2026-10-06): a SET hold per gate (randomSetHoldMs); omitted = the fixed setMs, as before. */
  setHoldMs?: SprintSkin['setHoldMs'];
}

/** IMPROVE (2026-10-06): one SET hold, uniform in [setMs, setMs + SPRINT_SET_JITTER_MS]. `rng` returns [0, 1). */
export function randomSetHoldMs(rng: () => number = Math.random): number {
  const r = rng();
  return SPRINT_TUNING.setMs + Math.max(0, Math.min(1, Number.isFinite(r) ? r : 0)) * SPRINT_SET_JITTER_MS;
}

/** Build the sprint SprintSkin. */
export function makeSprintSkin(opts: SprintSkinOpts = {}): SprintSkin {
  return {
    tuning: SPRINT_TUNING,
    sensory: SPRINT_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onFinish: opts.onFinish,
    setHoldMs: opts.setHoldMs,
  };
}

/** Convenience constructor: a SprintCore already wearing the sprint skin. */
export function makeSprintRace(bus?: SensoryBus, opts: SprintSkinOpts = {}): SprintCore {
  return new SprintCore(makeSprintSkin(opts), bus);
}

export { SPRINT_TUNING, SPRINT_SENSORY, SPRINT_SET_JITTER_MS } from './sprint-constants';
