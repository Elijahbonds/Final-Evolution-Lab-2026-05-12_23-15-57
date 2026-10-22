// SHAMMGOD-PEAK (tuned, flagged): the Shammgod's forward burst out of the redirect peaks at ~7.6 m/s from a 4.34 m/s jog (the
// pre-8faaa228 7.63). HOOPS-CROSS-FIXUP's burst sat under the 1.15 cap (7.36 target) and peaked 7.21 once the blend paid its decel; the
// burst now has its own cap, REDIRECT_BURST_TOP_K. The plain crossover's speed (and every other move's) is unchanged. New tests only.
import { describe, expect, it } from 'vitest';
import { DribbleController, redirectFor, REDIRECT_BURST_TOP_K, REDIRECT_TOP_K } from './BasketballCore';
import { DEFAULT_MOVEMENT } from './CourtMovement';
import { MOVE_SHAPE } from './HandleShape';
import { impulseFor, moveImpulse, type HandleMove } from './HandleSystem';

const DT = 1 / 60;
/** A body running at the rim (facing −z, stick up) for 1.5 s — a 4.34 m/s jog, or a 6.40 sprint — then the move, then 20 frames with
 *  the stick held forward: [pre-move speed, peak, speed at f6, speed at f20]. */
function exitOf(move: HandleMove, sprint: boolean): { pre: number; peak: number; f6: number; f20: number } {
  const d = new DribbleController(); d.setFacing(Math.PI);
  for (let i = 0; i < 90; i++) d.update(DT, 0, 1, sprint);
  const pre = d.vel.length();
  const i = impulseFor(move, 'left');
  d.redirect(i.forward, i.lateral, d.facing);
  const sp: number[] = [];
  for (let k = 0; k < 20; k++) { d.update(DT, 0, 1, sprint); sp.push(d.vel.length()); }
  return { pre, peak: Math.max(...sp), f6: sp[5], f20: sp[19] };
}

describe('SHAMMGOD-PEAK: the Shammgod\'s burst peaks at ~7.6 m/s', () => {
  it('from a 4.34 jog, stick forward: the peak lands in 7.55–7.65 m/s', () => {
    const s = exitOf('shammgod', false);
    expect(s.pre).toBeCloseTo(4.35, 1);
    expect(s.peak).toBeGreaterThanOrEqual(7.55);
    expect(s.peak).toBeLessThanOrEqual(7.65);
  });
  it('from a 6.40 sprint the peak is the same cap (7.55–7.65 m/s)', () => {
    const s = exitOf('shammgod', true);
    expect(s.pre).toBeCloseTo(6.4, 1);
    expect(s.peak).toBeGreaterThanOrEqual(7.55);
    expect(s.peak).toBeLessThanOrEqual(7.65);
  });
  for (const sprint of [false, true]) {
    it(`${sprint ? 'at a sprint' : 'from a jog'}: the plain crossover's speed is unchanged — it keeps the pre-move speed, no burst`, () => {
      const c = exitOf('crossover', sprint);
      expect(c.peak).toBeCloseTo(c.pre, 2);
      expect(c.f6).toBeCloseTo(c.pre, 2);
      expect(c.f20).toBeCloseTo(c.pre, 2);
    });
  }
  it('the burst cap reaches only the forward-dominant mover: every other move\'s target ignores burstTopK', () => {
    const top = DEFAULT_MOVEMENT.maxSpeed;
    expect(REDIRECT_BURST_TOP_K).toBeGreaterThan(REDIRECT_TOP_K);
    const movers = (Object.keys(MOVE_SHAPE) as HandleMove[]).filter((m) => { const i = moveImpulse(m); return i.forward !== 0 || i.lateral !== 0; });
    for (const m of movers.filter((x) => x !== 'shammgod')) {
      const i = impulseFor(m, 'right');
      for (const held of [false, true]) {
        expect(redirectFor(0, 4.34, 0, i.forward, i.lateral, held, top, REDIRECT_BURST_TOP_K), m).toEqual(redirectFor(0, 4.34, 0, i.forward, i.lateral, held, top));
      }
    }
    const i = impulseFor('shammgod', 'right');
    const r = redirectFor(0, 4.34, 0, i.forward, i.lateral, false, top, REDIRECT_BURST_TOP_K)!;
    expect(r.speed).toBeCloseTo(Math.min(top * REDIRECT_BURST_TOP_K, 4.34 + Math.hypot(i.forward, i.lateral)), 6);
    expect(r.turnRad).toBeCloseTo(redirectFor(0, 4.34, 0, i.forward, i.lateral)!.turnRad, 9);   // the turn is untouched
  });
});
