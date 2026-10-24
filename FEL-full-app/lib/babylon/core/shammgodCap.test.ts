// SHAMMGOD-CAP-TEST: pins the Shammgod-only burst cap. REDIRECT_BURST_TOP_K is 1.21 and the DribbleController's move redirect writes
// it (the jog's stick-forward peak ~7.594 m/s, above anything the shared cap allows); every other move — the plain crossover first —
// still caps at the shared REDIRECT_TOP_K, 1.15. New tests only: hoopsCrossFixup.test.ts and shammgodPeak.test.ts are untouched.
import { describe, expect, it } from 'vitest';
import { DribbleController, redirectFor, REDIRECT_BURST_TOP_K, REDIRECT_TOP_K } from './BasketballCore';
import { DEFAULT_MOVEMENT } from './CourtMovement';
import { MOVE_SHAPE } from './HandleShape';
import { impulseFor, moveImpulse, type HandleMove } from './HandleSystem';

const DT = 1 / 60;
const TOP = DEFAULT_MOVEMENT.maxSpeed;
/** A 4.34 m/s jog at the rim (facing −z, stick forward, 1.5 s), then `move` — the cut the controller resolves on the next update. */
function jogInto(move: HandleMove): { d: DribbleController; pre: number; cutSpeed: number | null } {
  const d = new DribbleController(); d.setFacing(Math.PI);
  for (let k = 0; k < 90; k++) d.update(DT, 0, 1, false);
  const pre = d.vel.length();
  const i = impulseFor(move, 'left');
  d.redirect(i.forward, i.lateral, d.facing);
  d.update(DT, 0, 1, false);
  const cut = (d as unknown as { pendingCut: { speed: number } | null }).pendingCut;
  return { d, pre, cutSpeed: cut ? cut.speed : null };
}
const movers = (Object.keys(MOVE_SHAPE) as HandleMove[]).filter((m) => { const i = moveImpulse(m); return i.forward !== 0 || i.lateral !== 0; });

describe('SHAMMGOD-CAP-TEST: the 1.21 burst cap is the Shammgod\'s alone', () => {
  it('the constants: REDIRECT_BURST_TOP_K === 1.21, the shared REDIRECT_TOP_K === 1.15', () => {
    expect(REDIRECT_BURST_TOP_K).toBe(1.21);
    expect(REDIRECT_TOP_K).toBe(1.15);
  });
  it('the controller\'s Shammgod cut targets top × 1.21 (not × 1.15) from a 4.34 jog', () => {
    const s = jogInto('shammgod');
    expect(s.pre).toBeCloseTo(4.34, 1);
    expect(s.cutSpeed).not.toBeNull();
    expect(s.cutSpeed!).toBeCloseTo(TOP * REDIRECT_BURST_TOP_K, 6);
    expect(s.cutSpeed!).toBeGreaterThan(TOP * REDIRECT_TOP_K + 0.1);
  });
  it('jog 4.34, stick forward: the Shammgod peaks 7.55–7.65 m/s (measured ~7.594) — past the shared cap\'s ceiling', () => {
    const { d } = jogInto('shammgod');
    const sp: number[] = [d.vel.length()];
    for (let k = 0; k < 19; k++) { d.update(DT, 0, 1, false); sp.push(d.vel.length()); }
    const peak = Math.max(...sp);
    expect(peak).toBeGreaterThanOrEqual(7.55);
    expect(peak).toBeLessThanOrEqual(7.65);
    expect(peak).toBeCloseTo(7.594, 2);
    expect(peak).toBeGreaterThan(TOP * REDIRECT_TOP_K);   // unreachable under the 1.15 cap
  });
  it('the plain crossover still uses the shared 1.15 cap: redirectFor\'s default target is top × 1.15, the burst arg changes nothing', () => {
    const i = impulseFor('crossover', 'left');
    for (const held of [false, true]) {
      const shared = redirectFor(0, 9, 0, i.forward, i.lateral, held, TOP, REDIRECT_TOP_K);
      expect(redirectFor(0, 9, 0, i.forward, i.lateral, held)).toEqual(shared);
      expect(redirectFor(0, 9, 0, i.forward, i.lateral, held, TOP, REDIRECT_BURST_TOP_K)).toEqual(shared);
    }
    const c = jogInto('crossover');
    expect(c.cutSpeed).not.toBeNull();
    expect(c.cutSpeed!).toBeLessThanOrEqual(TOP * REDIRECT_TOP_K + 1e-9);
    expect(c.cutSpeed!).toBeCloseTo(redirectFor(0, c.pre, 0, impulseFor('crossover', 'left').forward, impulseFor('crossover', 'left').lateral, false, TOP, REDIRECT_TOP_K)!.speed, 2);
  });
  it('every other move\'s controller cut is the shared-cap (1.15) target, never above top × 1.15', () => {
    expect(movers).toContain('shammgod');
    const others = movers.filter((x) => x !== 'shammgod');
    expect(others.length).toBeGreaterThanOrEqual(6);   // crossover, between_legs, behind_back, double_cross, slip_slide, snatch_back
    for (const m of others) {
      const r = jogInto(m);
      expect(r.cutSpeed, m).not.toBeNull();
      expect(r.cutSpeed!, m).toBeLessThanOrEqual(TOP * REDIRECT_TOP_K + 1e-9);
      expect(r.cutSpeed!, m).toBeCloseTo(r.pre, 2);   // measured 4.351 for each: the jog kept, no burst
    }
  });
});
