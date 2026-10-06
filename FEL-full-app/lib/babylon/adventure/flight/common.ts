/**
 * What free flight and cruise share (lane A1): taking off, paying for flight, the box a flyer stays in, and landing.
 *
 * PAYING. A fused flyer spends ENERGY (contracts: anyone may spend energy, all or nothing through spendPool). A mount
 * spends its own flight stamina, which A1 keeps on the mount's body record — the actor's stamina pool is A2's (spend
 * and regen), and a carry is not a fight, so the two never fight over one number (EvolutionGarden.FlightController
 * kept its own stamina for the same reason). When the payment fails the flyer GLIDES: no climb, no dash, no cruise, a
 * slow sink to the ground (plan: "at zero energy you glide down"). It climbs back out once the pool refills past
 * `glideResume`.
 *
 * THE BOX. The ceiling (FlightParams.ceilingY; the BR zone has its own), the world's sides (WorldBounds; a contract
 * request asks for them on AdventureWorld), and the ground: a flyer never sinks into it, and descending to within
 * `landClearanceM` of it lands.
 */

import type { AdventureActor, FlightSource, MoveInput } from '../contracts';
import { spendPool } from '../contracts';
import type { BodyState, StepEnv } from '../movement/body';
import { enterState } from '../movement/state';
import { yawOf } from '../movement/math';

/** Ascend is the ascend button or jump held (the default pad: A held climbs; plan's control table). */
export const ascendOf = (inp: MoveInput): boolean => inp.ascendHeld || inp.jumpHeld;

/** Pay `cost` for flight from the source's pool. False (nothing spent) when it is short. */
export function payFlight(a: AdventureActor, b: BodyState, source: FlightSource, cost: number, free = false): boolean {
  if (free || !(cost > 0)) return true;
  if (source === 'fusion') return spendPool(a.stats.energy, cost);
  if (b.mountStamina + 1e-9 < cost) return false;
  b.mountStamina = Math.max(0, b.mountStamina - cost);
  return true;
}

/** What is left in the source's pool. */
export const flightReserve = (a: AdventureActor, b: BodyState, source: FlightSource): number =>
  source === 'fusion' ? a.stats.energy.cur : b.mountStamina;

export function takeOff(a: AdventureActor, b: BodyState, env: StepEnv): void {
  const fl = b.fl;
  a.wantsFlight = true;
  a.grounded = false;
  fl.mode = 'free'; fl.dashT = 0; fl.glide = false; fl.boomed = false; fl.boomAtSec = null; fl.bank = 0; fl.pitch = 0;
  a.vel.y = Math.max(a.vel.y, env.flight.ascendSpeed * 0.6);
  b.spinning = false; b.homingId = null; b.airDashT = 0; b.rising = false; b.wall = null;
  b.jumpedAt = env.tSec;
  enterState(a, 'flight', env.bus);
}

/** Touch down from flight onto the ground under the flyer. */
export function landFromFlight(a: AdventureActor, b: BodyState, gy: number, env: StepEnv): void {
  a.wantsFlight = false;
  a.pos.y = gy; a.vel.y = 0;
  a.grounded = true;
  b.fl.mode = 'free'; b.fl.dashT = 0; b.fl.bank = 0; b.fl.pitch = 0; b.fl.glide = false;
  b.speed = Math.hypot(a.vel.x, a.vel.z);
  if (b.speed > 0.1) b.heading = yawOf(a.vel.x, a.vel.z);
  b.coyote = 0; b.airDashes = 1; b.homingChain = 0; b.lastHomedId = null;
  b.landedAt = env.tSec;
  enterState(a, 'ground', env.bus);
}

/** The source is gone (unfused, the mount dismounted or down): fall. */
export function dropFromFlight(a: AdventureActor, b: BodyState, env: StepEnv): void {
  a.wantsFlight = false;
  a.grounded = false;
  b.fl.mode = 'free'; b.fl.dashT = 0; b.fl.bank = 0; b.fl.pitch = 0; b.fl.glide = false;
  b.coyote = Infinity; b.rising = false;
  enterState(a, 'air', env.bus);
}

/**
 * Keep the flyer inside the ceiling and the world's sides, above the ground; land when descending close to it.
 * Returns true when the flyer landed.
 */
export function boxFlight(a: AdventureActor, b: BodyState, descending: boolean, env: StepEnv, floorM = 0): boolean {
  const F = env.flight;
  if (a.pos.y > F.ceilingY) { a.pos.y = F.ceilingY; if (a.vel.y > 0) a.vel.y = 0; }
  const bd = env.bounds;
  if (bd) {
    if (a.pos.x < bd.minX) { a.pos.x = bd.minX; if (a.vel.x < 0) a.vel.x = 0; }
    if (a.pos.x > bd.maxX) { a.pos.x = bd.maxX; if (a.vel.x > 0) a.vel.x = 0; }
    if (a.pos.z < bd.minZ) { a.pos.z = bd.minZ; if (a.vel.z < 0) a.vel.z = 0; }
    if (a.pos.z > bd.maxZ) { a.pos.z = bd.maxZ; if (a.vel.z > 0) a.vel.z = 0; }
  }
  const gy = env.world.groundY(a.pos.x, a.pos.z);
  if (gy === null) return false;
  if (descending && a.vel.y <= 0 && a.pos.y - gy <= F.landClearanceM) { landFromFlight(a, b, gy, env); return true; }
  if (a.pos.y < gy + floorM) { a.pos.y = gy + floorM; if (a.vel.y < 0) a.vel.y = 0; }
  return false;
}
