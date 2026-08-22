/**
 * lib/feel/cores/penalty-shootout-skin.ts
 * =======================================
 * M9 Step 13 — Penalty Shootout skin for the Court-rally core.
 *
 * A mode is a thin skin: constants (penalty-shootout-constants.ts) + sensory
 * presets. This file wires those into a `RallySkin` the CourtRallyCore can
 * run. It adds NO new behaviour to the core — penalty-shootout is just the
 * archetype dressed with numbers (five tight timed strikes, no charge, first
 * to three wins). All tunables live in penalty-shootout-constants.ts, every
 * value // TUNE(elijah).
 *
 * Reference: LINEUP_SPEC Court-rally family (best-of-five spot kicks, "won
 * 3-2"). No single reference mode file existed, so the core is synthesised.
 */

import { CourtRallyCore, type RallySkin } from './court-rally-core';
import { SensoryBus } from '../index';
import { PENALTY_SHOOTOUT_TUNING, PENALTY_SHOOTOUT_SENSORY } from './penalty-shootout-constants';

export interface PenaltyShootoutSkinOpts {
  onSensory?: RallySkin['onSensory'];
  onPhase?: RallySkin['onPhase'];
  onContact?: RallySkin['onContact'];
  onDone?: RallySkin['onDone'];
}

/** Build the penalty-shootout RallySkin. */
export function makePenaltyShootoutSkin(opts: PenaltyShootoutSkinOpts = {}): RallySkin {
  return {
    tuning: PENALTY_SHOOTOUT_TUNING,
    sensory: PENALTY_SHOOTOUT_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onContact: opts.onContact,
    onDone: opts.onDone,
  };
}

/** Convenience constructor: a CourtRallyCore already wearing the shootout skin. */
export function makePenaltyShootout(bus?: SensoryBus, opts: PenaltyShootoutSkinOpts = {}): CourtRallyCore {
  return new CourtRallyCore(makePenaltyShootoutSkin(opts), bus);
}

export { PENALTY_SHOOTOUT_TUNING, PENALTY_SHOOTOUT_SENSORY } from './penalty-shootout-constants';
