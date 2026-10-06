/**
 * Cruise (lane A1; docs/ADVENTURE-PLAN.md "flight/cruise.ts").
 *
 * THE FEEL (the superhero flight film's game; a feel reference only): hold the dash and you go FAST — 18 to 40 m/s —
 * and you turn by BANKING into it (up to 60°), like core/FlightModel's grammar: the turn comes from the bank, so a hard
 * turn reads in the body. Ascend and descend pitch the nose; a dive gains speed and a climb costs it (FlightModel's
 * first rule). Crossing into top speed fires the BOOM once (the view's ring and the camera's punch). Let go of the dash
 * and you settle back to free flight. Cruise never lands: it holds a little air under you, it stays under the ceiling,
 * and near a world bound it banks you back in (ArcadeFlight's wall turn, as a steer instead of a scrape).
 */

import type { AdventureActor, FlightSource, MoveInput } from '../contracts';
import type { BodyState, StepEnv } from '../movement/body';
import { approach, clamp, wrapAngle, yawOf } from '../movement/math';
import { ascendOf, boxFlight, payFlight } from './common';

export function enterCruise(a: AdventureActor, b: BodyState): void {
  const fl = b.fl;
  const sp = Math.hypot(a.vel.x, a.vel.y, a.vel.z);
  fl.mode = 'cruise';
  fl.heading = yawOf(a.vel.x, a.vel.z);
  fl.pitch = sp > 1e-3 ? Math.asin(clamp(a.vel.y / sp, -1, 1)) : 0;
  fl.speed = sp;
  fl.bank = 0;
  fl.boomed = false;
  fl.dashT = 0;
}

/**
 * The steer a world bound asks for: −1..1 toward the inside when the flyer is inside `margin` of a side and heading
 * out, else 0. Pure (tested).
 */
export function boundSteer(x: number, z: number, heading: number, bd: StepEnv['bounds'], margin: number): number {
  if (!bd) return 0;
  const hx = Math.sin(heading), hz = Math.cos(heading);
  let urgency = 0;
  if (hx < 0) urgency = Math.max(urgency, 1 - (x - bd.minX) / margin);
  if (hx > 0) urgency = Math.max(urgency, 1 - (bd.maxX - x) / margin);
  if (hz < 0) urgency = Math.max(urgency, 1 - (z - bd.minZ) / margin);
  if (hz > 0) urgency = Math.max(urgency, 1 - (bd.maxZ - z) / margin);
  if (urgency <= 0) return 0;
  const cx = (bd.minX + bd.maxX) / 2, cz = (bd.minZ + bd.maxZ) / 2;
  const diff = wrapAngle(yawOf(cx - x, cz - z) - heading);
  return Math.sign(diff || 1) * Math.min(1, 0.4 + urgency);
}

/** One step of cruise. Returns true when the flyer landed (it never does from cruise; kept for symmetry). */
export function stepCruise(
  a: AdventureActor, b: BodyState, inp: MoveInput, env: StepEnv, dt: number, source: FlightSource, mult: number,
): boolean {
  const F = env.flight, X = env.fx, fl = b.fl;
  if (!inp.dashHeld || fl.glide) { fl.mode = 'free'; fl.bank = 0; return false; }

  // Bank: the stick (raw x: the cruise camera sits behind the flyer) or the lean, overruled by a near bound.
  let steer = clamp(inp.move.x + inp.lean, -1, 1);
  const back = boundSteer(a.pos.x, a.pos.z, fl.heading, env.bounds, X.boundMargin);
  if (back !== 0) steer = back;
  const bankTarget = steer * F.cruiseBankMaxRad;
  fl.bank += (bankTarget - fl.bank) * (1 - Math.exp(-X.bankEase * dt));
  fl.bank = clamp(fl.bank, -F.cruiseBankMaxRad, F.cruiseBankMaxRad);
  fl.heading = wrapAngle(fl.heading + F.cruiseTurnRate * (Math.sin(fl.bank) / Math.sin(F.cruiseBankMaxRad)) * dt);

  // Pitch: ascend / descend, kept off the ceiling and the ground.
  let pitchTarget = ascendOf(inp) ? X.maxPitch : inp.descendHeld ? -X.maxPitch : 0;
  if (a.pos.y > F.ceilingY - 5) pitchTarget = Math.min(pitchTarget, 0);
  const gy = env.world.groundY(a.pos.x, a.pos.z);
  if (gy !== null && a.pos.y - gy < X.cruiseFloorM + 3) pitchTarget = Math.max(pitchTarget, 0.2);
  fl.pitch += (pitchTarget - fl.pitch) * (1 - Math.exp(-X.pitchEase * dt));

  // Speed: toward the top, a dive adds and a climb costs.
  const top = F.cruiseSpeed * mult;
  fl.speed = approach(fl.speed, top, F.cruiseAccel * dt);
  fl.speed -= Math.sin(fl.pitch) * X.noseGravity * dt;
  fl.speed = clamp(fl.speed, F.cruiseEnterSpeed * 0.8, top * (1 + X.diveOverspeed));
  if (!fl.boomed && fl.speed >= X.boomShare * top) { fl.boomed = true; fl.boomAtSec = env.tSec; }

  const cp = Math.cos(fl.pitch);
  a.vel.x = Math.sin(fl.heading) * cp * fl.speed;
  a.vel.y = Math.sin(fl.pitch) * fl.speed;
  a.vel.z = Math.cos(fl.heading) * cp * fl.speed;
  a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
  a.facingYaw = fl.heading;

  if (!payFlight(a, b, source, F.drainPerSec.cruise * dt)) { fl.glide = true; fl.mode = 'free'; fl.bank = 0; }
  return boxFlight(a, b, false, env, X.cruiseFloorM);
}
