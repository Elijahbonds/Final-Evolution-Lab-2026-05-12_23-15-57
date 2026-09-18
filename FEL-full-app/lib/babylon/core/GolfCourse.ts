// GolfCourse — Golf Phase 3: data-driven hole/course format. Schema first,
// content second; one test course validates the pipeline end-to-end.

import { Vector3 } from '@babylonjs/core';
import type { Surface } from './GolfBall';

// ── Schema ─────────────────────────────────────────────────────────────────
export interface HoleZone {
  /** rectangle on the hole's local map (tee at z=0, green at z=lengthM) */
  kind: Surface;
  x0: number; z0: number; x1: number; z1: number;
}

export interface HoleDef {
  id: string;
  label: string;             // [TUNE] placeholder name
  par: 3 | 4 | 5;
  lengthM: number;
  tee: { x: number; z: number };
  pin: { x: number; z: number };
  zones: HoleZone[];         // default outside all zones = fairway
}

export interface CourseDef {
  id: string;
  label: string;             // [TUNE]
  holes: HoleDef[];
}

/** Surface lookup: innermost (last matching) zone wins; default fairway. */
export function surfaceAt(hole: HoleDef, x: number, z: number): Surface {
  let s: Surface = 'fairway';
  for (const zn of hole.zones) {
    if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) s = zn.kind;
  }
  return s;
}

/** A hole is playable iff: zones are sane, pin sits on a green, tee is on
 *  the tee box, and length matches the par band. */
export function validateHole(h: HoleDef): string[] {
  const errs: string[] = [];
  if (surfaceAt(h, h.pin.x, h.pin.z) !== 'green') errs.push('pin must be on the green');
  if (h.lengthM < 80 || h.lengthM > 600) errs.push(`lengthM ${h.lengthM} outside 80–600`);
  if (h.par === 3 && h.lengthM > 240) errs.push('par 3 too long');
  if (h.par === 5 && h.lengthM < 380) errs.push('par 5 too short');
  if (!h.zones.some((z) => z.kind === 'green')) errs.push('no green zone');
  return errs;
}

// ── The test course (placeholder art/data — [TUNE] everything) ─────────────
export const TEST_COURSE: CourseDef = {
  id: 'test_links', label: '[TUNE] Test Links', holes: [
    {
      id: 'h1', label: '[TUNE] Opener', par: 4, lengthM: 330,
      tee: { x: 0, z: 0 }, pin: { x: 4, z: 320 },
      zones: [
        { kind: 'rough', x0: -30, z0: 0, x1: -12, z1: 330 },
        { kind: 'rough', x0: 14, z0: 0, x1: 32, z1: 330 },
        { kind: 'sand', x0: -6, z0: 292, x1: 2, z1: 306 },
        { kind: 'water', x0: 20, z0: 180, x1: 34, z1: 240 },
        { kind: 'green', x0: -8, z0: 308, x1: 14, z1: 330 },
      ],
    },
    {
      id: 'h2', label: '[TUNE] Short', par: 3, lengthM: 145,
      tee: { x: 0, z: 0 }, pin: { x: -3, z: 140 },
      zones: [
        { kind: 'sand', x0: -10, z0: 118, x1: -2, z1: 132 },
        { kind: 'green', x0: -10, z0: 128, x1: 6, z1: 148 },
      ],
    },
    {
      id: 'h3', label: '[TUNE] Long', par: 5, lengthM: 480,
      tee: { x: 0, z: 0 }, pin: { x: 0, z: 470 },
      zones: [
        { kind: 'rough', x0: -34, z0: 0, x1: -16, z1: 480 },
        { kind: 'rough', x0: 16, z0: 0, x1: 34, z1: 480 },
        { kind: 'ob', x0: -34, z0: 0, x1: -60, z1: 480 },
        { kind: 'ob', x0: 34, z0: 0, x1: 60, z1: 480 },
        { kind: 'green', x0: -9, z0: 458, x1: 9, z1: 480 },
      ],
    },
  ],
};

export function validateCourse(c: CourseDef): string[] {
  return c.holes.flatMap((h) => validateHole(h).map((e) => `${h.id}: ${e}`));
}

/** Distance remaining to the pin (meters) for club selection. */
export function toPin(hole: HoleDef, pos: Vector3): number {
  return Math.hypot(hole.pin.x - pos.x, hole.pin.z - pos.z);
}
