import { describe, expect, it } from 'vitest';
import { MINI_TIERS, MINI_ZIP_SEC, noMini, stepMini, tierFor } from './MiniTurbo';

function slide(sec: number, quality = 0.8) {
  let s = noMini(); const ups: number[] = [];
  for (let t = 0; t < sec; t += 1 / 60) { const r = stepMini(s, true, quality, 1 / 60); s = r.state; if (r.tierUp) ups.push(r.tierUp); }
  const end = stepMini(s, false, 0, 1 / 60);
  return { ups, released: end.released, after: end.state };
}

describe('MiniTurbo', () => {
  it('climbs blue, orange, purple through a long clean slide and releases the top tier', () => {
    const r = slide(2.5);
    expect(r.ups).toEqual([1, 2, 3]);
    expect(r.released).toBe(3);
    expect(r.after).toEqual(noMini());
  });
  it('a flick shorter than the first tier pays nothing', () => {
    expect(slide(MINI_TIERS[0] - 0.1).released).toBeNull();
  });
  it('each tier releases its own zip, longer each step', () => {
    expect(slide(0.8).released).toBe(1);
    expect(slide(1.5).released).toBe(2);
    expect(MINI_ZIP_SEC[1] < MINI_ZIP_SEC[2] && MINI_ZIP_SEC[2] < MINI_ZIP_SEC[3]).toBe(true);
  });
  it('a scruffy slide holds its tier but does not climb', () => {
    expect(slide(3, 0.1).released).toBeNull();
    expect(tierFor(1.0)).toBe(1);
  });
  it('not drifting and never slid releases nothing', () => {
    expect(stepMini(noMini(), false, 0, 0.1).released).toBeNull();
  });
});
