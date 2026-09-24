// DUNK MOTION phase 10 (2026-09-23): the Dubble Up over 1–10 people — the owner picks the line's length in the prop ring.
import { describe, expect, it } from 'vitest';
import { DUBBLE_KINDS, OBSTACLE_KINDS, OBSTACLE_SPECS, dubbleCount, dubbleKneelSpan, dubbleTakeoffFromRim, dubbleHelperFromRim, dubbleArc, dubbleArcPower, isDubble, nextObstacle, DUBBLE_APEX_M, DUBBLE_HIPS_AT_HELPER, DUBBLE_HIPS_REST, DUBBLE_LINE_NEAR_M } from './DunkObstacles';

describe('the Dubble Up line', () => {
  it('has ten sizes in the ring, in order, named by the count', () => {
    expect(DUBBLE_KINDS).toHaveLength(10);
    for (const k of DUBBLE_KINDS) expect(OBSTACLE_KINDS).toContain(k);
    expect(OBSTACLE_SPECS.dubble1.label).toBe('DUBBLE UP'); expect(OBSTACLE_SPECS.dubble7.label).toBe('DUBBLE UP ×7');
    expect(nextObstacle('dubble3')).toBe('dubble4');
    expect(isDubble('dubble10')).toBe(true); expect(isDubble('row5')).toBe(false); expect(dubbleCount('dubble10')).toBe(10);
  });
  it('a longer line takes off further out, needs the helper cleared, and pays more', () => {
    let prev = 0, prevBonus = 0;
    for (let n = 1; n <= 10; n++) {
      const s = OBSTACLE_SPECS[`dubble${n}` as 'dubble1'];
      expect(s.takeoffFromRim).toBeGreaterThanOrEqual(prev); prev = s.takeoffFromRim;
      expect(s.bonus).toBeGreaterThan(prevBonus); prevBonus = s.bonus;
      expect(s.takeoffFromRim).toBeGreaterThan(dubbleHelperFromRim(n) + 1);   // a real run at him, never on top of him
    }
    expect(dubbleTakeoffFromRim(10)).toBeGreaterThan(6); expect(dubbleTakeoffFromRim(10)).toBeLessThan(8.5);   // ten standing: the contest's longest jump
  });
  it('the ball is on the FIRST man: the helper stands at the runway end, the kneelers run on from him to the rim', () => {
    expect(dubbleKneelSpan(1)).toBeNull();
    for (let n = 2; n <= 10; n++) {
      const sp = dubbleKneelSpan(n)!;
      expect(sp.center + sp.halfDepth).toBeLessThan(dubbleHelperFromRim(n));      // all of them between him…
      expect(sp.center - sp.halfDepth).toBeGreaterThan(DUBBLE_LINE_NEAR_M - 0.3); // …and the rim
    }
  });
  it('the flight goes through the helper at the hips height, and keeps rising to the top at the rim', () => {
    for (const uH of [0.26, 0.4, 0.55]) {   // where the helper really falls in the flight: ten standing ≈ 0.27, one ≈ 0.55
      const p = dubbleArcPower(uH);
      expect(DUBBLE_HIPS_REST + DUBBLE_APEX_M * dubbleArc(uH, p)).toBeCloseTo(DUBBLE_HIPS_AT_HELPER, 2);
      let prev = 0; for (let u = 0; u <= 1.0001; u += 0.05) { const h = dubbleArc(u, p); expect(h).toBeGreaterThanOrEqual(prev - 1e-9); prev = h; }
      expect(dubbleArc(1, p)).toBeCloseTo(1, 6);
    }
  });
});
