import { describe, expect, it } from 'vitest';
import { DribbleReader } from './dribble';
import type { BallObs } from './track';
import type { Lm } from '@/lib/pose/landmarks';

// Dribbles drawn as ball paths (no pixels): floor at y 200, the hand at y 120, the player's middle at x 200 (from the
// pose's hips). A crossover moves the ball's top from one side of the middle to the other.
const FRAME = { w: 400, h: 240 };
const lm = (x: number, y: number): Lm => ({ x: x / FRAME.w, y: y / FRAME.h, z: 0, v: 0.9 });
function pose(): Lm[] {
  const p = Array.from({ length: 33 }, () => lm(0, 0));
  p[23] = lm(215, 110); p[24] = lm(185, 110);          // hips (the player faces the lens: their left is the picture's right)
  p[27] = lm(212, 205); p[28] = lm(188, 205);          // ankles
  p[15] = lm(250, 120); p[16] = lm(150, 120);          // wrists: left at the picture's right
  return p;
}

/** Bounces at `gapMs`, each top at x from `sides` (one per bounce). */
function feed(sides: number[], gapMs: number, from = 0): { r: DribbleReader; truth: number[] } {
  const r = new DribbleReader(FRAME);
  const truth: number[] = [];
  const P = pose();
  let t = from;
  for (let k = 0; k < sides.length; k++) {
    const x0 = k === 0 ? sides[0] : sides[k - 1], x1 = sides[k];
    truth.push(t + gapMs / 2);
    for (let u = 0; u < 1; u += 33 / gapMs) {
      const s = Math.abs(1 - 2 * u);
      const y = 200 - 80 * (1 - (1 - s) * (1 - s));
      const x = x0 + (x1 - x0) * u;
      const vy = u < 0.5 ? 300 : -300;
      const obs: BallObs = { t: t + u * gapMs, x, y, r: 6, vx: 0, vy, coast: false };
      r.step(obs.t, obs, P);
    }
    t += gapMs;
  }
  // the last top
  r.step(t + 33, { t: t + 33, x: sides[sides.length - 1], y: 118, r: 6, vx: 0, vy: 0, coast: false }, P);
  r.step(t + 66, { t: t + 66, x: sides[sides.length - 1], y: 130, r: 6, vx: 0, vy: 300, coast: false }, P);
  return { r, truth };
}

describe('dribbles off a plain ball', () => {
  it('counts pound dribbles, their rate and a steady rhythm, on the right hand', () => {
    const { r } = feed(Array(10).fill(150), 420);
    const d = r.read();
    expect(d.count).toBeGreaterThanOrEqual(9);
    expect(d.crossovers).toBe(0);
    expect(d.rateHz).toBeCloseTo(1000 / 420, 1);
    expect(d.rhythmCv).toBeLessThan(10);
    expect(d.right).toBe(d.count);
    expect(d.height).toBe('mid');
  });

  it('counts crossovers: a top on the other side of the middle', () => {
    const { r } = feed([150, 250, 150, 250, 150, 250, 150], 500);
    const d = r.read();
    expect(d.count).toBeGreaterThanOrEqual(6);
    expect(d.crossovers).toBeGreaterThanOrEqual(5);
    expect(d.left).toBeGreaterThan(1);
    expect(d.right).toBeGreaterThan(1);
  });

  it('a pause starts a new set (no crossover across it), and a small bob is not a dribble', () => {
    const r = new DribbleReader(FRAME);
    for (let t = 0; t < 2000; t += 33) r.step(t, { t, x: 150, y: 120 + 3 * Math.sin(t / 50), r: 6, vx: 0, vy: 0, coast: false }, pose());
    expect(r.read().count).toBe(0);
    expect(r.read().rateHz).toBeNull();
  });
});
