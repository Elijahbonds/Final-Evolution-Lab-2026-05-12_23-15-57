// BallHandling — Mode 1 Phase 3: dribble state machine, pass system, and
// animation-synced shot release. Pure logic (headless-testable); modes wire
// it to clips, BallSim, and HUD.
//
//   DribbleStateMachine — idle / speed / crossover / protect, chosen from
//     speed + defender proximity each frame. Maps states to clips so the
//     blend tree reads the dribble, not just "run vs idle".
//   PassSystem — target-lock assist (stick aim snaps to the best teammate
//     in the cone) + chest-vs-bounce selection (a defender in the lane
//     corridor forces the bounce pass) + a real ball flight (PassFlight)
//     instead of teleporting possession.
//   ShotReleaseSync — paces the jumpshot clip so its contact frame lands
//     exactly on the meter's green center: what you SEE is what you TIME.

import { Vector3 } from '@babylonjs/core';

// ── Dribble state machine ──────────────────────────────────────────────────
export type DribbleState = 'idle' | 'speed' | 'crossover' | 'protect';

export interface DribbleStateInput {
  speed01: number;
  crossover: boolean;
  /** Distance to nearest live defender (Infinity when none). */
  nearestDefender: number;
}

/** Protect range: tight defender + slow/stationary handler = back-down. */
export const PROTECT_RANGE = 1.4;
const SPEED_ENTER = 0.15;
const CROSSOVER_HOLD_SEC = 0.45;

export class DribbleStateMachine {
  state: DribbleState = 'idle';
  private crossoverLeft = 0;

  update(dt: number, i: DribbleStateInput): DribbleState {
    this.crossoverLeft = Math.max(0, this.crossoverLeft - dt);
    if (i.crossover) {
      this.state = 'crossover';
      this.crossoverLeft = CROSSOVER_HOLD_SEC;
    } else if (this.state === 'crossover' && this.crossoverLeft > 0) {
      // hold the crossover state until the burst reads
    } else if (i.speed01 > SPEED_ENTER) {
      this.state = 'speed';
    } else if (i.nearestDefender < PROTECT_RANGE) {
      this.state = 'protect';
    } else {
      this.state = 'idle';
    }
    return this.state;
  }
}

/** Clip for each state — registry names (resolver-backed, always real). */
export const DRIBBLE_CLIP: Record<DribbleState, string> = {
  idle: 'idle_stand',
  speed: 'bball_dribble_run',
  crossover: 'football_juke_left',   // hard lateral plant reads as the shake
  protect: 'bball_defend_stance',    // low, wide, ball shielded
};

// ── Passing ────────────────────────────────────────────────────────────────
export type PassType = 'chest' | 'bounce';

/** Assist cone half-angle for stick-aimed target lock. */
export const PASS_LOCK_CONE_RAD = (40 * Math.PI) / 180;

export interface PassTarget { id: string; pos: Vector3 }

/**
 * Target-lock assist: given the stick aim direction, pick the teammate
 * inside the cone closest to the aim line. No aim (or nobody in the cone)
 * falls back to the most-open teammate (max distance to nearest defender).
 * Returns null with no teammates.
 */
export function lockTarget(
  passer: Vector3, aimX: number, aimY: number,
  teammates: PassTarget[], defenders: Vector3[],
): PassTarget | null {
  if (!teammates.length) return null;
  const aimMag = Math.hypot(aimX, aimY);
  if (aimMag > 0.3) {
    const aim = new Vector3(aimX, 0, -aimY).normalize();
    let best: PassTarget | null = null;
    let bestScore = -Infinity;
    for (const tm of teammates) {
      const to = tm.pos.subtract(passer); to.y = 0;
      const dist = to.length();
      if (dist < 0.5) continue;
      const dir = to.normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(dir, aim))));
      if (angle > PASS_LOCK_CONE_RAD) continue;
      // prefer tight alignment, mild preference for nearer targets
      const score = -angle * 2 - dist * 0.05;
      if (score > bestScore) { bestScore = score; best = tm; }
    }
    if (best) return best;
  }
  // Fallback: most open (largest nearest-defender distance).
  let open: PassTarget | null = null;
  let openD = -Infinity;
  for (const tm of teammates) {
    const d = defenders.length
      ? Math.min(...defenders.map((f) => Vector3.Distance(f, tm.pos)))
      : Infinity;
    if (d > openD) { openD = d; open = tm; }
  }
  return open;
}

/** A defender standing in the pass lane corridor forces the bounce pass. */
export function choosePassType(passer: Vector3, target: Vector3, defenders: Vector3[]): PassType {
  const lane = target.subtract(passer); lane.y = 0;
  const len = lane.length();
  if (len < 0.001) return 'chest';
  const dir = lane.normalize();
  for (const d of defenders) {
    const rel = d.subtract(passer); rel.y = 0;
    const along = Vector3.Dot(rel, dir);
    if (along < 0.3 || along > len - 0.3) continue;      // behind passer / past target
    const lateral = rel.subtract(dir.scale(along)).length();
    if (lateral < 0.7) return 'bounce';                   // in the corridor
  }
  return 'chest';
}

/** Real pass flight — chest is flat and fast, bounce dips to the floor at
 *  the midpoint and skips up. step() returns true on arrival (catch). */
export class PassFlight {
  active = false;
  private from = new Vector3(); private to = new Vector3();
  private t = 0; private duration = 0.3; private type: PassType = 'chest';

  start(from: Vector3, to: Vector3, type: PassType): void {
    this.from.copyFrom(from); this.to.copyFrom(to);
    this.type = type;
    const dist = Vector3.Distance(from, to);
    this.duration = Math.max(0.18, dist / (type === 'chest' ? 14 : 10));
    this.t = 0;
    this.active = true;
  }

  step(dt: number, ball: Vector3): boolean {
    if (!this.active) return true;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.t;
    ball.x = this.from.x + (this.to.x - this.from.x) * k;
    ball.z = this.from.z + (this.to.z - this.from.z) * k;
    if (this.type === 'chest') {
      ball.y = this.from.y + (this.to.y - this.from.y) * k + Math.sin(k * Math.PI) * 0.15;
    } else {
      // down to the floor by k=0.5, skip back up to chest height by k=1
      if (k < 0.5) {
        const u = k * 2;
        ball.y = this.from.y + (0.05 - this.from.y) * u;
      } else {
        const u = (k - 0.5) * 2;
        ball.y = 0.05 + (this.to.y - 0.05) * u;
      }
    }
    if (this.t >= 1) { this.active = false; return true; }
    return false;
  }
}

// ── Animation-synced shot release ──────────────────────────────────────────
/** Fraction of the jumpshot clip where the ball visually leaves the hand. */
export const RELEASE_FRAME_01 = 0.45;

/**
 * Pace the jumpshot clip so the visual release frame lands exactly on the
 * meter's green center. Returns the speedRatio to play the clip at.
 *   clipTimeToRelease = RELEASE_FRAME_01 * clipDurationSec / speedRatio
 *   meterTimeToGreen  = greenCenter * meterDurationSec
 * Solve so they're equal: speedRatio = RELEASE_FRAME_01 * clip / (green * meter).
 */
export function syncedShotSpeed(
  clipDurationSec: number, meterDurationSec: number, greenCenter01: number,
): number {
  const target = greenCenter01 * meterDurationSec;
  if (target <= 0 || clipDurationSec <= 0) return 1;
  return (RELEASE_FRAME_01 * clipDurationSec) / target;
}
