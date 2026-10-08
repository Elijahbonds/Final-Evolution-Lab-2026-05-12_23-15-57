/**
 * lib/feel/cores/air-hill.ts
 * ==========================
 * IMPROVE (2026-10-06, Big Air items 1 / 2 / 8): the jump the air session is ridden on — a kicker, a table, a knuckle and a
 * pitched landing — as numbers the core lands on and the venue builds from, so the two agree because they read one table.
 *
 * Before: the core launched at launchZ (−60) off bare snow, touched down at y ≤ 0 on a flat 60 × 400 sheet, and the only
 * "kicker" was a 0.5 m box 48 m earlier at z −12. Every air landed to flat from ~12 m.
 *
 * The profile, down the run (−z):
 *
 *        lip                     table (deckY)           knuckle
 *         /|                 _______________________________
 *   _____/ |   the gap      /                               \ ← landing (landPitchDeg)
 *  in-run  |_______________/ front face (45°)                 \________ run-out (the flat)
 *    launchZ + kickerLen → launchZ          deckFrontZ          knuckleZ → bottomZ
 *
 * Where a landing sets down decides what the judge may give it: on the landing slope (`sweet`) the grade stands; short of
 * it (`knuckle`: the table, the knuckle's roll, the face or the gap) or past it (`flat`: the run-out) the landing is cased
 * or flat-dropped and is never better than sketchy. How far you fly is the speed you carry off the lip, so the landing is a
 * SPEED window: too slow knuckles, too fast overshoots (`sweetBand` measures it).
 *
 * Pure: no Babylon, no DOM. The flight here is the core's own (its gravity curve, its forward carry).
 */

import { gravityAccelForVy, type GravityConfig } from '../index';

export interface AirHill {
  /** The kicker's ramp length (m) — it rises from the in-run to the lip, which sits at the skin's launchZ. */
  kickerLen: number;
  /** The lip's height (m). */
  lipY: number;
  /** Where the landing's front face meets the snow (z, m). The face climbs at 45° to the table. */
  deckFrontZ: number;
  /** The table's height (m) — the knuckle's. */
  deckY: number;
  /** Where the table ends and the landing falls away (z, m). */
  knuckleZ: number;
  /** The landing slope's pitch (degrees). It runs from the knuckle down to the run-out at y 0. */
  landPitchDeg: number;
  /** The first metres past the knuckle still count as the knuckle (its roll), not the landing. */
  knuckleRoundM: number;
}

export type LandingZone = 'knuckle' | 'sweet' | 'flat';

export interface HillSurface {
  /** The snow's height (m) under z. */
  y(z: number): number;
  /** Where a landing at z set down. */
  zone(z: number): LandingZone;
  /** The surface's pitch at z (radians; positive = rising down the run, as the kicker does). */
  pitch(z: number): number;
  /** The landing slope's foot — the run-out starts here. */
  bottomZ: number;
  /** The first z of the landing proper (past the knuckle's roll). */
  sweetFromZ: number;
}

/** The surface a hill makes with its lip at `launchZ`. */
export function hillSurface(h: AirHill, launchZ: number): HillSurface {
  const kickTop = launchZ + h.kickerLen;
  const faceTopZ = h.deckFrontZ - h.deckY;           // 45°: as far along as it is high
  const landLen = h.deckY / Math.tan((h.landPitchDeg * Math.PI) / 180);
  const bottomZ = h.knuckleZ - landLen;
  const sweetFromZ = h.knuckleZ - h.knuckleRoundM;
  const y = (z: number): number => {
    if (z > kickTop) return 0;
    if (z >= launchZ) return h.lipY * (kickTop - z) / h.kickerLen;                 // the kicker
    if (z > h.deckFrontZ) return 0;                                                 // the gap
    if (z > faceTopZ) return h.deckFrontZ - z;                                      // the front face
    if (z >= h.knuckleZ) return h.deckY;                                            // the table
    if (z > bottomZ) return h.deckY * (z - bottomZ) / landLen;                      // the landing
    return 0;                                                                       // the run-out
  };
  const zone = (z: number): LandingZone => (z >= sweetFromZ ? 'knuckle' : z >= bottomZ ? 'sweet' : 'flat');
  const pitch = (z: number): number => {
    if (z <= kickTop && z >= launchZ) return Math.atan2(h.lipY, h.kickerLen);
    if (z < h.knuckleZ && z > bottomZ) return -(h.landPitchDeg * Math.PI) / 180;
    return 0;
  };
  return { y, zone, pitch, bottomZ, sweetFromZ };
}

/** The flat ground every skin had before a hill: y 0 everywhere, every landing on it. */
export const FLAT_SURFACE: HillSurface = { y: () => 0, zone: () => 'sweet', pitch: () => 0, bottomZ: -Infinity, sweetFromZ: Infinity };

export interface FlightStart { z: number; y: number; vy: number; fwd: number }
export interface Touchdown { sec: number; z: number; y: number }

/**
 * Where a flight from `f` meets the surface — the core's own integration (its gravity curve), forward from here. The
 * touchdown rule is the core's: falling onto the snow, or meeting a face it is inside of (the landing's front face).
 */
export function simulateTouchdown(f: FlightStart, g: GravityConfig, surf: HillSurface, dt = 1 / 120, maxSec = 8): Touchdown {
  let { z, y, vy } = f, t = 0;
  while (t < maxSec) {
    z -= f.fwd * dt; vy -= gravityAccelForVy(vy, g) * dt; y += vy * dt; t += dt;
    const sy = surf.y(z);
    if ((vy < 0 && y <= sy) || y < sy - FACE_HIT_M) return { sec: t, z, y: sy };
  }
  return { sec: t, z, y: surf.y(z) };
}
/** Deeper than this under the surface while still rising is a face met, not a landing from above. */
export const FACE_HIT_M = 0.3;

/** The launch a skin's tuning gives at `speed` off its lip (the core's _launch). */
export function launchAt(t: { launchZ: number; baseLaunch: number; maxRunSpeed: number; speedLaunchBonus: number; airForwardMin: number; airForwardFactor: number }, speed: number, lipY: number): FlightStart {
  return { z: t.launchZ, y: lipY, vy: t.baseLaunch + (speed / t.maxRunSpeed) * t.speedLaunchBonus, fwd: Math.max(t.airForwardMin, speed * t.airForwardFactor) };
}

/**
 * The launch speeds (m/s) that land on the landing slope, scanned at `step`: [lo, hi], or null when none does. The HUD's
 * speed bar draws it, so the run-up shows the window the landing is.
 */
export function sweetBand(
  t: Parameters<typeof launchAt>[0], g: GravityConfig, hill: AirHill, from = 10, to = 45, step = 0.1,
): [number, number] | null {
  const surf = hillSurface(hill, t.launchZ);
  let lo = Infinity, hi = -Infinity;
  for (let v = from; v <= to + 1e-9; v += step) {
    const td = simulateTouchdown(launchAt(t, v, hill.lipY), g, surf);
    if (surf.zone(td.z) === 'sweet') { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  return lo <= hi ? [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10] : null;
}
