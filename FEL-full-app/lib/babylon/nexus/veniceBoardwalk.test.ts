// DUNK-VENICE-ENV-2 — the Venice dunk's sea and the sun's road on it, as the numbers the meshes are built from.
import { describe, expect, it } from 'vitest';
import { dunkSeaPlanes, SEA, sunRoad, veniceWaterline } from './veniceBoardwalk';
import { veniceSunPosition } from '../visual/veniceSurroundVisibility';

const { westSea, northSea } = veniceWaterline();

describe('the Venice sea (eye VE-2)', () => {
  it('starts where the sand ends: the west waterline at x −50, the north one at z −71 (both builds, as before)', () => {
    expect(westSea).toBe(-50);
    expect(northSea).toBe(-71);
  });

  it('is two square planes meeting at the corner without overlapping, under every point of water inside the sky dome', () => {
    const { west, north } = dunkSeaPlanes(westSea, northSea);
    const rect = (p: { x: number; z: number; size: number }) => ({ x0: p.x - p.size / 2, x1: p.x + p.size / 2, z0: p.z - p.size / 2, z1: p.z + p.size / 2 });
    const W = rect(west), N = rect(north);
    expect(W.x1).toBeCloseTo(westSea, 6); expect(W.z0).toBeCloseTo(northSea, 6); expect(N.z1).toBeCloseTo(northSea, 6);
    const ox = Math.min(W.x1, N.x1) - Math.max(W.x0, N.x0), oz = Math.min(W.z1, N.z1) - Math.max(W.z0, N.z0);
    expect(ox > 0 && oz > 0).toBe(false);   // two wave fields in one place would z-fight
    const holes: string[] = [];
    for (let x = -200; x <= 200; x += 4) for (let z = -200; z <= 200; z += 4) {
      if (Math.hypot(x, z) > 198 || !(x < westSea || z < northSea)) continue;
      const inW = x >= W.x0 && x <= W.x1 && z >= W.z0 && z <= W.z1, inN = x >= N.x0 && x <= N.x1 && z >= N.z0 && z <= N.z1;
      if (!inW && !inN) holes.push(`${x},${z}`);
    }
    expect(holes).toEqual([]);
    expect(west.size).toBe(north.size);                  // square and equal: one wave texture tiles both at one size
    expect(SEA.planeM / SEA.waveM).toBeGreaterThan(20);  // waves metres long, not a smear
  });

  it('lays the sun\'s road on the water, toward the sun, from near the shore to inside the dome', () => {
    const toSun = veniceSunPosition();
    const r = sunRoad(westSea, northSea, toSun);
    const h = Math.hypot(toSun.x, toSun.z);
    expect(r.ux * (toSun.x / h) + r.uz * (toSun.z / h)).toBeCloseTo(1, 6);
    const x0 = r.ux * r.t0, z0 = r.uz * r.t0;
    expect(x0 < westSea || z0 < northSea).toBe(true);   // it starts on the water…
    expect(r.t0).toBeLessThan(80);                        // …just past the shore
    expect(r.t1).toBeLessThan(200);                       // and ends inside the 200 m dome
    expect(r.t1 - r.t0).toBeGreaterThan(60);
  });
});
