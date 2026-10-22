// HOOPS-CROSS-FIXUP (QA PR #384 item 3): the Shammgod's exit carries a burst ABOVE the current speed again. 8faaa228's redirect set the
// speed to max(current, |impulse|), and the Shammgod's 3.49 sits under a 4.34 m/s jog — it exited at 4.35, a plain crossover's speed
// (it peaked 7.63 before). A forward-dominant impulse (of the movers only the Shammgod) gets current + |impulse| under the redirect's
// cap; the turn (atan2(lateral, forward)) and every other move are untouched. New tests only.
import { describe, expect, it } from 'vitest';
import { DribbleController, redirectFor, REDIRECT_TOP_K } from './BasketballCore';
import { DEFAULT_MOVEMENT } from './CourtMovement';
import { MOVE_SHAPE } from './HandleShape';
import { impulseFor, moveImpulse, type HandleMove } from './HandleSystem';

const DT = 1 / 60;
/** A body running at the rim (facing −z, stick up) for 1.5 s — a 4.34 m/s jog, or a 6.40 sprint. */
function running(sprint: boolean): DribbleController {
  const d = new DribbleController(); d.setFacing(Math.PI);
  for (let i = 0; i < 90; i++) d.update(DT, 0, 1, sprint);
  return d;
}
/** The move's impulse through the redirect, then 20 frames with the stick held forward: [pre-move speed, peak, speed at the blend's end]. */
function exitOf(move: HandleMove, sprint: boolean): { pre: number; peak: number; blended: number } {
  const d = running(sprint);
  const pre = d.vel.length();
  const i = impulseFor(move, 'left');
  d.redirect(i.forward, i.lateral, d.facing);
  const sp: number[] = [];
  for (let k = 0; k < 20; k++) { d.update(DT, 0, 1, sprint); sp.push(d.vel.length()); }
  return { pre, peak: Math.max(...sp), blended: sp[5] };   // the cut lands inside CUT_BLEND_SEC (0.07 s): frame 6 is past it
}

describe('HOOPS-CROSS-FIXUP: the Shammgod bursts out of the redirect', () => {
  for (const sprint of [false, true]) {
    it(`${sprint ? 'at a sprint' : 'from a jog'}: the Shammgod's exit is faster than the pre-move speed and than a plain crossover's exit`, () => {
      const sham = exitOf('shammgod', sprint), cross = exitOf('crossover', sprint);
      const by = sprint ? 0.5 : 1;   // at a sprint the cap (top × 1.15 = 7.36) leaves under 1 m/s over 6.40
      expect(sham.pre).toBeGreaterThan(sprint ? 6 : 4);
      expect(sham.blended).toBeGreaterThan(sham.pre + by);
      expect(sham.peak).toBeGreaterThan(sham.pre + by);
      expect(sham.blended).toBeGreaterThan(cross.blended + by);
      expect(sham.peak).toBeGreaterThan(cross.peak + by);
    });
  }
  it('redirectFor: the Shammgod\'s target is current + |impulse| under the cap; its turn is still atan2(lateral, forward)', () => {
    const top = DEFAULT_MOVEMENT.maxSpeed;
    const i = impulseFor('shammgod', 'right');
    const r = redirectFor(0, 3, 0, i.forward, i.lateral)!;
    expect(r.speed).toBeCloseTo(Math.min(top * REDIRECT_TOP_K, 3 + Math.hypot(i.forward, i.lateral)), 6);
    expect(r.turnRad).toBeCloseTo(Math.atan2(0.8, 3.4), 6);
    expect(Math.atan2(r.x, r.z)).toBeCloseTo(Math.atan2(0.8, 3.4), 6);
    expect(redirectFor(0, 4.34, 0, i.forward, i.lateral)!.speed).toBeCloseTo(top * REDIRECT_TOP_K, 6);   // capped
    expect(redirectFor(0, top * 1.2, 0, i.forward, i.lateral)!.speed).toBeCloseTo(top * 1.2, 6);           // never braked
  });
  it('the burst is the Shammgod\'s only: it is the one mover whose impulse is forward-dominant, and every other mover\'s target stays max(current, |impulse|)', () => {
    const top = DEFAULT_MOVEMENT.maxSpeed;
    const movers = (Object.keys(MOVE_SHAPE) as HandleMove[]).filter((m) => { const i = moveImpulse(m); return i.forward !== 0 || i.lateral !== 0; });
    expect(movers).toContain('shammgod');
    expect(movers.filter((m) => moveImpulse(m).forward > Math.abs(moveImpulse(m).lateral))).toEqual(['shammgod']);
    for (const m of movers.filter((x) => x !== 'shammgod')) {
      const i = impulseFor(m, 'right');
      expect(redirectFor(0, 4.34, 0, i.forward, i.lateral)!.speed, m).toBeCloseTo(Math.max(4.34, Math.min(top * REDIRECT_TOP_K, Math.hypot(i.forward, i.lateral))), 6);
    }
  });
});
