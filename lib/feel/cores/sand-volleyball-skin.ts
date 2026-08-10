/**
 * lib/feel/cores/sand-volleyball-skin.ts
 * ======================================
 * M9 Step 15 — Sand Volleyball skin for the Court-rally core.
 *
 * A mode is a thin skin: constants (sand-volleyball-constants.ts) + sensory
 * presets. This file wires those into a `RallySkin` the CourtRallyCore can
 * run. It adds NO new behaviour to the core — sand-volleyball is just the
 * archetype dressed with numbers (many fast, narrow QTE windows, no charge).
 * All tunables live in sand-volleyball-constants.ts, every value
 * // TUNE(elijah).
 *
 * Reference: LINEUP_SPEC Court-rally family (QTE rally windows). No single
 * reference mode file existed, so the core is synthesised.
 */

import { CourtRallyCore, type RallySkin } from './court-rally-core';
import { SensoryBus } from '../index';
import { SAND_VOLLEYBALL_TUNING, SAND_VOLLEYBALL_SENSORY } from './sand-volleyball-constants';

export interface SandVolleyballSkinOpts {
  onSensory?: RallySkin['onSensory'];
  onPhase?: RallySkin['onPhase'];
  onContact?: RallySkin['onContact'];
  onDone?: RallySkin['onDone'];
}

/** Build the sand-volleyball RallySkin. */
export function makeSandVolleyballSkin(opts: SandVolleyballSkinOpts = {}): RallySkin {
  return {
    tuning: SAND_VOLLEYBALL_TUNING,
    sensory: SAND_VOLLEYBALL_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onContact: opts.onContact,
    onDone: opts.onDone,
  };
}

/** Convenience constructor: a CourtRallyCore already wearing the volleyball skin. */
export function makeSandVolleyballRally(bus?: SensoryBus, opts: SandVolleyballSkinOpts = {}): CourtRallyCore {
  return new CourtRallyCore(makeSandVolleyballSkin(opts), bus);
}

export { SAND_VOLLEYBALL_TUNING, SAND_VOLLEYBALL_SENSORY } from './sand-volleyball-constants';
