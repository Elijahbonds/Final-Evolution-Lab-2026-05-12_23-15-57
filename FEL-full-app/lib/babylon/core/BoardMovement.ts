// BoardMovement — Mode 3 Phase 3: the shared board-sport movement model.
//
// Momentum is a REAL RESOURCE here, not a flat top speed:
//   PUSH/PUMP — kicking (flat ground) or pumping (transitions/wave face)
//     adds energy. Pumping on a downslope converts terrain into speed;
//     pumping on flat decays toward cruise — you can't pump your way to
//     max speed on flat concrete, exactly like a real board.
//   CARVE — steer input leans the board (BalanceModel) and turns with
//     edge hold: carving HOLDS speed through the turn (a real carve
//     accelerates out), while steering hard at speed without carve
//     commitment scrubs speed like a powerslide.
//   STANCE — regular/fakie (skate) or goofy/regular (snow/surf): switching
//     flips the control response and carries a tiny speed tax mid-ride
//     (switch-stance riding is slightly harder — a real skill signal).
//   Terrain — slope response from BoardPhysics feeds the momentum economy.

import { Vector3 } from '@babylonjs/core';
import { BalanceModel, sampleSlope } from './BoardPhysics';
import type { Scene, AbstractMesh } from '@babylonjs/core';

export type BoardStance = 'regular' | 'switch';

export interface BoardMoveTuning {
  pushAccel: number;        // m/s² per push stroke
  pushCooldownSec: number;
  pumpGain: number;         // energy from pumping on transitions
  cruiseSpeed: number;      // flat-ground pump asymptote
  maxSpeed: number;
  carveTurnRate: number;    // rad/s at full lean
  carveHold: number;        // speed retention through a committed carve
  scrubRate: number;        // speed loss when steering without carving
  drag: number;
  // ── SKATE-MOVE (2026-09-08): the push / coast / brake loop. All opt-in — snow (SNOW_TUNING) keeps the legacy model.
  /** A push stroke is a Δv applied over this window (s), not an instant impulse; also the auto-push cadence's stroke. */
  strokeSec?: number;
  /** Δv per stroke fades with speed: Δv = pushAccel × (1 − pushFade × speed/maxSpeed). A kick adds less to a fast board. */
  pushFade?: number;
  /** Holding the stick forward pushes on its own (cooldown-paced) while speed < cruiseSpeed × autoPushUntil. */
  autoPushUntil?: number;
  /** Rolling resistance (m/s²) while coasting with no input — the board comes to a stop instead of creeping forever. */
  rollResist?: number;
  /** Foot-drag decel (m/s²) at full stick-back. */
  brakeDecel?: number;
  /** Scrub as a per-second rate (× (1 − carveCommit) × scrubRate) instead of the legacy per-FRAME factor, which killed a
   *  half-deflected analog stick's speed in ~0.3 s (0.89× every frame at steer 0.5). */
  scrubPerSec?: boolean;
}

// SLOWER AND WEIGHTIER (owner call, 2026-09-12). A board should be heavy and you should BUILD speed rather than
// starting at it. Measured before: the rider was at 6-8 m/s within two seconds of a standing start and crossed the
// whole park in eight. Cruise and top speed come down about a quarter, the push gives less per kick and fades harder
// so speed is earned over several strokes, and a touch more roll resistance means letting off actually costs you.
// The venues grew at the same time, so a run is now a line through a place instead of a dash across one.
export const SKATE_TUNING: BoardMoveTuning = {
  pushAccel: 3.1, pushCooldownSec: 0.6, pumpGain: 1.6, cruiseSpeed: 5.6,
  maxSpeed: 10.5, carveTurnRate: 2.4, carveHold: 1.0, scrubRate: 0.9, drag: 0.26,
  // SKATE-MOVE: the stroke is the board_push clip's 0.42 s; hold forward = push to cruise then roll; back = foot drag.
  strokeSec: 0.42, pushFade: 0.72, autoPushUntil: 0.8, rollResist: 0.4, brakeDecel: 7, scrubPerSec: true,
};
// Snow keeps more of its speed than skate — gravity is doing the work and a slope should feel fast — but the same
// quarter comes off the top so a rider is not outrunning the run.
export const SNOW_TUNING: BoardMoveTuning = {
  pushAccel: 0, pushCooldownSec: 1, pumpGain: 2.2, cruiseSpeed: 8.4,
  maxSpeed: 17, carveTurnRate: 1.9, carveHold: 1.02, scrubRate: 0.7, drag: 0.12,
};
// A surfboard is the heaviest of the three: the wave supplies the speed and the rider trades it for turns.
export const SURF_TUNING: BoardMoveTuning = {
  pushAccel: 0, pushCooldownSec: 1, pumpGain: 2.6, cruiseSpeed: 6.2,
  maxSpeed: 12, carveTurnRate: 2.8, carveHold: 1.03, scrubRate: 0.6, drag: 0.19,
};

export class BoardMovement {
  vel = Vector3.Zero();
  yaw = 0;
  stance: BoardStance = 'regular';
  readonly balance = new BalanceModel();
  private pushCooldown = 0;
  /** Seconds left in the current push stroke (strokeSec model) and the Δv it still has to deliver. */
  private strokeLeft = 0;
  private strokeDv = 0;

  constructor(private tune: BoardMoveTuning = SKATE_TUNING) {}

  get speed(): number { return this.vel.length(); }
  get speed01(): number { return Math.min(1, this.speed / this.tune.maxSpeed); }
  get pushing(): boolean { return this.pushCooldown > 0; }
  /** The back foot is on the ground right now (the stroke window) — the anim tree's push beat. */
  get stroking(): boolean { return this.strokeLeft > 0; }

  /** A push stroke (skate flat-ground). Returns false during cooldown. */
  push(): boolean {
    if (this.pushCooldown > 0 || this.tune.pushAccel === 0) return false;
    this.pushCooldown = this.tune.pushCooldownSec;
    const fade = this.tune.pushFade ?? 0;
    const dv = this.tune.pushAccel * Math.max(0.25, 1 - fade * Math.min(1, this.speed / this.tune.maxSpeed));
    if (this.tune.strokeSec) {
      // SKATE-MOVE: the Δv lands over the stroke window (the foot is on the ground for the whole push clip), so the
      // speed ramps instead of stepping — a 3.8 m/s step in one frame read as a teleport.
      this.strokeLeft = this.tune.strokeSec;
      this.strokeDv = dv;
      return true;
    }
    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.vel.addInPlace(fwd.scale(dv));
    return true;
  }

  /** Stance switch: instant, small speed tax (switch riding is harder). */
  switchStance(): void {
    this.stance = this.stance === 'regular' ? 'switch' : 'regular';
    this.vel.scaleInPlace(0.97);
  }

  /**
   * Frame step. steer/pump are -1..1 / 0..1; groundMeshes enable slope
   * response (omit for flat). Returns the new velocity.
   * `drive` (SKATE-MOVE): the L stick's forward axis, −1..1 — forward auto-pushes (strokeSec / autoPushUntil), back
   * foot-drags (brakeDecel). Modes that do not pass it (snow) are unchanged.
   */
  update(dt: number, steer: number, pump: number, scene?: Scene, pos?: Vector3, ground?: AbstractMesh[], drive = 0): Vector3 {
    this.pushCooldown = Math.max(0, this.pushCooldown - dt);
    const t = this.tune;
    const stanceMult = this.stance === 'switch' ? 0.92 : 1;   // switch = slightly duller
    void stanceMult;

    // ── SKATE-MOVE: hold forward = push cadence up to cruise, then roll ──
    if (drive > 0.3 && t.strokeSec && this.speed < t.cruiseSpeed * (t.autoPushUntil ?? 1)) this.push();

    // ── terrain: gravity along slope builds/bleeds speed ──
    let slopeAccel = 0;
    // the stroke in flight delivers its Δv evenly across the window
    if (this.strokeLeft > 0 && t.strokeSec) {
      const step = Math.min(dt, this.strokeLeft);
      slopeAccel += (this.strokeDv / t.strokeSec) * (step / dt);
      this.strokeLeft -= step;
    }
    // foot drag: the stick pulled back scrubs speed hard, to a stop, never backwards
    const brake = drive < -0.3 && t.brakeDecel ? t.brakeDecel * Math.min(1, -drive) : 0;
    // rolling resistance: a coasting board (no push, no pump, no carve) comes to rest
    const coasting = !this.stroking && drive <= 0.3 && pump < 0.1 && Math.abs(steer) < 0.5;
    const resist = coasting && t.rollResist ? t.rollResist : 0;
    if (scene && pos && ground?.length) {
      const s = sampleSlope(scene, pos, this.yaw, ground);
      slopeAccel += s.gravityAlongSlope;   // += : the stroke above must survive the terrain sample
      // pumping converts slope + transition into extra speed
      if (pump > 0.1) {
        slopeAccel += pump * t.pumpGain * (0.5 + s.steepness01 * 2);
      }
    } else if (pump > 0.1) {
      // flat-ground pump: approaches cruise, never beyond — the gain fades
      // to zero AT cruise, so cruise is the asymptote by construction.
      const headroom = Math.max(0, 1 - this.speed / t.cruiseSpeed);
      slopeAccel += pump * t.pumpGain * 1.6 * headroom;
    }

    // ── carve: steer leans the board, committed carves hold speed ──
    const lean = Math.max(-1, Math.min(1, steer));
    this.balance.update(dt, lean, this.speed01);
    const carveCommit = Math.abs(lean);
    this.yaw += steer * t.carveTurnRate * stanceMult * dt * (0.4 + 0.6 * Math.min(1, this.speed / 4));

    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // Steering re-aligns velocity toward facing (committed carves hold
    // speed through the turn; lazy steers scrub). SPEED IS SCALAR-FIRST:
    // pushing/pumping/drag act on magnitude, never re-deriving direction
    // from a zero vector. Alignment is a turn-cost, not a throttle.
    const speed = this.speed;
    if (speed > 0.01) {
      // turn cost only applies while actually steering; straight running
      // pays nothing (drag handles the bleed).
      const turnCost = carveCommit > 0.05
        ? (t.scrubPerSec ? 1 - (1 - carveCommit) * t.scrubRate * 0.6 * dt : 1 - (1 - carveCommit) * t.scrubRate * 0.25)
        : 1;
      const held = speed * turnCost + (slopeAccel - brake - resist) * dt;
      this.vel = fwd.scale(Math.max(0, held));
    } else if (slopeAccel > 0) {
      this.vel = fwd.scale(slopeAccel * dt);
    } else if (speed > 0) {
      this.vel.setAll(0);
    }

    // drag + clamp
    this.vel.scaleInPlace(Math.max(0, 1 - t.drag * dt));
    if (this.speed > t.maxSpeed) this.vel.scaleInPlace(t.maxSpeed / this.speed);
    return this.vel;
  }
}
