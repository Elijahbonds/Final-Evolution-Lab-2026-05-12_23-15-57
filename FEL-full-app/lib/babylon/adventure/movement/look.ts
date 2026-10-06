/**
 * What traversal LOOKS like, as pure decisions (lane A1). The view binders (movement/view.ts, rails/view.ts,
 * flight/view.ts) only apply these, so every choice is testable headless.
 *
 * CLIPS. Only clips that exist (anim/clipRegistry.REAL_CLIPS): asking for one that does not renders a body in bind pose,
 * the worst-looking bug this engine has had. The choices borrow the free-runner's air and tuck (the spin ball is
 * freerun_tuck), the board's grind stance, the fighter's hit and floor, and the seated prop pose for riding. There is
 * no flight clip in the library yet: free flight and cruise hold the air pose and the view tilts the body (a flight
 * clip is an art ask in the lane report). A4's ClipScope for the Adventure must include MOVEMENT_CLIP_SUITES.
 */

import type { AdventureActor } from '../contracts';
import type { MovementTelemetry } from './index';

export interface MoveClip { clip: string; loop: boolean; fadeSec: number; speedRatio: number }
export const moveClip = (): MoveClip => ({ clip: 'idle_stand', loop: true, fadeSec: 0.2, speedRatio: 1 });

/** The suites the movement clips come from (clipScope.suiteOfClip). Core is always allowed. */
export const MOVEMENT_CLIP_SUITES = ['freerun', 'board', 'combat'] as const;

/** The run clip's authored pace (freeRunTree / LocoBus: 4.8 m/s) and the walk's. Past the clamp the legs blur. */
export const RUN_CLIP_MPS = 4.8;
export const WALK_CLIP_MPS = 1.6;
export const RUN_RATIO_MAX = 2.4;

const set = (o: MoveClip, clip: string, loop: boolean, fadeSec: number, speedRatio = 1): MoveClip => {
  o.clip = clip; o.loop = loop; o.fadeSec = fadeSec; o.speedRatio = speedRatio; return o;
};

/** The clip a body should be playing now. Writes into `out`. */
export function movementClipFor(
  a: Pick<AdventureActor, 'state' | 'stateSec'>, t: MovementTelemetry, tSec: number, out: MoveClip = moveClip(),
): MoveClip {
  switch (a.state) {
    case 'ground': {
      if (tSec - t.landedAt < 0.18 && t.speed < 6) return set(out, 'jump_land', false, 0.06);
      if (t.speed < 0.3) return set(out, 'idle_stand', true, 0.2);
      if (t.speed < 3.2) return set(out, 'walk', true, 0.15, Math.max(0.6, t.speed / WALK_CLIP_MPS));
      return set(out, 'run', true, 0.12, Math.min(RUN_RATIO_MAX, Math.max(0.8, t.speed / RUN_CLIP_MPS)));
    }
    case 'air':
      if (t.spinning && !t.airDashing) return set(out, 'freerun_tuck', true, 0.1, 1.6);
      if (tSec - t.jumpedAt < 0.15) return set(out, 'jump_up', false, 0.08);
      return set(out, 'freerun_air_hold', true, 0.14);
    case 'grind':
      if (t.rail.tricking) return set(out, 'freerun_tuck', true, 0.08, 1.8);
      if (t.rail.switching) return set(out, 'freerun_air_hold', true, 0.08);
      return set(out, 'board_grind', true, 0.1);
    case 'wallrun':
      return set(out, 'run', true, 0.1, Math.min(RUN_RATIO_MAX, Math.max(1, t.speed / RUN_CLIP_MPS)));
    case 'flight':
      return set(out, 'freerun_air_hold', true, 0.2, t.flight.mode === 'cruise' ? 0.5 : 0.8);
    case 'riding':
      return set(out, 'prop_bike_rider', true, 0.2);
    case 'stunned':
      return set(out, 'karate_hit_react', false, 0.06);
    case 'ko':
      return a.stateSec < 0.8 ? set(out, 'karate_knockdown', false, 0.06) : set(out, 'karate_floor_hold', true, 0.15);
    default:
      return set(out, 'idle_stand', true, 0.2);
  }
}

/** The body's extra tilt for the view (radians, applied to a pose node under the root): a ball, a lean, a bank. */
export interface PoseTilt { pitch: number; roll: number; spinRate: number }
export const poseTilt = (): PoseTilt => ({ pitch: 0, roll: 0, spinRate: 0 });

/** Cruise flies horizontal (the body lies along the flight); free flight leans into the move; a grind leans. [TUNE] */
export const CRUISE_BODY_PITCH = 1.25;
export const FREE_BODY_PITCH = 0.45;
export const GRIND_LEAN_ROLL = 0.35;
export const SPIN_BALL_RATE = 18;

export function poseTiltFor(a: Pick<AdventureActor, 'state'>, t: MovementTelemetry, out: PoseTilt = poseTilt()): PoseTilt {
  out.pitch = 0; out.roll = 0; out.spinRate = 0;
  if (a.state === 'air' && t.spinning && !t.airDashing) out.spinRate = SPIN_BALL_RATE;
  else if (a.state === 'grind') out.roll = t.rail.lean * GRIND_LEAN_ROLL;
  else if (a.state === 'flight') {
    if (t.flight.mode === 'cruise') { out.pitch = CRUISE_BODY_PITCH - t.flight.pitch; out.roll = t.flight.bank; }
    else out.pitch = FREE_BODY_PITCH * Math.min(1, t.speed01);
  }
  return out;
}

/** Rail sparks tier 0..3 (racing/speedFx.SparkEmitter's tiers): by speed, hotter when leaning against the curve. */
export function sparkTierFor(state: AdventureActor['state'], t: MovementTelemetry): number {
  if (state !== 'grind' || t.rail.switching) return 0;
  const against = t.rail.lean * t.rail.turn < 0 ? 1 : 0;
  const base = t.speed01 < 0.35 ? 1 : t.speed01 < 0.7 ? 2 : 3;
  return Math.min(3, base + against);
}

/** The boom ring's life (s) and how far through it a ring is, or null when there is none to draw. */
export const BOOM_SEC = 0.45;
export function boomProgress(t: MovementTelemetry, tSec: number): number | null {
  const at = t.flight.boomAtSec;
  if (at === null) return null;
  const u = (tSec - at) / BOOM_SEC;
  return u >= 0 && u <= 1 ? u : null;
}

/** The speed fraction the streaks read (speedFx.SpeedLines starts at 0.8): cruise and a FLOW-top run. */
export function streakFracFor(state: AdventureActor['state'], t: MovementTelemetry): number {
  if (state === 'flight') return t.flight.mode === 'cruise' ? 0.8 + 0.2 * Math.min(1, t.speed01) : 0;
  if (state === 'grind') return 0.7 + 0.3 * Math.min(1, t.speed01);
  if (state === 'ground' || state === 'air') return t.speed01;
  return 0;
}
