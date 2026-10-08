// IMPROVE (2026-10-06, skate item 8) — the coin lines are laid on THIS venue's features.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Ray, Scene, Vector3 } from '@babylonjs/core';
import { skateCoinLayout, laneTop, plazaSolids, SKATE_LANE, SKATE_BOWL, SKATE_CENTRE_BOX, LANE_COIN_TOP_Y, COIN_LIFT_M, atBound } from './skatePlaza';
import { SKATE_VENUES } from '../nexus/boardVenues';
import { PARK_BOUND } from './rideWorlds';

const VENUES = SKATE_VENUES.map((v) => [v.id, v.bound] as const);

describe('laneTop is the lane rideWorlds builds', () => {
  it.each(VENUES)('on %s (bound %s) a ray finds the surface where laneTop says it is', (_id, bound) => {
    // the lane exactly as buildSkatepark makes it, from the same numbers
    const scene = new Scene(new NullEngine());
    const lane = MeshBuilder.CreateBox('dh_lane', { width: SKATE_LANE.width, height: SKATE_LANE.thick, depth: SKATE_LANE.len(bound) }, scene);
    lane.position.set(atBound(SKATE_LANE.fx, bound), SKATE_LANE.y, atBound(SKATE_LANE.fz, bound));
    lane.rotation.set(SKATE_LANE.tilt, 0, 0);
    lane.computeWorldMatrix(true);
    for (const dz of [-10, -4, 0, 5, 11]) {
      const p = laneTop(bound, dz);
      const hit = scene.pickWithRay(new Ray(new Vector3(p.x, p.y + 5, p.z), new Vector3(0, -1, 0), 20), (m) => m === lane);
      expect(hit?.hit, `dz ${dz}`).toBe(true);
      expect(hit!.pickedPoint!.y).toBeCloseTo(p.y, 2);
    }
    scene.dispose();
  });
});

describe.each(VENUES)('the coins on %s (bound %s)', (_id, bound) => {
  const lay = skateCoinLayout(bound);
  const laneX = atBound(SKATE_LANE.fx, bound);

  it('has enough coins for the collect goal, and none outside the fence', () => {
    const n = lay.points.length + lay.arcs.reduce((s, a) => s + a.n, 0);
    expect(n).toBeGreaterThanOrEqual(30);
    for (const [x, , z] of lay.points) { expect(Math.abs(x)).toBeLessThan(bound); expect(Math.abs(z)).toBeLessThan(bound); }
  });

  it('runs the lane line DOWN THE LANE — on its centre line, just over its surface, falling as it goes', () => {
    const lane = lay.points.filter(([x]) => Math.abs(x - laneX) < 0.01);
    expect(lane.length).toBe(8);
    for (let i = 1; i < lane.length; i++) expect(lane[i][1]).toBeLessThan(lane[i - 1][1]);
    expect(lane[0][1]).toBeLessThanOrEqual(LANE_COIN_TOP_Y + 1.2);   // never up the cliff end of a long lane
    // each over the surface at its own z (inverting laneTop's z for dz)
    const s = Math.sin(SKATE_LANE.tilt), c = Math.cos(SKATE_LANE.tilt), z0 = atBound(SKATE_LANE.fz, bound) + (SKATE_LANE.thick / 2) * s;
    for (const [, y, z] of lane) {
      const top = Math.max(0, laneTop(bound, (z - z0) / c).y);
      expect(y - top).toBeGreaterThan(0.3);
      expect(y - top).toBeLessThan(1);
    }
  });

  it('crosses the bowl through its centre, rim to rim', () => {
    const bx = atBound(SKATE_BOWL.fx, bound), bz = atBound(SKATE_BOWL.fz, bound);
    const arc = lay.arcs.find((a) => Math.abs((a.from[0] + a.to[0]) / 2 - bx) < 0.01);
    expect(arc).toBeTruthy();
    expect(arc!.from[2]).toBeCloseTo(bz);
    expect(Math.abs(arc!.to[0] - arc!.from[0]) / 2).toBeCloseTo(SKATE_BOWL.r - 0.5, 1);
  });

  it('leaves the centre funbox to its arc — no diagonal coin buried in it', () => {
    const B = SKATE_CENTRE_BOX, cx = atBound(B.fx, bound), cz = atBound(B.fz, bound);
    const inside = lay.points.filter(([x, y, z]) => y < B.height && Math.abs(x - cx) < B.width / 2 && Math.abs(z - cz) < B.depth / 2);
    expect(inside).toEqual([]);
    expect(lay.arcs.some((a) => Math.abs(a.from[2] - cz) < 0.01 && a.from[1] >= B.height)).toBe(true);
  });

  it('puts no single coin inside anything solid in the plaza', () => {
    for (const s of plazaSolids(bound).filter((x) => x.solid && x.height > COIN_LIFT_M)) {
      const c = Math.cos(s.ry), sn = Math.sin(s.ry);
      const cx = s.wedge ? s.x - sn * s.depth / 2 : s.x, cz = s.wedge ? s.z - c * s.depth / 2 : s.z;
      for (const [x, y, z] of lay.points) {
        if (y > s.height) continue;
        const lx = (x - cx) * c - (z - cz) * sn, lz = (x - cx) * sn + (z - cz) * c;
        expect(Math.abs(lx) < s.width / 2 && Math.abs(lz) < s.depth / 2, `${s.kind} at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
      }
    }
  });
});

describe('it scales with the venue, which is the point', () => {
  it('the lane line sits on each venue\'s lane, not at the old park\'s x 20', () => {
    for (const [, bound] of VENUES) {
      expect(bound).toBeGreaterThan(PARK_BOUND);
      const xs = new Set(skateCoinLayout(bound).points.map(([x]) => x.toFixed(2)));
      expect(xs.has(atBound(SKATE_LANE.fx, bound).toFixed(2))).toBe(true);
      expect(xs.has((20).toFixed(2))).toBe(false);
    }
  });
});
