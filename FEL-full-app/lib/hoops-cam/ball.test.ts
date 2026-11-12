import { describe, expect, it } from 'vitest';
import { BallDetector, ballColoured, masked, poseMask } from './ball';
import type { Rgb } from './frame';

/** A flat frame with optional discs (colour, centre, radius) and boxes drawn over them. */
function frame(w: number, h: number, bg: [number, number, number], discs: { x: number; y: number; r: number; c: [number, number, number] }[] = [], boxes: { x0: number; y0: number; x1: number; y1: number; c: [number, number, number] }[] = []): Rgb {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = bg;
    for (const d of discs) if ((x + 0.5 - d.x) ** 2 + (y + 0.5 - d.y) ** 2 <= d.r * d.r) c = d.c;
    for (const b of boxes) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) c = b.c;   // over the discs (a seam)
    const p = (y * w + x) * 4;
    data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
  }
  return { w, h, data };
}

const BALL: [number, number, number] = [205, 92, 36];
const WALL: [number, number, number] = [180, 180, 170];

describe('ball colour', () => {
  it('takes a basketball\'s orange-brown, lit or dim, and refuses skin, a hardwood floor, the wall and a red shirt', () => {
    expect(ballColoured(205, 92, 36)).toBe(true);
    expect(ballColoured(94, 40, 17)).toBe(true);           // dusk
    expect(ballColoured(156, 100, 66)).toBe(false);         // skin (saturation 0.58)
    expect(ballColoured(205, 160, 130)).toBe(false);        // light skin
    expect(ballColoured(192, 132, 80)).toBe(false);         // a hardwood floor
    expect(ballColoured(180, 180, 170)).toBe(false);
    expect(ballColoured(200, 30, 40)).toBe(false);          // red, blue the larger of the two
  });
});

describe('the detector', () => {
  it('finds a moving ball as a disc with its centre and radius, and nothing in a still frame', () => {
    const d = new BallDetector();
    expect(d.detect(frame(160, 90, WALL))).toEqual([]);   // the first frame only learns the background
    expect(d.detect(frame(160, 90, WALL))).toEqual([]);
    const c = d.detect(frame(160, 90, WALL, [{ x: 60, y: 40, r: 6, c: BALL }]));
    expect(c).toHaveLength(1);
    expect(c[0].x).toBeCloseTo(60, 0);
    expect(c[0].y).toBeCloseTo(40, 0);
    expect(c[0].r).toBeGreaterThan(5);
    expect(c[0].r).toBeLessThan(7);
    expect(c[0].shape).toBeGreaterThan(0.8);
  });

  it('ignores ball-coloured things that stand still (a painted floor, the rim) and long thin orange (a jersey stripe)', () => {
    const d = new BallDetector();
    const paint = { x0: 0, y0: 60, x1: 159, y1: 89, c: BALL };
    for (let k = 0; k < 3; k++) d.detect(frame(160, 90, WALL, [], [paint]));
    expect(d.detect(frame(160, 90, WALL, [], [paint]))).toEqual([]);
    const d2 = new BallDetector();
    d2.detect(frame(160, 90, WALL));
    expect(d2.detect(frame(160, 90, WALL, [], [{ x0: 20, y0: 30, x1: 80, y1: 33, c: BALL }]))).toEqual([]);
  });

  it('skips the pose\'s face and torso, and closes a ball\'s seams when asked', () => {
    const d = new BallDetector();
    d.detect(frame(160, 90, WALL));
    const f = frame(160, 90, WALL, [{ x: 60, y: 40, r: 6, c: BALL }]);
    expect(d.detect(f, { exclude: { discs: [{ x: 60, y: 40, r: 8 }] } })).toEqual([]);
    // a seam (a dark line) through a big ball splits it in two; one dilation joins it again
    const seamed = frame(160, 90, WALL, [{ x: 100, y: 45, r: 14, c: BALL }], [{ x0: 99, y0: 0, x1: 100, y1: 89, c: [40, 26, 20] }]);
    const d3 = new BallDetector(); d3.detect(frame(160, 90, WALL));
    expect(d3.detect(seamed).length).toBe(2);
    const d4 = new BallDetector(); d4.detect(frame(160, 90, WALL));
    const one = d4.detect(seamed, { close: 1 });
    expect(one).toHaveLength(1);
    expect(one[0].r).toBeGreaterThan(12);
  });

  it('builds the face and torso mask from a pose, in the frame\'s pixels', () => {
    const lm = (x: number, y: number) => ({ x, y, v: 0.9 });
    const pose = Array.from({ length: 33 }, () => lm(0, 0));
    pose[0] = lm(0.5, 0.2); pose[11] = lm(0.6, 0.35); pose[12] = lm(0.4, 0.35); pose[23] = lm(0.58, 0.6); pose[24] = lm(0.42, 0.6);
    const m = poseMask(pose, 200, 100)!;
    expect(masked(m, 100, 20)).toBe(true);         // the face
    expect(masked(m, 100, 47)).toBe(true);         // the chest
    expect(masked(m, 150, 80)).toBe(false);        // beside the legs
    expect(poseMask(null, 200, 100)).toBeNull();
  });
});
