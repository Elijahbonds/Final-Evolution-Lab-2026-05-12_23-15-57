/**
 * The momentum run (lane A1; docs/ADVENTURE-PLAN.md "movement/ground.ts").
 *
 * THE FEEL (a feel reference only): quick to a run, then the speed BUILDS. Full tilt reaches the run speed (9 m/s) in
 * under a second; holding it on a straight fills FreeRunFlow's FLOW meter, each tier raises the top speed, and the
 * runner creeps up to it — 14 m/s at the top tier in about seven seconds. A part tilt jogs (6). Downhill adds speed past
 * the top and the runner keeps it (momentum), uphill costs it. Turning gets wider as the speed climbs, and a hard
 * reversal at speed is a SKID (a brake and a FLOW cost), not an instant about-face.
 *
 * Reuses: contracts.wishDir (via input.wishInto), FreeRunFlow.FlowMeter (the tiers), FreeRunCore's walk gate (below it
 * you pivot on the spot, as groundTurnRate does).
 */

import type { AdventureActor, MoveInput } from '../contracts';
import type { BodyState, StepEnv } from './body';
import type { Wish } from './input';
import { clamp, wrapAngle, yawOf } from './math';
import { PIVOT_SPEED, type GroundParams } from './params';
import { enterState } from './state';

/** The top speed of a FLOW tier, with the PRQ feel. */
export function topSpeedFor(g: GroundParams, tier: number, feelRun = 1): number {
  return g.flowTopSpeeds[clamp(Math.floor(tier) || 0, 0, 3)] * feelRun;
}

/** The speed a stick of magnitude `mag` asks for, given the current top. */
export function targetSpeedFor(g: GroundParams, mag: number, top: number, feelRun = 1): number {
  if (mag <= 0) return 0;
  const jog = g.jogSpeed * feelRun;
  if (mag < g.jogTilt) return jog * (mag / g.jogTilt);
  return jog + (top - jog) * ((mag - g.jogTilt) / (1 - g.jogTilt));
}

/** Heading turn rate at a speed: a pivot below the walk gate, narrowing from `turnRate` at the run to `turnRateAtTop`. */
export function turnRateFor(g: GroundParams, speed: number): number {
  if (speed <= PIVOT_SPEED) return Infinity;
  const k = clamp((speed - g.runSpeed) / Math.max(1e-6, g.flowTopSpeeds[3] - g.runSpeed), 0, 1);
  return g.turnRate + (g.turnRateAtTop - g.turnRate) * k;
}

/** One tick of speed (no position): accelerate toward `target`, coast, keep overspeed, skid. Pure; tested directly. */
export function stepRunSpeed(
  g: GroundParams, speed: number, target: number, top: number, held: boolean, sprint: boolean, skid: boolean, dt: number,
): number {
  if (skid) return Math.max(0, speed - g.skidDecel * dt);
  if (target > speed) {
    const base = speed < g.runSpeed ? g.accel : g.buildAccel;
    return Math.min(target, speed + base * (sprint ? g.sprintAccelMult : 1) * dt);
  }
  if (speed > top && held) return Math.max(target, speed - g.overspeedDecay * dt);   // momentum: slow to give back
  return Math.max(target, speed - g.decel * dt);
}

/** The ground's rise over run along (hx, hz) at (x, z), from two height samples (null over a void). */
export function slopeAlong(env: StepEnv, x: number, z: number, hx: number, hz: number): number {
  const h0 = env.world.groundY(x, z);
  const h1 = env.world.groundY(x + hx * 0.5, z + hz * 0.5);
  if (h0 === null || h1 === null) return 0;
  return (h1 - h0) / 0.5;
}

/** Become airborne off the ground (a ledge, a void, a launch). */
export function leaveGround(a: AdventureActor, b: BodyState, env: StepEnv): void {
  a.grounded = false;
  b.coyote = 0;
  b.rising = false;
  b.skidding = false;
  enterState(a, 'air', env.bus);
}

/** The ground jump (also from coyote time and the buffer): a spin jump. */
export function groundJump(a: AdventureActor, b: BodyState, env: StepEnv): void {
  const air = env.p.air;
  a.vel.y = air.jumpSpeed * Math.sqrt(b.feel.hang);
  a.grounded = false;
  b.coyote = Infinity;           // the coyote jump is spent
  b.jumpBuffer = 0;
  b.rising = true;
  b.spinning = true;
  b.launched = false;
  b.skidding = false;
  b.jumpedAt = env.tSec;
  enterState(a, 'air', env.bus);
}

/** One fixed step on the ground. */
export function stepGround(a: AdventureActor, b: BodyState, inp: MoveInput, w: Wish, env: StepEnv, dt: number, topOverride?: number): void {
  const g = env.p.ground;
  const top = topOverride ?? topSpeedFor(g, b.flow.tier, b.feel.run);
  const target = topOverride !== undefined ? w.mag * topOverride : targetSpeedFor(g, w.mag, top, b.feel.run);

  // Heading: turn toward the wish at the speed's turn rate, or skid through a reversal.
  let skid = false;
  if (w.mag > 0) {
    const want = yawOf(w.x, w.z);
    const diff = wrapAngle(want - b.heading);
    if (Math.abs(diff) > g.skidAngle && b.speed > g.jogSpeed) skid = true;
    else {
      const rate = turnRateFor(g, b.speed);
      b.heading = rate === Infinity || Math.abs(diff) <= rate * dt ? want : wrapAngle(b.heading + Math.sign(diff) * rate * dt);
    }
  }
  b.skidding = skid;

  // Slopes: gravity along the ground. Downhill adds past the top (kept by stepRunSpeed's overspeed rule); uphill also
  // lowers the speed the legs can hold, or the run's acceleration would simply cancel the slope.
  const hx = Math.sin(b.heading), hz = Math.cos(b.heading);
  const rise = b.speed > 0.5 || w.mag > 0 ? slopeAlong(env, a.pos.x, a.pos.z, hx, hz) : 0;
  const sin = rise / Math.sqrt(1 + rise * rise);
  const legs = sin > 0 ? Math.max(0.4, 1 - g.uphillTopLoss * sin) : 1;
  let speed = stepRunSpeed(g, b.speed, target * legs, top * legs, w.mag > 0, inp.dashHeld, skid, dt);
  if (skid && speed <= PIVOT_SPEED) { b.heading = yawOf(w.x, w.z); b.skidding = false; }
  if (speed > 0.5) speed -= g.slopeGravity * sin * dt;
  speed = clamp(speed, 0, g.maxSpeed);

  // FLOW: running near the top on a straight fills it; standing drains it; a skid spends it.
  if (skid) b.flow.add(-g.skidFlowPerSec * dt);
  else if (speed >= 0.9 * top && w.mag > 0.9) b.flow.add(g.runFlowPerSec * dt);
  b.flow.tick(dt, speed < g.jogSpeed * 0.5);

  // Move, then find the ground: walk up a step, stick to a small drop, fall off a ledge, stop at a wall.
  const nx = a.pos.x + hx * speed * dt, nz = a.pos.z + hz * speed * dt;
  const gy = env.world.groundY(nx, nz);
  b.speed = speed;
  a.vel.x = hx * speed; a.vel.z = hz * speed; a.vel.y = 0;
  if (gy !== null && gy - a.pos.y > g.stepUp) {
    b.speed = 0; a.vel.x = 0; a.vel.z = 0;          // a wall: the runner stops at it
  } else if (gy === null || a.pos.y - gy > g.stepDown) {
    a.pos.x = nx; a.pos.z = nz;
    leaveGround(a, b, env);
  } else {
    a.pos.x = nx; a.pos.z = nz; a.pos.y = gy;
  }
  if (speed > 0.1) a.facingYaw = b.heading;
  else if (w.mag > 0) { a.facingYaw = yawOf(w.x, w.z); b.heading = a.facingYaw; }
}
