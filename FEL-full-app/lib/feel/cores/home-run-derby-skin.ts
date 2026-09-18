/**
 * lib/feel/cores/home-run-derby-skin.ts
 * =====================================
 * M9 Step 16 — Home Run Derby skin for the Court-rally core.
 *
 * A mode is a thin skin: constants (home-run-derby-constants.ts) + sensory
 * presets. This file wires those into a `RallySkin` the CourtRallyCore can
 * run. It adds NO new behaviour to the core — home-run-derby is just the
 * archetype dressed with numbers (six swings, six-for-six to sweep, no
 * charge). All tunables live in home-run-derby-constants.ts, every value
 * // TUNE(elijah).
 *
 * Reference: LINEUP_SPEC Court-rally family (6 timed swings = 6 hits). No
 * single reference mode file existed, so the core is synthesised.
 */

import { CourtRallyCore, type RallySkin } from './court-rally-core';
import { SensoryBus } from '../index';
import { HOME_RUN_DERBY_TUNING, HOME_RUN_DERBY_SENSORY } from './home-run-derby-constants';

export interface HomeRunDerbySkinOpts {
  onSensory?: RallySkin['onSensory'];
  onPhase?: RallySkin['onPhase'];
  onContact?: RallySkin['onContact'];
  onDone?: RallySkin['onDone'];
}

/** Build the home-run-derby RallySkin. */
export function makeHomeRunDerbySkin(opts: HomeRunDerbySkinOpts = {}): RallySkin {
  return {
    tuning: HOME_RUN_DERBY_TUNING,
    sensory: HOME_RUN_DERBY_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onContact: opts.onContact,
    onDone: opts.onDone,
  };
}

/** Convenience constructor: a CourtRallyCore already wearing the derby skin. */
export function makeHomeRunDerby(bus?: SensoryBus, opts: HomeRunDerbySkinOpts = {}): CourtRallyCore {
  return new CourtRallyCore(makeHomeRunDerbySkin(opts), bus);
}

export { HOME_RUN_DERBY_TUNING, HOME_RUN_DERBY_SENSORY } from './home-run-derby-constants';
