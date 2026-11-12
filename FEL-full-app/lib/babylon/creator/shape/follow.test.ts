// lane/kit-fit: garments follow the body's shape (inflate.followMap / followDelta; renderShape's kit.garmentFollowBody).
import { describe, expect, it } from 'vitest';
import { followDelta, followMap } from './inflate';
import { GARMENT_FOLLOW_BODY } from './renderShape';
import { FEEL_KNOB_BY_ID } from '../../../feel-panel/knobs';

describe('a garment takes the displacement of the skin under it', () => {
  // three skin points with different bulk, and a garment point 1 cm off the first, one between the second and third, one far away
  const skinP = new Float32Array([0, 1, 0, 0.3, 1, 0, 0.3, 1.04, 0]);
  const skinD = new Float32Array([0.05, 0, 0, 0.01, 0, 0, 0.03, 0, 0]);
  const clothP = new Float32Array([0.01, 1, 0, 0.3, 1.02, 0.01, 2, 2, 2]);
  const own = new Float32Array([0.2, 0, 0, 0.2, 0, 0, 0.2, 0, 0]);
  const map = followMap(clothP, skinP, 0.08, 4);
  const d = followDelta(map, skinD, own);

  it('a point over one skin point moves (almost) exactly as that skin does, not by its own bulk', () => {
    expect(d[0]).toBeGreaterThan(0.035);   // the nearest skin moved 5 cm; the next is 29 cm off, out of reach
    expect(d[0]).toBeLessThan(0.051);
  });
  it('a point between two skin points moves by their inverse-distance blend', () => {
    expect(d[3]).toBeGreaterThan(0.01);
    expect(d[3]).toBeLessThan(0.03);
    expect(Math.abs(d[3] - 0.02)).toBeLessThan(0.002);   // equidistant from both (2 cm): the mean
  });
  it('a point with no skin in reach keeps its own bulk', () => {
    expect([d[6], d[7], d[8]]).toEqual([own[6], own[7], own[8]]);
  });
  it('the knob ships OFF (measured worse on the girth-max bodies: docs/KIT-FIT-PLAN.md §3.3); 0 is the old behaviour', () => {
    expect(GARMENT_FOLLOW_BODY).toBe(0);
    const k = FEEL_KNOB_BY_ID.get('kit.garmentFollowBody')!;
    expect([k.def, k.min, k.max, k.step]).toEqual([0, 0, 1, 1]);
  });
});
