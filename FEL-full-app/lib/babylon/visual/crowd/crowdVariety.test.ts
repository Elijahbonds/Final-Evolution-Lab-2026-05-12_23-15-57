import { describe, expect, it } from 'vitest';
import { crowdHeightScale, crowdShade, crowdVarietyOn, CROWD_HEIGHT_SPREAD, CROWD_VARIETY_V2 } from './crowdStands';

// look pass B3, part 2 (look-venues, 2026-11-24): crowd.varietyV2. Off restores the crowd exactly: every fan and card at scale 1,
// no colour buffer. On: each its own height and shade, from where it stands (the same every load).
const seats = Array.from({ length: 400 }, (_, i) => ({
  pos: [(i % 40) * 0.62 - 12, Math.floor(i / 40) * 0.45, -20 - Math.floor(i / 40) * 0.8] as [number, number, number],
  posture: (i % 3 === 0 ? 'seated' : 'standing') as 'seated' | 'standing',
}));

describe('crowd.varietyV2', () => {
  it('ships off, and off is today: scale 1 and no shade for every seat', () => {
    expect(CROWD_VARIETY_V2).toBe(0);
    expect(crowdVarietyOn()).toBe(false);
    for (const s of seats) { expect(crowdHeightScale(s, false)).toBe(1); expect(crowdShade(s, false)).toBeNull(); }
  });
  it('on: heights inside the spread (seated far tighter), spread out, about even, and the same every call', () => {
    const st = seats.filter((s) => s.posture === 'standing').map((s) => crowdHeightScale(s, true));
    const se = seats.filter((s) => s.posture === 'seated').map((s) => crowdHeightScale(s, true));
    for (const h of st) expect(Math.abs(h - 1)).toBeLessThanOrEqual(CROWD_HEIGHT_SPREAD.standing + 1e-9);
    for (const h of se) expect(Math.abs(h - 1)).toBeLessThanOrEqual(CROWD_HEIGHT_SPREAD.seated + 1e-9);
    expect(Math.max(...st) - Math.min(...st)).toBeGreaterThan(CROWD_HEIGHT_SPREAD.standing);   // real variety, not one value
    expect(Math.abs(st.reduce((a, b) => a + b, 0) / st.length - 1)).toBeLessThan(0.015);       // the crowd's average height unchanged
    expect(crowdHeightScale(seats[7], true)).toBe(crowdHeightScale(seats[7], true));
  });
  it('on: shades stay near the body\'s own colours (no new hue) and differ between neighbours', () => {
    const sh = seats.map((s) => crowdShade(s, true)!);
    for (const [r, g, b, a] of sh) {
      expect(a).toBe(1);
      expect(g).toBeGreaterThanOrEqual(0.84); expect(g).toBeLessThanOrEqual(1.08);
      expect(Math.abs(r - b) / g).toBeLessThanOrEqual(0.08 + 1e-9);
    }
    expect(new Set(sh.slice(0, 40).map((c) => c[1].toFixed(3))).size).toBeGreaterThan(20);
  });
});
