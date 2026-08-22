/**
 * lib/feel/football/football-skin.ts
 * ==================================
 * M10 Row A — Street Football skin for the Court/free-3D core.
 *
 * Declares the football run's field bounds + sprint speed by CONFIG only, so
 * FootballRun can COMPOSE a plain CourtCore for grounded locomotion + hurdle
 * (the shared variable-gravity jump) without forking it. The abstracted-tackler
 * and juke/spin/stiff-arm evade logic lives in football-core.ts, NOT here and
 * NOT in the shared core — keeping the firewall intact.
 *
 * SYNTH APPROXIMATION: no donor JS existed for Street Football, so every value
 * threaded here is new scaffolding // TUNE(elijah).
 */

import { feelConfig, mergeFeel, type Vec3, type FeelConfig } from '../index';
import type { CourtSkin, CourtSensoryEvent } from '../cores/court-core';
import { FOOTBALL_TUNING, type FootballTuning } from './football-constants';

export interface FootballSkinOpts {
  tuning?: FootballTuning;
  onSensory?: (evt: CourtSensoryEvent, info: { vy: number; pos: Vec3 }) => void;
  onPhase?: CourtSkin['onPhase'];
}

/**
 * Build the football CourtSkin: a long -Z field lane and a sprint speedScale.
 * No lock-on (plain ballistic hurdle jump). Locomotion + jump are the reused
 * archetype; the run/evade/tackle game is layered by FootballRun.
 */
export function makeFootballSkin(opts: FootballSkinOpts = {}): CourtSkin {
  const t = opts.tuning ?? FOOTBALL_TUNING;
  const feel: FeelConfig = mergeFeel({
    court: {
      minX: -t.laneHalfWidth,
      maxX: t.laneHalfWidth,
      minZ: -(t.fieldLengthYd + t.endZoneMargin),
      maxZ: 2,
    },
  });

  return {
    feel,
    speedScale: t.sprintScale,
    jumpImpulse: feelConfig.jump.impulse,
    bounds: feel.court,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    // No resolveLockOn: the hurdle is a plain ballistic jump.
  };
}

export default makeFootballSkin;
