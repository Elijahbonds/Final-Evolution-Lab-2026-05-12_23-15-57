import { describe, expect, it } from 'vitest';
import { kartCircuits } from './kartCircuits';
import { locate } from './racingLine';
import { obstacleContact, placeObstacles, stillTouching, type PlacedObstacle } from './kartDressing';

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
