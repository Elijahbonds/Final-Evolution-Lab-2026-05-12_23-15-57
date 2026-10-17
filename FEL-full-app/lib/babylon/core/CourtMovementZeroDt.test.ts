// H3a fix: a frame with no time (a hit-stop, a freeze, a feet-down tick) must not poison the movement. The jerk limit divided its
// acceleration by dt: 0 / 0 → NaN in accPrev → the speed, the velocity, the root — and through the 3v3 body contacts every body on the
// court (measured: a dunk's landing turned all six roots and the ball NaN for the rest of the session).
import { describe, expect, it } from 'vitest';
import { DribbleController } from './BasketballCore';

const DT = 1 / 60;
const finite = (d: DribbleController) => Number.isFinite(d.vel.x) && Number.isFinite(d.vel.y) && Number.isFinite(d.vel.z);

describe('CourtMovement — a zero-dt frame', () => {
  it('in every phase (the push, the turbo, a cut, a reversal, a stop) changes nothing and leaves everything finite', () => {
    const script: [number, number, boolean][] = [
      ...Array(30).fill([0, -1, false]), ...Array(20).fill([0, -1, true]),   // push, then the turbo
      ...Array(10).fill([1, 0, false]), ...Array(10).fill([0, 1, false]),   // a cut, then a reversal
      ...Array(20).fill([0, 0, false]),                                       // a stop
    ];
    const d = new DribbleController();
    for (const [x, y, s] of script) {
      d.update(DT, x, y, s);
      const before = d.vel.clone();
      for (let k = 0; k < 3; k++) d.update(0, x, y, s);   // the hit-stop
      expect(finite(d)).toBe(true);
      expect(d.vel.subtract(before).length()).toBeLessThan(1e-9);
    }
  });
  it('the frames after a freeze move exactly as if it never happened', () => {
    const a = new DribbleController(), b = new DribbleController();
    for (let i = 0; i < 40; i++) { a.update(DT, 0, -1, i > 20); b.update(DT, 0, -1, i > 20); if (i === 25) for (let k = 0; k < 5; k++) b.update(0, 0, -1, true); }
    for (let i = 0; i < 30; i++) { a.update(DT, 0, 0, false); b.update(DT, 0, 0, false); }
    expect(b.vel.subtract(a.vel).length()).toBeLessThan(1e-9);
  });
});
