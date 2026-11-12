// hoops-p06 (GAMEPLAY-CLEAN-AUDIT §4i, "left open" 1: the dribble hand change pops): on the carry's own hand-change crossing the catching
// hand starts to meet the ball HAND_CHANGE_CATCH_LEAD_SEC before the catch (handlePaths.pathAt's catchLeadSec); every other path keeps the
// schedule's CONTACT_FADE_SEC, and the knob's 0.06 is that exactly.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pathFor, pathAt, CONTACT_FADE_SEC } from './handlePaths';
import { HAND_CHANGE_CATCH_LEAD_SEC } from './ballCarry';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';

describe('the hand change: the catching hand comes to meet the ball', () => {
  it('ships at 0.45 s; the knob row carries it and its floor is the schedule\'s own lead', () => {
    expect(HAND_CHANGE_CATCH_LEAD_SEC).toBe(0.45);
    const k = FEEL_KNOB_BY_ID.get('hoops.handChangeCatchLeadSec')!;
    expect(k.def).toBe(HAND_CHANGE_CATCH_LEAD_SEC);
    expect(k.min).toBe(CONTACT_FADE_SEC);
  });
  it('with no lead (or the schedule\'s), pathAt is the schedule exactly', () => {
    const p = pathFor('crossover', 'right')!;
    for (let t = 0; t <= p.duration; t += 1 / 60) {
      expect(pathAt(p, t, CONTACT_FADE_SEC)).toEqual(pathAt(p, t));
      expect(pathAt(p, t, 0)).toEqual(pathAt(p, t));
    }
  });
  it('a longer lead only adds reach before a catch: never less weight, the same weight on contact and after it', () => {
    const p = pathFor('crossover', 'right')!;
    let earlier = 0;
    for (let t = 0; t <= p.duration; t += 1 / 60) {
      const a = pathAt(p, t), b = pathAt(p, t, HAND_CHANGE_CATCH_LEAD_SEC);
      for (const h of ['right', 'left'] as const) {
        expect(b.reach[h]).toBeGreaterThanOrEqual(a.reach[h] - 1e-9);
        if (a.reach[h] === 1) expect(b.reach[h]).toBe(1);
        if (b.reach[h] > a.reach[h] + 1e-6) earlier++;
      }
      expect(b.ball).toEqual(a.ball);   // the ball's path is untouched
    }
    expect(earlier).toBeGreaterThan(5);
  });
  it('only the carry\'s own hand change asks for it', () => {
    const src = readFileSync('lib/babylon/anim/ballCarry.ts', 'utf8');
    expect(src.match(/catchLeadSec: lead/g)?.length).toBe(1);   // (and the guard hand's crossing: modes/hoopsFlow.restGap.test.ts)
    expect(src).toMatch(/const switchHoops = [\s\S]{0,700}feel\('hoops\.handChangeCatchLeadSec', HAND_CHANGE_CATCH_LEAD_SEC\)/);
  });
});
