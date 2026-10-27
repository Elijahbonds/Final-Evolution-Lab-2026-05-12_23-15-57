// FITNESS-TPOSE batch C (2026-10-26): the volt floor arrows and the ball note for the Fitness basketball / soccer / volleyball loops.
import { describe, expect, it } from 'vitest';
import { DEMO_ARROWS, DEMO_CLIPS, isBallClip } from './demo';

describe('demo floor arrows', () => {
  it('every arrow belongs to a loop a rule can name, and points somewhere', () => {
    for (const [clip, arrows] of Object.entries(DEMO_ARROWS)) {
      expect(DEMO_CLIPS, clip).toContain(clip);
      expect(arrows.length, clip).toBeGreaterThan(0);
      for (const a of arrows) {
        expect(Math.hypot(a.dx, a.dz), clip).toBeGreaterThan(0);
        expect(Math.hypot(a.x, a.z) + (a.len ?? 0.4), clip).toBeLessThan(1.3);   // stays on the floor disc
      }
    }
  });
  it('the ball-sport loops carry the "ball isn\'t drawn" note', () => {
    for (const c of Object.keys(DEMO_ARROWS)) expect(isBallClip(c), c).toBe(true);
    expect(isBallClip('ex_squat')).toBe(false);
  });
});
