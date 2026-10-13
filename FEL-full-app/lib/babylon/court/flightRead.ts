// FLIGHT READ (vis-court, wave 2, 2026-10-13) — the numbers a broadcast puts beside a ball in the air.
//
// Pure. The golf tracer reads APEX and CARRY, the derby jumbotron reads EXIT VELO, LAUNCH ANGLE and DISTANCE. All of it is a
// reading of a flight the game already flew: nothing here feeds back into a flight, a score or a judge, and this file imports
// no game rule (a wiring test holds that).

export interface V3 { x: number; y: number; z: number }

export const MPS_TO_MPH = 2.236936;
export const M_TO_FT = 3.28084;

export const flatDist = (a: V3, b: V3): number => Math.hypot(b.x - a.x, b.z - a.z);
/** The carry: ground distance from where it left to where it came down. */
export const carryFlat = flatDist;
export const speedOf = (v: V3): number => Math.hypot(v.x, v.y, v.z);

/** Launch angle above the horizon, degrees (a ball going straight up is 90, a flat drive 0). */
export function launchAngleDeg(v: V3): number {
  const flat = Math.hypot(v.x, v.z);
  return (Math.atan2(v.y, flat) * 180) / Math.PI;
}

/** The highest sample, and its height over `baseY` (the launch height unless told). Null for no samples. */
export function apexOf(samples: readonly V3[], baseY?: number): { at: V3; height: number } | null {
  if (!samples.length) return null;
  let best = samples[0];
  for (const s of samples) if (s.y > best.y) best = s;
  return { at: best, height: Math.max(0, best.y - (baseY ?? samples[0].y)) };
}

/** Whole metres, never "-0". */
export const wholeM = (m: number): number => Math.max(0, Math.round(m));

/** "APEX 21 m · CARRY 186 m" — the golf tracer's readout. */
export function tracerLine(apexM: number, carryM: number): string {
  return `APEX ${wholeM(apexM)} m · CARRY ${wholeM(carryM)} m`;
}

export interface ExitRead { mph: number; deg: number; ft: number; lines: [string, string, string] }

/** The Statcast board for one batted ball: speed off the bat, launch angle, distance in feet. */
export function exitRead(vel: V3, distFt: number): ExitRead {
  const mph = Math.round(speedOf(vel) * MPS_TO_MPH);
  const deg = Math.round(launchAngleDeg(vel));
  const ft = Math.max(0, Math.round(distFt));
  return { mph, deg, ft, lines: [`EXIT VELO ${mph} MPH`, `LAUNCH ${deg}°`, `DISTANCE ${ft} FT`] };
}

/** Constant-screen-size scale for a billboard `dist` metres from the camera (so a readout reads at any range). */
export function readoutScale(dist: number, min = 0.9, max = 9): number {
  return Math.max(min, Math.min(max, dist * 0.075));
}
