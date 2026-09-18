/**
 * lib/feel/cores/snowboard-skin.ts
 * ================================
 * M9 Step 5 — Snowboard skin for the Ride/carve core.
 *
 * Reference: reference__SnowboardMode.js — in the proven line this was literally
 * `class SnowboardMode extends SkateMode` with a different config key + theme.
 * We honour that exactly: same archetype (RideCore), same skin shape as skate,
 * just steeper/faster constants (snowboard-constants.ts) and a rock-ledge rail.
 * Adds NO behaviour to the core. All tunables // TUNE(elijah).
 */

import { RideCore, type RideSkin, type RideRail } from './ride-core';
import { SensoryBus, type Vec3 } from '../index';
import {
  SNOWBOARD_TUNING,
  SNOWBOARD_TRICK,
  SNOWBOARD_RAIL,
  SNOWBOARD_SENSORY,
} from './snowboard-constants';

export interface SnowboardSkinOpts {
  rail?: RideRail;
  onSensory?: RideSkin['onSensory'];
  onPhase?: RideSkin['onPhase'];
  onLanding?: RideSkin['onLanding'];
}

/** Rock-ledge lock-on test — identical shape to the skate rail resolver. */
function railResolver(rail: RideRail): (pos: Vec3) => RideRail | null {
  return (pos: Vec3) => {
    const withinZ = pos.z <= rail.zStart + rail.lockRadius && pos.z >= rail.zEnd;
    const dx = Math.abs(pos.x - rail.x);
    return withinZ && dx <= rail.lockRadius ? rail : null;
  };
}

/** Build the snowboard RideSkin. */
export function makeSnowboardSkin(opts: SnowboardSkinOpts = {}): RideSkin {
  const rail = opts.rail ?? SNOWBOARD_RAIL;
  return {
    tuning: SNOWBOARD_TUNING,
    trick: SNOWBOARD_TRICK,
    resolveRail: railResolver(rail),
    sensory: SNOWBOARD_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onLanding: opts.onLanding,
  };
}

/** Convenience constructor: a RideCore already wearing the snowboard skin. */
export function makeSnowboardRide(bus?: SensoryBus, opts: SnowboardSkinOpts = {}): RideCore {
  return new RideCore(makeSnowboardSkin(opts), bus);
}

export { SNOWBOARD_TUNING, SNOWBOARD_RAIL, SNOWBOARD_SENSORY, SNOWBOARD_THEME } from './snowboard-constants';
