// HOOPS-CROSS-ANGLE (owner 2026-10-20: "Yes, use the tighter 2K-style crossover and replace the 76° tests with the 14–19° / 60°+ bar"):
// a handle move's push maps to a TIGHT turn with the left stick released (the hand changes, the line barely does) and to the full
// atan2(lateral, forward) turn with the stick held. HandleSystem's push values are unchanged; the fakes stay zero; the Shammgod keeps
// its line and its burst. New tests only (TH-6 carries the replaced 76° assertions).
import { describe, expect, it } from 'vitest';
import { DribbleController, redirectFor, redirectTurn, REDIRECT_TIGHT_MAX_RAD } from './BasketballCore';
import { MOVE_SHAPE } from './HandleShape';
import { impulseFor, moveImpulse, type HandleMove } from './HandleSystem';

const DT = 1 / 60;
const DEG = Math.PI / 180;
/** TH-6's conditions: straight ahead (facing +z) at a 6.40 m/s sprint. */
function atSpeed(): DribbleController {
  const d = new DribbleController(); d.setFacing(0);
  for (let i = 0; i < 90; i++) d.update(DT, 0, -1, true);
  return d;
}
/** The heading change 5 frames after the move, the stick (x, y) on those frames. */
function turnAfter(move: HandleMove, sx: number, sy: number): number {
  const d = atSpeed();
  const h0 = Math.atan2(d.vel.x, d.vel.z);
  const i = impulseFor(move, 'right');
  d.redirect(i.forward, i.lateral, d.facing);
  for (let k = 0; k < 5; k++) d.update(DT, sx, sy, true);
  return Math.atan2(d.vel.x, d.vel.z) - h0;
}
const movers = (Object.keys(MOVE_SHAPE) as HandleMove[]).filter((m) => { const i = moveImpulse(m); return i.forward > 0; });   // the forward movers (the snatchback comes back; the fakes are zero)

describe('HOOPS-CROSS-ANGLE: the tight 2K crossover, the wide one with the stick held', () => {
  it('the plain crossover (stick released, 6.40 m/s sprint, 5 frames on) turns the travel 14–19°, never over 25°', () => {
    const t = turnAfter('crossover', 0, 0);
    expect(t).toBeGreaterThanOrEqual(14 * DEG);
    expect(t).toBeLessThanOrEqual(19 * DEG);
    expect(t).toBeLessThanOrEqual(25 * DEG);
  });
  it('no forward mover turns the travel over 25° with the stick released; each still turns toward its side', () => {
    expect(movers).toEqual(expect.arrayContaining(['crossover', 'between_legs', 'behind_back', 'double_cross', 'slip_slide', 'shammgod']));
    for (const m of movers) {
      const t = turnAfter(m, 0, 0);
      expect(t, m).toBeGreaterThan(0);
      expect(t, m).toBeLessThanOrEqual(REDIRECT_TIGHT_MAX_RAD + 1e-9);
    }
  });
  it('held forward or pointed toward the side, every lateral mover turns the travel 60° or more (the Shammgod pushes ahead: not a lateral mover)', () => {
    for (const m of movers.filter((x) => x !== 'shammgod')) {
      expect(turnAfter(m, 0, -1), `${m} forward`).toBeGreaterThanOrEqual(60 * DEG);
      expect(turnAfter(m, 1, 0), `${m} side`).toBeGreaterThanOrEqual(60 * DEG);
    }
  });
  it('the turn mapping: held is atan2(lateral, forward) itself; released passes a turn under the 14° knee unchanged (the Shammgod), and a backward push (the snatchback) keeps its angle', () => {
    for (const m of movers) { const i = moveImpulse(m); expect(redirectTurn(i.forward, i.lateral, true), m).toBe(Math.atan2(i.lateral, i.forward)); }
    const sham = moveImpulse('shammgod');
    expect(redirectTurn(sham.forward, sham.lateral, false)).toBe(Math.atan2(sham.lateral, sham.forward));
    const snatch = moveImpulse('snatch_back');
    expect(redirectTurn(snatch.forward, snatch.lateral, false)).toBe(Math.atan2(snatch.lateral, snatch.forward));
    expect(redirectTurn(0.4, -1.6, false)).toBe(-redirectTurn(0.4, 1.6, false));   // mirrored to the left
  });
  it('the fakes stay zero: no redirect queued, stick held or not', () => {
    for (const m of ['hesi', 'yoyo', 'in_and_out', 'spin'] as HandleMove[]) {
      const i = moveImpulse(m);
      expect(redirectFor(0, 5, 0, i.forward, i.lateral, true), m).toBeNull();
      expect(atSpeed().redirect(i.forward, i.lateral, 0), m).toBe(false);
    }
  });
  it('the queued move: one per frame (a second push before the update is refused), and an authored cut written after it keeps its line', () => {
    const d = atSpeed();
    const i = impulseFor('crossover', 'right');
    expect(d.redirect(i.forward, i.lateral, d.facing)).toBe(true);
    expect(d.redirect(i.forward, i.lateral, d.facing)).toBe(false);
    d.stepBack(0, 1, true);   // the step-back hop written after the move, before the update
    const cut = { ...(d as unknown as { pendingCut: object }).pendingCut };
    d.update(DT, 0, 0, true);
    const after = (d as unknown as { pendingCut: { x: number; z: number } }).pendingCut;
    expect(after.x).toBeCloseTo((cut as { x: number }).x, 9);
    expect(after.z).toBeCloseTo((cut as { z: number }).z, 9);
  });
});
