/**
 * The air (lane A1; docs/ADVENTURE-PLAN.md "movement/air.ts"): the spin jump, air steering and the air dash.
 *
 * THE FEEL (a feel reference only): the jump is a spin — the body balls up and is itself an attack (A2 reads
 * `spinning` through the movement system's telemetry). Let go of jump early and the rise is cut, so a tap is a hop and a
 * hold is the full ~2.2 m. A jump pressed a beat before landing still happens (the buffer), and one pressed a beat after
 * running off a ledge still counts (coyote time) — the two forgivenesses a pad, a phone and a keyboard all need. In the
 * air the stick steers without killing the run's speed. One air dash per airtime; a homing hit or a rail gives it back.
 */

import type { AdventureActor, MoveInput } from '../contracts';
import type { BodyState, StepEnv } from './body';
import type { Wish } from './input';
import { yawOf } from './math';
import { enterState } from './state';

/** Above this planar speed the body faces where it is going; below it keeps its facing. [TUNE] */
export const FACE_RUN_SPEED = 3;

/** The apex height of a jump at take-off speed v under gravity g: v² / 2g (spin-jump apex test). */
export const jumpApex = (v: number, g: number): number => (v * v) / (2 * g);

/** Start an air dash along the stick (or the facing with the stick centred). Returns false with none left. */
export function startAirDash(a: AdventureActor, b: BodyState, w: Wish, env: StepEnv): boolean {
  if (b.airDashes <= 0 || b.airDashT > 0) return false;
  const air = env.p.air;
  const yaw = w.mag > 0.3 ? yawOf(w.x, w.z) : a.facingYaw;
  const planar = Math.hypot(a.vel.x, a.vel.z);
  const sp = Math.max(planar, air.airDashSpeed);
  a.vel.x = Math.sin(yaw) * sp; a.vel.z = Math.cos(yaw) * sp;
  a.vel.y = Math.max(a.vel.y, air.airDashLift);
  a.facingYaw = yaw;
  b.airDashes--;
  b.airDashT = air.airDashSec;
  b.rising = false;
  b.spinning = true;
  return true;
}

/** Gravity, the variable jump, steering and the move. Landing and catches are the caller's (index.ts orders them). */
export function integrateAir(a: AdventureActor, b: BodyState, inp: MoveInput, w: Wish, env: StepEnv, dt: number): void {
  const air = env.p.air;
  b.coyote += dt;
  if (b.jumpBuffer > 0) b.jumpBuffer = Math.max(0, b.jumpBuffer - dt);

  // The variable jump: a release while rising cuts the rise once.
  if (b.rising && !inp.jumpHeld && a.vel.y > 0) { a.vel.y *= air.jumpCutMult; b.rising = false; }
  if (a.vel.y <= 0) b.rising = false;

  let gScale = 1;
  if (b.airDashT > 0) { b.airDashT = Math.max(0, b.airDashT - dt); gScale = air.airDashGravity; }
  else {
    // Steering: toward the stick at the run's own speed (never below airMinSpeed × tilt), so steering keeps momentum.
    if (w.mag > 0) {
      const planar = Math.hypot(a.vel.x, a.vel.z);
      const reach = Math.max(planar, air.airMinSpeed * w.mag);
      const tx = (w.x / w.mag) * reach, tz = (w.z / w.mag) * reach;
      const dx = tx - a.vel.x, dz = tz - a.vel.z;
      const dl = Math.hypot(dx, dz), step = air.airAccel * dt;
      if (dl <= step) { a.vel.x = tx; a.vel.z = tz; }
      else { a.vel.x += (dx / dl) * step; a.vel.z += (dz / dl) * step; }
    }
  }
  // Velocity Verlet on y (the mean of the old and new vertical speed), so the apex is v²/2g at any step size.
  const vy0 = a.vel.y;
  a.vel.y = Math.max(-air.maxFall, a.vel.y - air.gravity * gScale * dt);
  a.pos.x += a.vel.x * dt; a.pos.y += (vy0 + a.vel.y) * 0.5 * dt; a.pos.z += a.vel.z * dt;
  // The facing follows a real run, not a homing bounce's small kick back (the next target stays ahead).
  if (Math.hypot(a.vel.x, a.vel.z) > FACE_RUN_SPEED) a.facingYaw = yawOf(a.vel.x, a.vel.z);
}

/** Touch down when the feet reach the ground while falling. Keeps the planar speed: landing never brakes a run. */
export function tryLand(a: AdventureActor, b: BodyState, env: StepEnv): boolean {
  if (a.vel.y > 0) return false;
  const gy = env.world.groundY(a.pos.x, a.pos.z);
  if (gy === null || a.pos.y > gy) return false;
  a.pos.y = gy;
  a.vel.y = 0;
  a.grounded = true;
  b.speed = Math.hypot(a.vel.x, a.vel.z);
  if (b.speed > 0.1) b.heading = yawOf(a.vel.x, a.vel.z);
  b.coyote = 0;
  b.airDashes = 1; b.airDashT = 0;
  b.rising = false; b.spinning = false;
  b.homingChain = 0; b.lastHomedId = null;
  b.landedAt = env.tSec;
  enterState(a, 'ground', env.bus);
  return true;
}
