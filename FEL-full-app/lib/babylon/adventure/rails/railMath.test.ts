// Rail maths (lane A1). The grind, the catch and A4's world builders all stand on these three answers — length,
// sample, nearest — so they are pinned against the contract's own polylineLength and against hand-worked geometry.
import { describe, expect, it } from 'vitest';
import { polylineLength, type RailSegment, type Vec3 } from '../contracts';
import {
  buildRailIndex, buildRailPath, nearestOnPath, railNearest, sampleRail, spanAt, turnPerMetre,
} from './railMath';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const seg = (id: string, points: Vec3[], extra: Partial<RailSegment> = {}): RailSegment =>
  ({ id, points, speedBias: 0, switches: [], ...extra });

describe('railMath: a polyline rail', () => {
  const kinked = seg('k', [v(0, 1, 0), v(0, 1, 10), v(5, 2, 15), v(5, 2, 25)]);
  const path = buildRailPath(kinked);

  it('its arc length is the contract polylineLength, exactly', () => {
    expect(path.length).toBeCloseTo(polylineLength(kinked.points), 10);
    expect(path.cum[0]).toBe(0);
  });

  it('samples the authored points at their own arc lengths, with unit tangents', () => {
    const p = v(0, 0, 0), t = v(0, 0, 0);
    let s = 0;
    for (let i = 0; i < kinked.points.length; i++) {
      if (i > 0) s += Math.hypot(...(['x', 'y', 'z'] as const).map((k) => kinked.points[i][k] - kinked.points[i - 1][k]) as [number, number, number]);
      sampleRail(path, s, p, t);
      expect(p.x).toBeCloseTo(kinked.points[i].x, 9);
      expect(p.y).toBeCloseTo(kinked.points[i].y, 9);
      expect(p.z).toBeCloseTo(kinked.points[i].z, 9);
      expect(Math.hypot(t.x, t.y, t.z)).toBeCloseTo(1, 9);
    }
    sampleRail(path, 5, p, t);
    expect(p).toEqual({ x: 0, y: 1, z: 5 });
    expect(t.z).toBeCloseTo(1);
  });

  it('clamps a sample off either end onto the rail', () => {
    const p = v(0, 0, 0);
    sampleRail(path, -3, p); expect(p).toEqual({ x: 0, y: 1, z: 0 });
    sampleRail(path, path.length + 9, p); expect(p.z).toBeCloseTo(25);
  });

  it('finds the nearest point and its arc length', () => {
    const n = nearestOnPath(path, v(1, 1, 4), railNearest());
    expect(n.s).toBeCloseTo(4);
    expect(n.d).toBeCloseTo(1);
    expect(n.point.z).toBeCloseTo(4);
    expect(spanAt(path, 4)).toBe(0);
    expect(spanAt(path, 12)).toBe(1);
  });

  it('reads the turn: a bend to the right is positive going forward and negative coming back', () => {
    const elbow = buildRailPath(seg('e', [v(0, 0, 0), v(0, 0, 10), v(10, 0, 10)]));   // +z, then +x: a right turn
    expect(turnPerMetre(elbow, 10, 1)).toBeGreaterThan(0.3);
    expect(turnPerMetre(elbow, 10, -1)).toBeLessThan(-0.3);
    expect(turnPerMetre(elbow, 4, 1)).toBeCloseTo(0, 6);
  });
});

describe('railMath: a smooth rail', () => {
  it('a smooth straight line is the same line', () => {
    const s = seg('s', [v(0, 0, 0), v(0, 0, 5), v(0, 0, 10), v(0, 0, 15)], { smooth: true });
    const path = buildRailPath(s);
    expect(path.length).toBeCloseTo(15, 6);
    const p = v(0, 0, 0);
    sampleRail(path, 7.5, p);
    expect(p.z).toBeCloseTo(7.5, 6);
  });

  it('passes through every control point and is never shorter than the polyline', () => {
    const pts = [v(0, 0, 0), v(0, 0, 10), v(10, 0, 20), v(20, 2, 20)];
    const path = buildRailPath(seg('c', pts, { smooth: true }));
    expect(path.length).toBeGreaterThanOrEqual(polylineLength(pts) - 1e-6);
    expect(path.length).toBeLessThan(polylineLength(pts) * 1.15);
    for (const c of pts) expect(nearestOnPath(path, c, railNearest()).d).toBeLessThan(1e-6);
  });

  it('indexes a network by id and skips a degenerate segment', () => {
    const idx = buildRailIndex({ id: 'n', segments: [seg('a', [v(0, 0, 0), v(0, 0, 2)]), seg('bad', [v(0, 0, 0)])] });
    expect(idx.paths.map((p) => p.id)).toEqual(['a']);
    expect(idx.byId.get('a')?.length).toBeCloseTo(2);
  });
});
