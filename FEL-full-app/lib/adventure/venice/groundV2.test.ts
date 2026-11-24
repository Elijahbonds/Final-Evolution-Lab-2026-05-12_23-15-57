// look pass C4 (lane/look-world): Venice's ground from the high camera (venue.veniceGroundV2)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GROUND_V2, groundDiv, groundTint, VENICE_GROUND_V2 } from './groundV2';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';

describe('venue.veniceGroundV2 (look pass C4)', () => {
  it('the knob: its default is the shipped constant; 0 is the flat planes', () => {
    const k = FEEL_KNOB_BY_ID.get('venue.veniceGroundV2')!;
    expect(k.def).toBe(VENICE_GROUND_V2);
    expect(k.min).toBe(0);
  });

  it('the grid: about one vertex every 4 m, bounded both ways', () => {
    expect(groundDiv(100, 200)).toBe(50);
    expect(groundDiv(10, 10)).toBe(GROUND_V2.minDiv);
    expect(groundDiv(600, 900)).toBe(GROUND_V2.maxDiv);
  });

  it('the tint: a gentle, fixed variation (never a stripe, never dark), only on the slab and the sand', () => {
    let lo = 9, hi = 0;
    for (let x = -300; x <= 300; x += 7) for (let z = -300; z <= 300; z += 11) for (const k of ['concrete', 'sand']) {
      const t = groundTint(x, z, k);
      for (const c of t) { lo = Math.min(lo, c); hi = Math.max(hi, c); }
      expect(groundTint(x, z, k)).toEqual(t);
    }
    expect(lo).toBeGreaterThan(0.7);
    expect(hi).toBeLessThan(1.1);
    expect(hi - lo).toBeGreaterThan(0.08);   // it does vary
    expect(groundTint(3, 4, 'asphalt')).toEqual([1, 1, 1]);
  });

  it('off draws the one quad as before; on, the slab and the sand only, the same material', () => {
    const src = readFileSync('lib/adventure/venice/courtsView.ts', 'utf8');
    expect(src).toContain("feel('venue.veniceGroundV2', VENICE_GROUND_V2) >= 0.5");
    expect(src).toContain(": MeshBuilder.CreateGround(name, { width: w, height: d }, scene);");
    expect(src).toContain("groundV2 && (kind === 'concrete' || kind === 'sand')");
  });
});
