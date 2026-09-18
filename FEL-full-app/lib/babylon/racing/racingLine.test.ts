import { describe, expect, it } from 'vitest';
import {
  cornerRadiusAt, elevationProfile, holdableRadius, holdableSpeed, locate, pointAlong, sampleLine, tightestCorner,
} from './racingLine';

/** A circle of radius r as authored points — the one case where the right answer is known in advance. */
const circle = (r: number, n = 12): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r, 0] as [number, number, number];
  });

describe('racingLine', () => {
  /**
   * The estimator READS TIGHT, and that is the useful direction.
   *
   * A Catmull-Rom spline through points on a circle is not a circle: it is a cubic per segment whose curvature peaks
   * AT the authored points and relaxes between them. Measured against a true 120 m circle through 12 points, the
   * radius at an authored point comes back ~103 m — about 86%. So every grip-floor number in kartCircuits is
   * conservative: a course measured at 62 m is never tighter than 62 m in reality, and may be a little wider. That
   * is the safe way round for a check whose whole job is to stop a corner being tighter than the kart can hold.
   */
  it('reads a known circle conservatively rather than optimistically', () => {
    const line = sampleLine(circle(120), { loop: true });
    const measured = cornerRadiusAt(line, 0);
    expect(measured).toBeLessThanOrEqual(120);      // never claims a corner is wider than it is
    expect(measured).toBeGreaterThan(120 * 0.8);    // but not so pessimistic as to be useless
    expect(line.length).toBeGreaterThan(2 * Math.PI * 120 * 0.97);
  });

  it('reports a straight as an infinite radius', () => {
    const line = sampleLine([[0, 0, 0], [0, 100, 0], [0, 200, 0], [0, 300, 0]], { loop: false });
    expect(cornerRadiusAt(line, 150)).toBe(Infinity);
  });

  it('finds the tightest corner, not the average one', () => {
    const line = sampleLine(
      [[0, 0, 0], [0, 200, 0], [40, 260, 0], [80, 200, 0], [80, 40, 0], [40, -40, 0]], { loop: true });
    const { radius } = tightestCorner(line);
    expect(radius).toBeLessThan(120);
    expect(radius).toBeGreaterThan(5);
  });

  it('is not fooled by sampling noise into reporting a corner no driver feels', () => {
    // adjacent samples on a dense straight-ish curve must not read as a tight corner
    const line = sampleLine([[0, 0, 0], [1, 150, 0], [0, 300, 0], [-1, 450, 0], [0, 600, 0]], { loop: false });
    expect(tightestCorner(line).radius).toBeGreaterThan(400);
  });

  it('locates a point by distance along and offset to the side', () => {
    const line = sampleLine([[0, 0, 0], [0, 100, 0], [0, 200, 0], [0, 300, 0]], { loop: false });
    const at = locate(line, 8, 150);
    expect(at.dist).toBeCloseTo(150, 0);
    expect(Math.abs(at.lateral)).toBeCloseTo(8, 0);
  });

  it('wraps on a loop and clamps on a point-to-point', () => {
    const loop = sampleLine(circle(100), { loop: true });
    expect(pointAlong(loop, loop.length + 25).pos.x).toBeCloseTo(pointAlong(loop, 25).pos.x, 1);

    const open = sampleLine([[0, 0, 0], [0, 100, 0], [0, 200, 0], [0, 300, 0]], { loop: false });
    expect(pointAlong(open, 99_999).pos.z).toBeCloseTo(300, 0);
    expect(pointAlong(open, -50).pos.z).toBeCloseTo(0, 0);
  });

  it('keeps a usable heading at the very end of a point-to-point line', () => {
    // the finish checkpoint's facing comes from here; a degenerate tangent made it face a fixed axis
    const line = sampleLine([[0, 0, 0], [0, 100, 0], [0, 200, 0], [0, 300, 0]], { loop: false });
    const end = pointAlong(line, line.length);
    expect(end.tangent.z).toBeCloseTo(1, 2);
    expect(end.tangent.length()).toBeCloseTo(1, 5);

    const west = sampleLine([[0, 0, 0], [-100, 0, 0], [-200, 0, 0], [-300, 0, 0]], { loop: false });
    expect(pointAlong(west, west.length).tangent.x).toBeCloseTo(-1, 2);
  });

  it('refuses a line too short to spline', () => {
    expect(() => sampleLine([[0, 0, 0], [0, 10, 0], [0, 20, 0]], { loop: true })).toThrow(/at least 4/);
  });

  it('agrees with the physics the courses are sized against', () => {
    // RaceCourse's number: 26 m/s on 11 m/s^2 grip is a ~61 m corner
    expect(holdableRadius(26, 11)).toBeCloseTo(61.5, 0);
    expect(holdableSpeed(holdableRadius(26, 11), 11)).toBeCloseTo(26, 3);
  });

  it('adds up climb and drop separately', () => {
    const line = sampleLine([[0, 0, 100], [0, 100, 50], [0, 200, 0], [0, 300, 20]], { loop: false });
    const e = elevationProfile(line);
    expect(e.drop).toBeGreaterThan(90);
    expect(e.climb).toBeGreaterThan(15);
    expect(e.high).toBeCloseTo(100, 0);
    // the spline undershoots the lowest authored height by a fraction of a metre, the same cubic overshoot that
    // makes the corner estimator read tight. Worth knowing for a descent: the road dips slightly below its
    // authored floor, so anything placed at the authored height needs that much clearance.
    expect(e.low).toBeGreaterThan(-1.5);
    expect(e.low).toBeLessThan(0.5);
  });
});
