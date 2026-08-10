/**
 * lib/feel/cores/big-air-skin.ts
 * ==============================
 * M9 Step 7 — Big Air skin for the Air-session core.
 *
 * A mode is a thin skin: constants (big-air-constants.ts) + sensory presets.
 * This file wires those into an `AirSessionSkin` the AirSessionCore can run.
 * It adds NO new behaviour to the core — big-air is just the archetype dressed
 * with numbers (a fast, self-accelerating slope and a big kicker). All
 * tunables live in big-air-constants.ts, every value // TUNE(elijah).
 *
 * Reference: reference__AirSessionMode.js (run-up -> launch -> tricks ->
 * landing; launch impulse scales with carried run speed; attempts per round).
 */

import { AirSessionCore, type AirSessionSkin } from './air-session-core';
import { SensoryBus } from '../index';
import { BIG_AIR_TUNING, BIG_AIR_TRICK, BIG_AIR_SENSORY } from './big-air-constants';

export interface BigAirSkinOpts {
  onSensory?: AirSessionSkin['onSensory'];
  onPhase?: AirSessionSkin['onPhase'];
  onLanding?: AirSessionSkin['onLanding'];
}

/** Build the big-air AirSessionSkin. */
export function makeBigAirSkin(opts: BigAirSkinOpts = {}): AirSessionSkin {
  return {
    tuning: BIG_AIR_TUNING,
    trick: BIG_AIR_TRICK,
    sensory: BIG_AIR_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onLanding: opts.onLanding,
  };
}

/** Convenience constructor: an AirSessionCore already wearing the big-air skin. */
export function makeBigAirSession(bus?: SensoryBus, opts: BigAirSkinOpts = {}): AirSessionCore {
  return new AirSessionCore(makeBigAirSkin(opts), bus);
}

export { BIG_AIR_TUNING, BIG_AIR_TRICK, BIG_AIR_SENSORY } from './big-air-constants';
