/**
 * lib/feel/cores/skate-skin.ts
 * ============================
 * M9 Step 4 — Skateboard skin for the Ride/carve core.
 *
 * A mode is a thin skin: constants (skate-constants.ts) + a rail resolver +
 * sensory presets. This file wires those into a `RideSkin` the RideCore can
 * run. It adds NO new behaviour to the core — the skateboard is just the
 * archetype dressed with numbers. All tunables live in skate-constants.ts,
 * every value // TUNE(elijah).
 *
 * Reference: reference__SkateMode_themed.js (Venice strip, one grind rail,
 * ollie on the variable-gravity curve, grind lock-on via ArcDrive).
 */

import { RideCore, type RideSkin, type RideRail } from './ride-core';
import { SensoryBus, type Vec3 } from '../index';
import {
  SKATE_TUNING,
  SKATE_TRICK,
  SKATE_RAIL,
  SKATE_SENSORY,
} from './skate-constants';

export interface SkateSkinOpts {
  /** Override the default rail (e.g. themed snowboard/surf reuse). */
  rail?: RideRail;
  onSensory?: RideSkin['onSensory'];
  onPhase?: RideSkin['onPhase'];
  onLanding?: RideSkin['onLanding'];
}

/** Rail lock-on test — mirrors reference SkateMode `_nearRail()`. */
function railResolver(rail: RideRail): (pos: Vec3) => RideRail | null {
  return (pos: Vec3) => {
    const withinZ = pos.z <= rail.zStart + rail.lockRadius && pos.z >= rail.zEnd;
    const dx = Math.abs(pos.x - rail.x);
    return withinZ && dx <= rail.lockRadius ? rail : null;
  };
}

/** Build the skateboard RideSkin. */
export function makeSkateSkin(opts: SkateSkinOpts = {}): RideSkin {
  const rail = opts.rail ?? SKATE_RAIL;
  return {
    tuning: SKATE_TUNING,
    trick: SKATE_TRICK,
    resolveRail: railResolver(rail),
    sensory: SKATE_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onLanding: opts.onLanding,
  };
}

/** Convenience constructor: a RideCore already wearing the skate skin. */
export function makeSkateRide(bus?: SensoryBus, opts: SkateSkinOpts = {}): RideCore {
  return new RideCore(makeSkateSkin(opts), bus);
}

export { SKATE_TUNING, SKATE_RAIL, SKATE_SENSORY } from './skate-constants';
