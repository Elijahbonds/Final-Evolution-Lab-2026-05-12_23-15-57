import { describe, expect, it } from 'vitest';
import { kartCircuits } from './kartCircuits';
import { locate } from './racingLine';
import { edgeLightsFor, forestFor, obstacleContact, placeObstacles, stillTouching, type PlacedObstacle } from './kartDressing';

const circuits = kartCircuits();

describe('kart dressing', () => {
  describe.each(circuits.map((c) => [c.course.id, c] as const))('%s', (_id, c) => {
    const placed = placeObstacles(c);

    it('places every declared obstacle', () => {
      expect(placed).toHaveLength(c.obstacles.length);
    });

    it('keeps the racing line clear', () => {
      // an obstacle ON the line is a wall with extra steps; the whole point is that it is a risk you opt into
      for (const o of placed) {
        const at = locate(c.line, o.pos.x, o.pos.z);
        expect(Math.abs(at.lateral)).toBeGreaterThan(1.9);
      }
    });

    it('keeps every obstacle on the road', () => {
      for (const o of placed) {
        const at = locate(c.line, o.pos.x, o.pos.z);
        expect(Math.abs(at.lateral)).toBeLessThan(c.halfWidth + 1.5);
      }
    });

    it('sits every obstacle at the road height there, not at zero', () => {
      for (const o of placed) {
        const at = locate(c.line, o.pos.x, o.pos.z);
        expect(Math.abs(o.pos.y - at.point.y)).toBeLessThan(2.5);
      }
    });

    it('puts kerbs only where the geometry says there is a corner', () => {
      for (const k of c.kerbs) expect(k.radius).toBeLessThan(120);
    });
  });

  describe('contact', () => {
    const at = (x: number, z: number): PlacedObstacle => ({
      kind: 'barrel', family: 'solid', pos: { x, y: 0, z } as never, radius: 0.9, effect: 0.7,
    });
    const surf = (x: number, z: number): PlacedObstacle => ({
      kind: 'gravel', family: 'surface', pos: { x, y: 0, z } as never, radius: 4, effect: 0.4,
    });

    it('reports clean road as clean', () => {
      const r = obstacleContact([at(50, 50)], { x: 0, z: 0 });
      expect(r.hit).toBeNull();
      expect(r.impact).toBe(1);
      expect(r.grip).toBe(1);
    });

    it('scrubs speed on a solid hit', () => {
      const r = obstacleContact([at(0, 1)], { x: 0, z: 0 });
      expect(r.hit?.kind).toBe('barrel');
      expect(r.impact).toBeCloseTo(0.7, 5);
    });

    it('drops grip in a surface patch without any impact', () => {
      const r = obstacleContact([surf(0, 1)], { x: 0, z: 0 });
      expect(r.hit).toBeNull();          // nothing to bump into
      expect(r.impact).toBe(1);
      expect(r.grip).toBeCloseTo(0.4, 5);
    });

    it('takes the worst grip when patches overlap', () => {
      const wet: PlacedObstacle = { kind: 'puddle', family: 'surface', pos: { x: 0, y: 0, z: 1 } as never, radius: 3.4, effect: 0.55 };
      expect(obstacleContact([wet, surf(0, 1)], { x: 0, z: 0 }).grip).toBeCloseTo(0.4, 5);
    });

    it('does NOT scrub the same obstacle twice', () => {
      // sixty scrubs a second while resting against a barrel is how one clip becomes a dead stop
      const barrel = at(0, 1);
      const first = obstacleContact([barrel], { x: 0, z: 0 });
      expect(first.hit).toBe(barrel);
      const second = obstacleContact([barrel], { x: 0, z: 0 }, 1.1, barrel);
      expect(second.hit).toBeNull();
      expect(second.impact).toBe(1);
    });

    it('knows when the kart has driven clear again', () => {
      const barrel = at(0, 1);
      expect(stillTouching(barrel, { x: 0, z: 0 })).toBe(true);
      expect(stillTouching(barrel, { x: 0, z: 9 })).toBe(false);
      expect(stillTouching(null, { x: 0, z: 0 })).toBe(false);
    });

    it('reports a solid and a surface in the same frame', () => {
      const r = obstacleContact([at(0, 1), surf(0, 2)], { x: 0, z: 0 });
      expect(r.hit?.kind).toBe('barrel');
      expect(r.grip).toBeCloseTo(0.4, 5);
    });
  });

  it('costs more the bigger the thing you hit', () => {
    const kinds = ['cone', 'barrel', 'crate', 'planter'] as const;
    const effects = kinds.map((k) => {
      const o: PlacedObstacle = { kind: k, family: 'solid', pos: { x: 0, y: 0, z: 0 } as never, radius: 1, effect: 0 };
      return obstacleContact([{ ...o, effect: { cone: 0.82, barrel: 0.7, crate: 0.62, planter: 0.45 }[k] }], { x: 0, z: 0 }).impact;
    });
    expect(effects).toEqual([...effects].sort((a, b) => b - a));
  });
});


// ── DETAIL PASS (2026-09-18) ────────────────────────────────────────────────────────────────────────────────
import { chevronsFor, kartSceneryFor } from './kartDressing';
import { kartCircuits as allKartCircuits } from './kartCircuits';
import { locate as locateOnLine } from './racingLine';

describe('the detail pass', () => {
  it('chevron boards stand on the OUTSIDE of every kerbed corner, off the road, one row per kerb', () => {
    for (const c of allKartCircuits()) {
      const boards = chevronsFor(c);
      expect(boards.length, c.course.id).toBeGreaterThanOrEqual(c.kerbs.length * 3);
      for (const b of boards) {
        const at = locateOnLine(c.line, b.pos.x, b.pos.z);
        expect(Math.abs(at.lateral), `${c.course.id} board on the road`).toBeGreaterThan(c.halfWidth + 1);
        expect(Math.abs(at.lateral), `${c.course.id} board too far`).toBeLessThan(c.halfWidth + 5);
        const kerb = c.kerbs.find((k) => at.dist >= k.from - 8 && at.dist <= k.to + 8);
        expect(kerb, `${c.course.id} board off a corner at ${at.dist.toFixed(0)}`).toBeTruthy();
        if (kerb) expect(Math.sign(at.lateral), `${c.course.id} board on the apex side`).toBe(-kerb.side);
      }
    }
  });
  it('the racing kit dresses every course — a grandstand pair, banner towers at the line, flags on the corners, nothing on the tarmac', () => {
    for (const c of allKartCircuits()) {
      const scenery = kartSceneryFor(c);
      const models = scenery.map((p) => p.model);
      expect(models.filter((m) => m.startsWith('grandStand')).length, c.course.id).toBe(2);
      expect(models.filter((m) => m.startsWith('bannerTower')).length, c.course.id).toBe(2);
      expect(models.filter((m) => m.startsWith('flag')).length, c.course.id).toBe(c.kerbs.length);
      for (const p of scenery) {
        const at = locateOnLine(c.line, p.at[0], p.at[2]);
        if (p.model === 'overheadLights') continue;   // the one thing that spans the road, on purpose
        expect(Math.abs(at.lateral), `${c.course.id} ${p.model} on the road`).toBeGreaterThan(c.halfWidth + 2);
      }
      if (c.course.mood === 'nightGame') expect(models).toContain('overheadLights');
    }
  });
});

describe('the setting', () => {
  it('the forest keeps off the road on both mountain loops, and stands inside the world', () => {
    for (const c of circuits.filter((x) => x.course.venue === 'slope')) {
      const trees = forestFor(c);
      expect(trees.length, c.course.id).toBeGreaterThan(400);
      for (const [x, z] of trees) {
        expect(Math.abs(locate(c.line, x, z).lateral), `${c.course.id} tree at ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(c.halfWidth + 13);
        expect(Math.abs(x)).toBeLessThan(300); expect(Math.abs(z)).toBeLessThan(300);
      }
      expect(forestFor(c)).toEqual(trees);   // deterministic: the same forest every load
    }
  });
  it('the night courses get an edge light every nine metres down both sides, just off the tarmac', () => {
    for (const c of circuits.filter((x) => x.course.mood === 'nightGame')) {
      const lights = edgeLightsFor(c);
      expect(lights.length).toBeGreaterThan((c.line.length / 9) * 2 - 4);
      for (const [x, , z] of lights) expect(Math.abs(locate(c.line, x, z).lateral)).toBeCloseTo(c.halfWidth + 0.7, 0);
    }
  });
});
