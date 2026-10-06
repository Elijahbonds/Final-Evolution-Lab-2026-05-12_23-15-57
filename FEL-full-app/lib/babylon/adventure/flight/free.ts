/**
 * Free flight (lane A1; docs/ADVENTURE-PLAN.md "flight/free.ts").
 *
 * THE FEEL (the open-world brawler's flight; a feel reference only): you HOVER. The stick moves you through the air,
 * camera-relative, at 14 m/s; ascend (held) climbs at 8, descend (held) drops at 10; let go of everything and you stop
 * where you are, ready to fight. Dash is a 30 m/s burst for 0.35 s (10 energy). Keep the dash HELD past 18 m/s and you
 * are in cruise (cruise.ts). Out of energy you glide down.
 */

import type { AdventureActor, FlightSource, MoveInput } from '../contracts';
import type { BodyState, StepEnv } from '../movement/body';
import type { Wish } from '../movement/input';
import { yawOf } from '../movement/math';
import { ascendOf, boxFlight, flightReserve, payFlight } from './common';
import { enterCruise } from './cruise';

/**
 * One step of free flight at speed multiplier `mult`. Returns true when the flyer landed this step.
 * May hand the flyer to cruise (b.fl.mode becomes 'cruise').
 */
export function stepFree(
  a: AdventureActor, b: BodyState, inp: MoveInput, w: Wish, env: StepEnv, dt: number, source: FlightSource, mult: number,
): boolean {
  const F = env.flight, X = env.fx, fl = b.fl;
  if (fl.glide && flightReserve(a, b, source) >= X.glideResume) fl.glide = false;
  const ascend = ascendOf(inp) && !fl.glide, descend = inp.descendHeld;

  // The dash burst.
  if (inp.dash && !fl.glide && fl.dashT <= 0 && payFlight(a, b, source, F.dashCost)) {
    let dx = w.mag > 0.2 ? w.x / w.mag : Math.sin(a.facingYaw), dz = w.mag > 0.2 ? w.z / w.mag : Math.cos(a.facingYaw);
    let dy = ascend ? 0.45 : descend ? -0.45 : 0;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    fl.dashDir.x = dx; fl.dashDir.y = dy; fl.dashDir.z = dz;
    fl.dashT = F.dashSec;
  }

  if (fl.dashT > 0) {
    fl.dashT = Math.max(0, fl.dashT - dt);
    const sp = F.dashSpeed * mult;
    a.vel.x = fl.dashDir.x * sp; a.vel.y = fl.dashDir.y * sp; a.vel.z = fl.dashDir.z * sp;
  } else {
    const top = F.freeSpeed * mult * (fl.glide ? X.glideSpeedShare : 1);
    const tx = w.x * top, tz = w.z * top;
    const ty = fl.glide ? -X.glideSink : ascend ? F.ascendSpeed * mult : descend ? -F.descendSpeed * mult : 0;
    const dx = tx - a.vel.x, dy = ty - a.vel.y, dz = tz - a.vel.z;
    const dl = Math.hypot(dx, dy, dz), step = F.freeAccel * dt;
    if (dl <= step) { a.vel.x = tx; a.vel.y = ty; a.vel.z = tz; }
    else { a.vel.x += (dx / dl) * step; a.vel.y += (dy / dl) * step; a.vel.z += (dz / dl) * step; }
  }

  // Hold the dash past the threshold: cruise.
  const planar = Math.hypot(a.vel.x, a.vel.z);
  if (!fl.glide && inp.dashHeld && planar >= F.cruiseEnterSpeed) enterCruise(a, b);

  if (!payFlight(a, b, source, F.drainPerSec.free * dt)) fl.glide = true;

  a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
  if (planar > 0.5) a.facingYaw = yawOf(a.vel.x, a.vel.z);
  else if (w.mag > 0.2) a.facingYaw = yawOf(w.x, w.z);
  return boxFlight(a, b, descend || fl.glide, env);
}
