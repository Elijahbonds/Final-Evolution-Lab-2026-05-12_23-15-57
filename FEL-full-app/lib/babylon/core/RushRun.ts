// RushRun — the ball carrier as a body with MOMENTUM (owner, 2026-09-18: "football, tennis and soccer upgrades next").
//
// The runner used to be a velocity written straight from the stick every frame: full speed on the first frame of a
// push, a lane change at the stick's own rate, no lean and nothing for the weather to take hold of. A carrier
// accelerates, takes longer to stop than to start, and cuts through a lateral speed that a wet or snowy field softens
// — the NFL Street feel is a heavy body under a light stick. Pure; the mode integrates it and reads the weather in.

export interface RunState { vx: number; vz: number }
export const RUN = {
  base: 5.5, push: 2.5,        // m/s: the jog, and what the stick adds
  accel: 16, decel: 22,        // m/s² forward
  lateral: 5, lateralTruck: 2, // m/s: the lane-change speed the stick asks for (lowered shoulder = committed line)
  lateralAccel: 22,            // m/s² sideways — grip scales this: wet turf takes longer to answer a cut
} as const;

export interface RunOpts { boost: number; trucking: boolean; held: boolean; /** WeatherKit.gripMult, 0.9..1 */ grip: number; /** WeatherKit.boardDragMult, 1..1.12 — snow underfoot */ drag: number }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One frame of the carrier: the stick is an INTENT the body chases. */
export function stepRun(s: RunState, intent: { x: number; y: number }, dt: number, o: RunOpts): RunState {
  const grip = clamp(o.grip, 0.7, 1), drag = Math.max(1, o.drag);
  const targetVz = o.held ? 0 : ((RUN.base + Math.max(0, -intent.y) * RUN.push) * o.boost * (o.trucking ? 1.08 : 1)) / drag;
  const targetVx = o.held ? 0 : clamp(intent.x, -1, 1) * (o.trucking ? RUN.lateralTruck : RUN.lateral) * o.boost * grip;
  const dvz = targetVz - s.vz, dvx = targetVx - s.vx;
  const vz = s.vz + clamp(dvz, -RUN.decel * dt, RUN.accel * dt);
  const vx = s.vx + clamp(dvx, -RUN.lateralAccel * grip * grip * dt, RUN.lateralAccel * grip * grip * dt);
  return { vx, vz };
}

/** A juke's cut takes longer to bite on a slick field — it carries the same distance over more time. */
export function cutSlideSec(baseSec: number, grip: number): number { return baseSec / clamp(grip, 0.7, 1); }

/** The BREAKAWAY meter: evades this drive toward the threshold, then the breakaway's own clock draining. Lines per evade. */
export function breakawayMeter(driveEvades: number, threshold: number, activeSec: number, totalSec: number): { fill01: number; ticks: number[]; active: boolean } {
  const active = activeSec > 0;
  const fill01 = active ? clamp(activeSec / totalSec, 0, 1) : clamp(driveEvades / threshold, 0, 1);
  return { fill01, ticks: Array.from({ length: threshold - 1 }, (_, i) => (i + 1) / threshold), active };
}

/** Where a defender running at `defSpeed` meets a carrier holding this velocity — the point to read the pursuit angle from.
 *  Solves |r + v t − d| = s t; null when he cannot catch you (then he is behind you, and the read is "run"). */
export function interceptPoint(runner: { x: number; z: number }, vel: { x: number; z: number }, def: { x: number; z: number }, defSpeed: number, maxSec = 3): { x: number; z: number; t: number } | null {
  const rx = runner.x - def.x, rz = runner.z - def.z;
  const a = vel.x * vel.x + vel.z * vel.z - defSpeed * defSpeed;
  const b = 2 * (rx * vel.x + rz * vel.z);
  const c = rx * rx + rz * rz;
  let t: number;
  if (Math.abs(a) < 1e-6) { if (Math.abs(b) < 1e-6) return null; t = -c / b; }
  else { const disc = b * b - 4 * a * c; if (disc < 0) return null; const s = Math.sqrt(disc); const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a); t = Math.min(...[t1, t2].filter((v) => v > 0)); if (!isFinite(t)) return null; }
  if (t <= 0 || t > maxSec) return null;
  return { x: runner.x + vel.x * t, z: runner.z + vel.z * t, t };
}
