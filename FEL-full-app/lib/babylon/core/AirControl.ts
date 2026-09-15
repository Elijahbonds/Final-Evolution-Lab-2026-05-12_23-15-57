// AirControl — Mode 3 Phase 5: mid-air trick execution with rotation
// physics. The air is a SIMULATION, not an animation: spin has momentum,
// grabs are held states, and combos chain flip → grab → spin with the
// angular state carrying through.
//
//   Spin momentum — initiating a spin sets angular velocity; it persists
//   and decays slightly in flight (no magic stopping). Landing checks read
//   the FINAL angle vs the board's neutral (Phase 6 consumes this).
//   Axis control — stick during flight nudges the rotation axis (flip vs
//   spin blend), so a 360-into-flip reads as one fluid motion.
//   Grab holds — a grab is a state with hold time (score accrues), a
//   release, and a small stability tax on the landing while held late.
//   Chains — each completed air trick adds to the airborne combo list;
//   the landing (Phase 6) scores the whole chain.

import { Vector3 } from '@babylonjs/core';

export interface AirTrick {
  id: string;
  label: string;
  family: 'flip' | 'grab' | 'spin';
  basePts: number;
  difficulty: number;          // 1..5 — raises landing strictness
  /** TRICK POSE (2026-09-15): a board flip is CAUGHT at this roll (radians, signed — kick +, heel −) over `flipSec`, so
   *  the landing grade and the deck the player sees agree. Without it a flip free-spins at FLICK_TO_ANGVEL until touchdown. */
  flipTarget?: number;
  flipSec?: number;
  /** A named SPIN caught at its angle (radians, signed) over `spinSec` — a 540 grab turns 540 and stops there. */
  spinTarget?: number;
  spinSec?: number;
}

export interface AirState {
  airborne: boolean;
  angularVel: Vector3;         // rad/s: x=flip, y=spin, z=roll
  rotation: Vector3;           // accumulated radians
  grabHeld: string | null;     // grab trick id while held
  grabTime: number;
  chain: AirTrick[];           // tricks thrown this air
  airtime: number;
  /** The roll a caught flip is heading for, and how fast it gets there (rad/s). */
  flipTarget: number;
  flipRate: number;
  spinTarget: number;
  spinRate: number;
}

export const SPIN_DAMPING = 0.06;        // per second — barely bleeds
export const FLICK_TO_ANGVEL = 7.2;      // rad/s per unit flick
export const AXIS_NUDGE_RATE = 2.4;      // rad/s² of stick axis control
export const GRAB_LANDING_TAX = 0.15;    // late-release stability penalty
export const GRAB_PTS_PER_SEC = 40;

export class AirControl {
  state: AirState = {
    airborne: false, angularVel: Vector3.Zero(), rotation: Vector3.Zero(),
    grabHeld: null, grabTime: 0, chain: [], airtime: 0, flipTarget: 0, flipRate: 0, spinTarget: 0, spinRate: 0,
  };

  /** Leaving the ground (jump, lip, drop-in). */
  launch(): void {
    this.state = {
      airborne: true, angularVel: Vector3.Zero(), rotation: Vector3.Zero(),
      grabHeld: null, grabTime: 0, chain: [], airtime: 0, flipTarget: 0, flipRate: 0, spinTarget: 0, spinRate: 0,
    };
  }

  /** A trick input lands mid-air. */
  applyTrick(trick: AirTrick, flickPower01 = 1): void {
    const s = this.state;
    if (!s.airborne) return;
    if (trick.spinTarget) {
      s.spinTarget += trick.spinTarget;
      s.spinRate = Math.abs(s.spinTarget - s.rotation.y) / Math.max(0.1, trick.spinSec ?? 0.6);
    }
    if (trick.family === 'spin' && trick.spinTarget) {
      // caught: nothing free-spinning to add
    } else if (trick.family === 'spin') {
      s.angularVel.y += FLICK_TO_ANGVEL * flickPower01 * (trick.id === 'bs360' ? -1 : 1);
    } else if (trick.family === 'flip') {
      if (trick.flipTarget !== undefined) {
        // caught: the deck turns exactly the trick's roll (0 for a board-only shuv) in the trick's own time
        s.flipTarget += trick.flipTarget;
        s.flipRate = trick.flipTarget ? Math.abs(s.flipTarget - s.rotation.z) / Math.max(0.1, trick.flipSec ?? 0.38) : s.flipRate;
      } else {
        s.angularVel.z += FLICK_TO_ANGVEL * flickPower01 * (trick.id === 'heelflip' ? -1 : 1);
      }
    } else {
      s.grabHeld = trick.id;
      s.grabTime = 0;
    }
    if (trick.family !== 'grab') s.chain.push(trick);
  }

  releaseGrab(): number {              // returns accrued grab points
    const s = this.state;
    if (!s.grabHeld) return 0;
    const pts = Math.round(s.grabTime * GRAB_PTS_PER_SEC);
    s.grabHeld = null;
    return pts;
  }

  /** Frame step: integrate rotation, damp spin, accrue grab time. Stick
   *  input nudges the rotation axis (air control). */
  update(dt: number, stickX = 0, stickY = 0): void {
    const s = this.state;
    if (!s.airborne) return;
    s.airtime += dt;
    s.angularVel.x += -stickY * AXIS_NUDGE_RATE * dt;   // pitch control
    s.angularVel.y += stickX * AXIS_NUDGE_RATE * dt;    // spin control
    s.angularVel.scaleInPlace(1 - SPIN_DAMPING * dt);
    s.rotation.addInPlace(s.angularVel.scale(dt));
    if (s.spinRate > 0) {
      const d = s.spinTarget - s.rotation.y;
      s.rotation.y += Math.sign(d) * Math.min(Math.abs(d), s.spinRate * dt);
      if (Math.abs(s.spinTarget - s.rotation.y) < 1e-4) s.spinRate = 0;
    }
    if (s.flipRate > 0) {
      const d = s.flipTarget - s.rotation.z;
      s.rotation.z += Math.sign(d) * Math.min(Math.abs(d), s.flipRate * dt);
      if (Math.abs(s.flipTarget - s.rotation.z) < 1e-4) s.flipRate = 0;
    }
    if (s.grabHeld) s.grabTime += dt;
  }

  /** Called by the landing system (Phase 6): how far from clean are we?
   *  0 = board perfectly under you; grows with residual rotation + spin. */
  landingError01(): number {
    const s = this.state;
    const wrap = (a: number) => {
      const twoPi = Math.PI * 2;
      return Math.abs(((a % twoPi) + twoPi * 1.5) % twoPi - Math.PI) / Math.PI; // 0..1 from neutral
    };
    const rotErr = Math.max(wrap(s.rotation.y), wrap(s.rotation.z), wrap(s.rotation.x) * 0.7);
    const spinErr = Math.min(1, s.angularVel.length() / 9);
    const grabTax = s.grabHeld && s.grabTime > 1.2 ? GRAB_LANDING_TAX : 0;
    return Math.min(1, rotErr * 0.65 + spinErr * 0.25 + grabTax);
  }

  land(): AirTrick[] {
    const chain = [...this.state.chain];
    this.state.airborne = false;
    this.state.chain = [];
    return chain;
  }
}
