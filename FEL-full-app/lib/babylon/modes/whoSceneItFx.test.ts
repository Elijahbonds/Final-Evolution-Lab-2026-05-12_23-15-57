// Who Scene It's cinematics (vis-party, 2026-10-13).
import { describe, expect, it } from 'vitest';
import {
  GRADE_BLEND, GRADE_RANGE, PUSH_FOV, PUSH_SEC, WHIP_SEC, WHIP_SWING, easeOut, pipelineGrade, pushFov, questionGrade, stepGrade, whipYaw,
} from './whoSceneItFx';

describe('whip-pan', () => {
  it('starts a swing away and settles to nothing in WHIP_SEC, never overshooting', () => {
    expect(whipYaw(0)).toBeCloseTo(WHIP_SWING, 9);
    expect(whipYaw(WHIP_SEC)).toBe(0);
    expect(whipYaw(WHIP_SEC * 3)).toBe(0);
    let last = Infinity;
    for (let t = 0; t <= WHIP_SEC; t += 0.02) { const y = whipYaw(t); expect(y).toBeLessThanOrEqual(last + 1e-12); expect(y).toBeGreaterThanOrEqual(0); last = y; }
  });
  it('decelerates into place (ease-out): more than half the swing is gone by the half-way point', () => {
    expect(whipYaw(WHIP_SEC / 2)).toBeLessThan(WHIP_SWING / 2);
  });
  it('reduced motion has no whip at all', () => {
    for (const t of [0, 0.1, 0.3]) expect(whipYaw(t, true)).toBe(0);
  });
  it('the sweep\'s own speed and radius are untouched: the whip only adds an offset (TUNED camera numbers stay)', () => {
    expect(easeOut(0)).toBe(0); expect(easeOut(1)).toBe(1); expect(easeOut(-1)).toBe(0); expect(easeOut(9)).toBe(1);
  });
});

describe('reveal push-in', () => {
  it('a right answer narrows the lens to PUSH_FOV by PUSH_SEC; anything else leaves it alone', () => {
    expect(pushFov(0, true)).toBe(1);
    expect(pushFov(PUSH_SEC, true)).toBeCloseTo(PUSH_FOV, 9);
    expect(pushFov(5, true)).toBeCloseTo(PUSH_FOV, 9);
    for (const t of [0, 0.3, 2]) expect(pushFov(t, false)).toBe(1);
  });
  it('it is a small move, never a zoom that hides the floor', () => {
    expect(PUSH_FOV).toBeGreaterThan(0.8);
    expect(PUSH_FOV).toBeLessThan(1);
  });
});

describe('per-venue grade', () => {
  const rest = { exposure: 1.1, contrast: 1.2, vignette: 1.0 };
  it('the spec\'s vignette is ×4 on the pipeline, as the venue grade always was', () => {
    expect(pipelineGrade({ exposure: 1.15, contrast: 1.35, vignette: 0.35 })).toEqual({ exposure: 1.15, contrast: 1.35, vignette: 1.4 });
  });
  it('goes GRADE_BLEND of the way to the venue\'s grade; no venue means the rig\'s own', () => {
    const g = questionGrade(rest, { exposure: 1.3, contrast: 1.4, vignette: 1.4 });
    expect(g.exposure).toBeCloseTo(1.1 + 0.2 * GRADE_BLEND, 9);
    expect(g.contrast).toBeCloseTo(1.2 + 0.2 * GRADE_BLEND, 9);
    expect(questionGrade(rest, null)).toEqual(rest);
  });
  it('different venues give different looks (the look of the place is the clue)', () => {
    const a = questionGrade(rest, pipelineGrade({ exposure: 1.22, contrast: 1.45, vignette: 0.5 }));
    const b = questionGrade(rest, pipelineGrade({ exposure: 0.95, contrast: 1.1, vignette: 0.1 }));
    expect(a).not.toEqual(b);
  });
  it('never leaves the safe range, whatever a venue asks for', () => {
    for (const v of [{ exposure: 5, contrast: 5, vignette: 5 }, { exposure: -2, contrast: 0, vignette: -1 }]) {
      const g = questionGrade(rest, v, 1);
      expect(g.exposure).toBeGreaterThanOrEqual(GRADE_RANGE.exposure[0]); expect(g.exposure).toBeLessThanOrEqual(GRADE_RANGE.exposure[1]);
      expect(g.contrast).toBeGreaterThanOrEqual(GRADE_RANGE.contrast[0]); expect(g.contrast).toBeLessThanOrEqual(GRADE_RANGE.contrast[1]);
      expect(g.vignette).toBeGreaterThanOrEqual(GRADE_RANGE.vignette[0]); expect(g.vignette).toBeLessThanOrEqual(GRADE_RANGE.vignette[1]);
    }
  });
  it('eases toward the target in place without overshoot and arrives', () => {
    const cur = { exposure: 1, contrast: 1, vignette: 0 }, to = { exposure: 1.3, contrast: 1.5, vignette: 2 };
    let moved = true, n = 0;
    while (moved && n++ < 2000) { moved = stepGrade(cur, to, 1 / 60); expect(cur.exposure).toBeLessThanOrEqual(1.3 + 1e-9); }
    expect(cur).toEqual(to);
  });
});
