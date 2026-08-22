/**
 * lib/feel/cores/links-golf-skin.ts
 * =================================
 * M9 Step 14 — Links Golf skin for the Court-rally core.
 *
 * A mode is a thin skin: constants (links-golf-constants.ts) + sensory
 * presets. This file wires those into a `RallySkin` the CourtRallyCore can
 * run. It adds NO new behaviour to the core — links-golf is just the
 * archetype dressed with numbers, with the charge/release contract turned ON
 * (`useCharge: true`). All tunables live in links-golf-constants.ts, every
 * value // TUNE(elijah).
 *
 * Reference: LINEUP_SPEC Court-rally family (charge/RELEASE, hole-in-one). No
 * single reference mode file existed, so the core is synthesised.
 */

import { CourtRallyCore, type RallySkin } from './court-rally-core';
import { SensoryBus } from '../index';
import { LINKS_GOLF_TUNING, LINKS_GOLF_SENSORY } from './links-golf-constants';

export interface LinksGolfSkinOpts {
  onSensory?: RallySkin['onSensory'];
  onPhase?: RallySkin['onPhase'];
  onContact?: RallySkin['onContact'];
  onDone?: RallySkin['onDone'];
}

/** Build the links-golf RallySkin. */
export function makeLinksGolfSkin(opts: LinksGolfSkinOpts = {}): RallySkin {
  return {
    tuning: LINKS_GOLF_TUNING,
    sensory: LINKS_GOLF_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onContact: opts.onContact,
    onDone: opts.onDone,
  };
}

/** Convenience constructor: a CourtRallyCore already wearing the links-golf skin. */
export function makeLinksGolfRound(bus?: SensoryBus, opts: LinksGolfSkinOpts = {}): CourtRallyCore {
  return new CourtRallyCore(makeLinksGolfSkin(opts), bus);
}

export { LINKS_GOLF_TUNING, LINKS_GOLF_SENSORY } from './links-golf-constants';
