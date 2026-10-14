// Measures what a cloud fly-through leaves of the NEXT RING on an Aero course (w3-followups, owner 2026-10-14 "Soften it").
// Flies the racing line a metre at a time with the chase camera where the mode puts it (aeroTune.cam: 13.5 m back, 4.6 m up), finds the
// deepest cloud the camera is in (the same test aeroAtmos.update runs), applies the real fogPulse to the mood's own haze (EXP2), and
// reports how much of the next gate's colour reaches the eye. EXP2 transmittance at distance d with density rho is exp(-(d*rho)^2).
import { aeroCircuits, pointAlong, type AeroCircuit } from '../../lib/babylon/racing/aeroCircuits';
import { cloudBanksFor, fogPulse, insideCloud } from '../../lib/babylon/racing/aeroAtmos';
import { AERO_TUNE } from '../../lib/babylon/racing/aeroTune';
import { HAZE_DENSITY } from '../../lib/babylon/scene/Atmosphere';

export interface CloudSight {
  id: string;
  /** the mood's resting EXP2 density */
  rho: number;
  /** metres of the lap the camera spends in cloud (insideCloud > 0.01) */
  metresInCloud: number;
  /** the heart of a cloud: distance at which half the colour survives, with the pulse at 1 */
  halfSightAtHeart: number;
  /** across every in-cloud frame: the lowest share of the next gate's colour that reaches the eye, and how far that gate was */
  worstRing: { transmittance: number; metres: number };
  /** the farthest next gate seen from inside a cloud */
  farthestRing: number;
}

export const trans = (metres: number, rho: number): number => Math.exp(-((metres * rho) ** 2));

export function cloudSight(c: AeroCircuit, pulse: (k: number) => { densityMul: number } = fogPulse): CloudSight {
  const L = c.line.length, rho = HAZE_DENSITY[c.course.mood];
  const gates = c.course.gates.length;
  const puffs = cloudBanksFor(c.line, c.floorAt, c.corridor, 6, 9);   // what mountAeroAtmos lays (6 banks x 9 puffs)
  let metres = 0, farthest = 0;
  let worst = { transmittance: 1, metres: 0 };
  for (let d = 0; d < L; d += 1) {
    const p = pointAlong(c.line, d);
    const cam = { x: p.pos.x - p.tangent.x * AERO_TUNE.cam.distance, y: p.pos.y - p.tangent.y * AERO_TUNE.cam.distance + AERO_TUNE.cam.height, z: p.pos.z - p.tangent.z * AERO_TUNE.cam.distance };
    let deep = 0;
    for (const q of puffs) {
      if (Math.abs(q.y - cam.y) > q.size) continue;
      const m = Math.hypot(q.x - cam.x, q.y - cam.y, q.z - cam.z);
      if (m < q.size) deep = Math.max(deep, insideCloud(m, q.size));
    }
    if (deep < 0.01) continue;
    metres++;
    const next = Math.floor((d / L) * gates) + 1;   // gate i sits at (i / gates) * L, i = 1..gates
    const g = pointAlong(c.line, ((next / gates) * L) % L).pos;
    const ring = Math.hypot(g.x - cam.x, g.y - cam.y, g.z - cam.z);
    farthest = Math.max(farthest, ring);
    const t = trans(ring, rho * pulse(deep).densityMul);
    if (t < worst.transmittance) worst = { transmittance: t, metres: ring };
  }
  return { id: c.course.id, rho, metresInCloud: metres, halfSightAtHeart: Math.sqrt(Math.LN2) / (rho * pulse(1).densityMul), worstRing: worst, farthestRing: farthest };
}

export function allCloudSights(pulse?: (k: number) => { densityMul: number }): CloudSight[] { return aeroCircuits().map((c) => cloudSight(c, pulse)); }
