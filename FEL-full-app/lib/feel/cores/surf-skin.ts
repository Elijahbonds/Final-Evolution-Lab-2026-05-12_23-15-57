/**
 * lib/feel/cores/surf-skin.ts
 * ===========================
 * M9 Step 6 — Surf skin for the Ride/carve core.
 *
 * Reference: reference__SurfMode.js — `class SurfMode extends SkateMode` with a
 * surf config key + ocean theme. Same archetype (RideCore), same skin shape as
 * skate, tuned wide + flowing with the wave-lip trim line as the "rail".
 * Adds NO behaviour to the core. All tunables // TUNE(elijah).
 */

import { RideCore, type RideSkin, type RideRail } from './ride-core';
import { SensoryBus, type Vec3 } from '../index';
import {
  SURF_TUNING,
  SURF_TRICK,
  SURF_RAIL,
  SURF_SENSORY,
} from './surf-constants';

export interface SurfSkinOpts {
  rail?: RideRail;
  onSensory?: RideSkin['onSensory'];
  onPhase?: RideSkin['onPhase'];
  onLanding?: RideSkin['onLanding'];
}

/** Wave-lip trim-line lock-on — identical shape to the skate rail resolver. */
function railResolver(rail: RideRail): (pos: Vec3) => RideRail | null {
  return (pos: Vec3) => {
    const withinZ = pos.z <= rail.zStart + rail.lockRadius && pos.z >= rail.zEnd;
    const dx = Math.abs(pos.x - rail.x);
    return withinZ && dx <= rail.lockRadius ? rail : null;
  };
}

/** Build the surf RideSkin. */
export function makeSurfSkin(opts: SurfSkinOpts = {}): RideSkin {
  const rail = opts.rail ?? SURF_RAIL;
  return {
    tuning: SURF_TUNING,
    trick: SURF_TRICK,
    resolveRail: railResolver(rail),
    sensory: SURF_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onLanding: opts.onLanding,
  };
}

/** Convenience constructor: a RideCore already wearing the surf skin. */
export function makeSurfRide(bus?: SensoryBus, opts: SurfSkinOpts = {}): RideCore {
  return new RideCore(makeSurfSkin(opts), bus);
}

export { SURF_TUNING, SURF_RAIL, SURF_SENSORY, SURF_THEME } from './surf-constants';
