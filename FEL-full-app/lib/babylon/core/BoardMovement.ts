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
}

export const SKATE_TUNING: BoardMoveTuning = {
  pushAccel: 3.2, pushCooldownSec: 0.55, pumpGain: 1.6, cruiseSpeed: 7.5,
  maxSpeed: 14, carveTurnRate: 2.4, carveHold: 1.0, scrubRate: 0.9, drag: 0.22,
};
export const SNOW_TUNING: BoardMoveTuning = {
  pushAccel: 0, pushCooldownSec: 1, pumpGain: 2.2, cruiseSpeed: 10,
  maxSpeed: 22, carveTurnRate: 1.9, carveHold: 1.02, scrubRate: 0.7, drag: 0.1,
};
export const SURF_TUNING: BoardMoveTuning = {
  pushAccel: 0, pushCooldownSec: 1, pumpGain: 2.6, cruiseSpeed: 8,
  maxSpeed: 16, carveTurnRate: 2.8, carveHold: 1.03, scrubRate: 0.6, drag: 0.16,
};

export class BoardMovement {
  vel = Vector3.Zero();
  yaw = 0;
  stance: BoardStance = 'regular';
  readonly balance = new BalanceModel();
  private pushCooldown = 0;

  constructor(private tune: BoardMoveTuning = SKATE_TUNING) {}

  get speed(): number { return this.vel.length(); }
  get speed01(): number { return Math.min(1, this.speed / this.tune.maxSpeed); }
  get pushing(): boolean { return this.pushCooldown > 0; }

  /** A push stroke (skate flat-ground). Returns false during cooldown. */
  push(): boolean {
    if (this.pushCooldown > 0 || this.tune.pushAccel === 0) return false;
    this.pushCooldown = this.tune.pushCooldownSec;
    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.vel.addInPlace(fwd.scale(this.tune.pushAccel));
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
   */
  update(dt: number, steer: number, pump: number, scene?: Scene, pos?: Vector3, ground?: AbstractMesh[]): Vector3 {
    this.pushCooldown = Math.max(0, this.pushCooldown - dt);
    const t = this.tune;
    const stanceMult = this.stance === 'switch' ? 0.92 : 1;   // switch = slightly duller
    void stanceMult;

    // ── terrain: gravity along slope builds/bleeds speed ──
    let slopeAccel = 0;
    if (scene && pos && ground?.length) {
      const s = sampleSlope(scene, pos, this.yaw, ground);
      slopeAccel = s.gravityAlongSlope;
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
      const turnCost = carveCommit > 0.05 ? 1 - (1 - carveCommit) * t.scrubRate * 0.25 : 1;
      const held = speed * turnCost + slopeAccel * dt;
      this.vel = fwd.scale(Math.max(0, held));
    } else if (slopeAccel !== 0) {
      this.vel = fwd.scale(Math.max(0, slopeAccel * dt));
    }

    // drag + clamp
    this.vel.scaleInPlace(Math.max(0, 1 - t.drag * dt));
    if (this.speed > t.maxSpeed) this.vel.scaleInPlace(t.maxSpeed / this.speed);
    return this.vel;
  }
}
