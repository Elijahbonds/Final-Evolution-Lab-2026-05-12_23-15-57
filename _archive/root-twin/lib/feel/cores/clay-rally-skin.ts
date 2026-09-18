/**
 * lib/feel/cores/clay-rally-skin.ts
 * =================================
 * M9 Step 12 — Clay Rally skin for the Court-rally core.
 *
 * A mode is a thin skin: constants (clay-rally-constants.ts) + sensory
 * presets. This file wires those into a `RallySkin` the CourtRallyCore can
 * run. It adds NO new behaviour to the core — clay-rally is just the
 * archetype dressed with numbers (timed contacts, no charge). All tunables
 * live in clay-rally-constants.ts, every value // TUNE(elijah).
 *
 * Reference: LINEUP_SPEC Court-rally family (timed-contact exchange, "40-15
 * game"). No single reference mode file existed, so the core is synthesised.
 */

import { CourtRallyCore, type RallySkin } from './court-rally-core';
import { SensoryBus } from '../index';
import { CLAY_RALLY_TUNING, CLAY_RALLY_SENSORY } from './clay-rally-constants';

export interface ClayRallySkinOpts {
  onSensory?: RallySkin['onSensory'];
  onPhase?: RallySkin['onPhase'];
  onContact?: RallySkin['onContact'];
  onDone?: RallySkin['onDone'];
}

/** Build the clay-rally RallySkin. */
export function makeClayRallySkin(opts: ClayRallySkinOpts = {}): RallySkin {
  return {
    tuning: CLAY_RALLY_TUNING,
    sensory: CLAY_RALLY_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onContact: opts.onContact,
    onDone: opts.onDone,
  };
}

/** Convenience constructor: a CourtRallyCore already wearing the clay-rally skin. */
export function makeClayRallyRound(bus?: SensoryBus, opts: ClayRallySkinOpts = {}): CourtRallyCore {
  return new CourtRallyCore(makeClayRallySkin(opts), bus);
}

export { CLAY_RALLY_TUNING, CLAY_RALLY_SENSORY } from './clay-rally-constants';
