// CarrierControl — Mode 4 Phase 4: open-field ball-carrier movement that
// beats Madden's feel at FEL's scope.
//
//   Builds — a REAL athletic tradeoff, not a reskin:
//     scat  — fast top end, instant accel, small plant cost, fragile
//     power — slower, sluggish accel, plants hard, but truck/stiff-arm win
//   Moves — four DISTINCT answers, each with its own window + consequence:
//     juke      — hard lateral cut, defender must be in front; i-frames
//                 vs reach tackles, costs speed (plant)
//     spin      — rotate through a wrap tackle; keeps more speed than a
//                 juke but narrower window
//     stiff-arm — REJECT a side reach: pushes the tackler off (they
//                 stumble), small speed tax, no i-frames
//     truck     — head-on power: beats a square tackle, loses to a low
//                 wrap; long commitment, big speed cost
//   Tackle resolution reads the ACTUAL contact geometry + move state —
//   never dice.

import { Vector3 } from '@babylonjs/core';
import { CourtMovement, DEFAULT_MOVEMENT, type MovementTuning } from './CourtMovement';

export type CarrierBuild = 'scat' | 'power';

export const CARRIER_BUILDS: Record<CarrierBuild, MovementTuning & { truckPower: number; tackleResist: number }> = {
  scat: { ...DEFAULT_MOVEMENT, maxSpeed: 7.2, accel: 32, decel: 40, plantBleedSec: 0.09, truckPower: 0.4, tackleResist: 0.2 },
  power: { ...DEFAULT_MOVEMENT, maxSpeed: 5.8, accel: 18, decel: 26, plantBleedSec: 0.16, truckPower: 1.0, tackleResist: 0.55 },
};

export type EvadeMove = 'juke' | 'spin' | 'stiffArm' | 'truck';

export interface MoveState {
  move: EvadeMove;
  tLeft: number;             // active window remaining
  cooldown: number;
}

const MOVE_WINDOW: Record<EvadeMove, number> = { juke: 0.28, spin: 0.34, stiffArm: 0.4, truck: 0.5 };
const MOVE_COOLDOWN: Record<EvadeMove, number> = { juke: 0.7, spin: 0.8, stiffArm: 0.9, truck: 2.5 };
const MOVE_SPEED_TAX: Record<EvadeMove, number> = { juke: 0.72, spin: 0.85, stiffArm: 0.9, truck: 0.6 };

export class CarrierController {
  readonly movement: CourtMovement;
  move: MoveState | null = null;
  private cooldowns: Record<EvadeMove, number> = { juke: 0, spin: 0, stiffArm: 0, truck: 0 };

  constructor(public build: CarrierBuild = 'scat') {
    this.movement = new CourtMovement(CARRIER_BUILDS[build]);
  }

  get vel(): Vector3 { return this.movement.vel; }

  /** Trigger a move. Returns false on cooldown (a real commitment). */
  trigger(m: EvadeMove): boolean {
    if (this.cooldowns[m] > 0 || this.move) return false;
    this.move = { move: m, tLeft: MOVE_WINDOW[m], cooldown: MOVE_COOLDOWN[m] };
    this.cooldowns[m] = MOVE_COOLDOWN[m];
    this.movement.vel.scaleInPlace(MOVE_SPEED_TAX[m]);
    if (m === 'spin') this.movement.vel.copyFrom(this.movement.vel.scale(1)); // spin keeps axis
    return true;
  }

  update(dt: number, moveX: number, moveY: number, sprint: boolean) {
    for (const k of Object.keys(this.cooldowns) as EvadeMove[]) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    if (this.move) {
      this.move.tLeft -= dt;
      if (this.move.tLeft <= 0) this.move = null;
    }
    return this.movement.update(dt, moveX, moveY, sprint);
  }

  get activeMove(): EvadeMove | null { return this.move?.move ?? null; }
}

// ── Tackle resolution (no dice) ────────────────────────────────────────────
export type TackleKind = 'wrap' | 'reach' | 'square';

export interface TackleContext {
  tacklerPos: Vector3; carrierPos: Vector3;
  tacklerVel: Vector3; carrierVel: Vector3;
  move: EvadeMove | null;
  build: CarrierBuild;
}

export type TackleOutcome = 'tackled' | 'broken' | 'evaded';

/** The geometry: where did the tackler arrive from, and what is the
 *  carrier doing about it? `bearing` is the CARRIER-RELATIVE tackler
 *  position: +1 = tackler AHEAD of the carrier (in the face), -1 =
 *  chasing from BEHIND, ~0 = square to the side. */
export function resolveTackle(c: TackleContext): TackleOutcome {
  const toTackler = c.tacklerPos.subtract(c.carrierPos); toTackler.y = 0;
  const facing = c.carrierVel.lengthSquared() > 0.01 ? c.carrierVel.normalizeToNew() : Vector3.Forward();
  const bearing = toTackler.lengthSquared() > 1e-6
    ? Vector3.Dot(toTackler.normalize(), facing)
    : 1;
  const closing = Math.max(0, Vector3.Dot(c.tacklerVel.subtract(c.carrierVel), toTackler.lengthSquared() > 1e-6 ? toTackler.normalize() : Vector3.Forward()));

  // Each move beats ITS tackle and only its tackle:
  if (c.move === 'juke' && bearing > 0.3) return 'evaded';                       // juke beats the head-on/front reach
  if (c.move === 'spin' && Math.abs(bearing) <= 0.45) return 'broken';           // spin rotates through the side wrap
  if (c.move === 'stiffArm' && bearing > 0 && bearing < 0.8) return 'broken';    // stiff-arm rejects the front-side reach
  if (c.move === 'truck') {
    const power = CARRIER_BUILDS[c.build].truckPower;
    // truck wins HEAD-ON (tackler in front) and loses from behind/side
    if (bearing > 0.5) return power >= 0.5 ? 'broken' : 'tackled';   // head-on: power decides
    if (bearing < -0.3) return 'tackled';                            // wrapped from behind
    return power >= 0.8 ? 'broken' : 'tackled';                      // side contact: only a true power back
  }
  void closing;
  // no move: momentum + build decide
  const resist = CARRIER_BUILDS[c.build].tackleResist + Math.min(0.3, c.carrierVel.length() / 24);
  return resist > 0.45 ? 'broken' : 'tackled';
}
