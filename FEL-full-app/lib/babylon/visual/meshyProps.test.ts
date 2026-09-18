import { describe, expect, it } from 'vitest';
import { ballKindFor, HOOP_SCAN, MESHY_PROP_URL } from './meshyProps';

describe('meshy props — the owner\'s scans as game props', () => {
  it('picks the ball skin by the mode\'s sphere diameter and leaves the rest alone', () => {
    expect(ballKindFor(0.24)).toBe('basketball');
    expect(ballKindFor(0.22)).toBe('soccer');
    expect(ballKindFor(0.067)).toBe('tennis');
    expect(ballKindFor(0.21)).toBeNull();   // volleyball keeps its sphere (no scan)
    expect(ballKindFor(0.1)).toBeNull();    // golf
    expect(ballKindFor(0.12)).toBeNull();   // baseball
  });
  it('the hoop scan\'s ring is measured below the 3.05 m rim so the scale-up is small', () => {
    const s = 3.05 / HOOP_SCAN.rimY;
    expect(s).toBeGreaterThan(1); expect(s).toBeLessThan(1.1);
    expect(HOOP_SCAN.rimZ).toBeGreaterThan(0);   // the ring sits in front of the pivot
  });
  it('props live under /models/meshy', () => { expect(MESHY_PROP_URL('hoop')).toBe('/models/meshy/hoop.glb'); });
});
