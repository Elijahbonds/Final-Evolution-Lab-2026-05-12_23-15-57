// hoops-p06 (the play audit's sinker 1, HOOPS-AAA-GAP-PLAY): standing guarded, the automatic outside hand crosses the ball at most once every
// `hoops.guardHandRestGapSec` (1.5 s); on the move, and with the knob at 0, it is the rule as before. Its crossing asks for the hand-change
// catch lead (anim/ballCarry HAND_CHANGE_CATCH_LEAD_SEC).
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerGuardHand, GUARD_HAND_REST_GAP_SEC } from './hoopsFlow';
import { HAND_CHANGE_CATCH_LEAD_SEC } from '../anim/ballCarry';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

afterEach(() => resetFeelForTests());
const DT = 1 / 60;
/** A defender who always shades the ball side (so the rule always wants to cross), for `sec`; `mps` my own walk along x. */
function run(sec: number, mps = 0) {
  const g = new PlayerGuardHand();
  const carry = { hand: 'Right' as 'Left' | 'Right', move: null, opts: [] as unknown[], runMove(_m: string, o?: unknown) { this.opts.push(o); this.hand = this.hand === 'Right' ? 'Left' : 'Right'; return true; } };
  const me = { position: { x: 0, z: 0 }, rotation: { y: 0 } };
  const at: number[] = [];
  for (let t = 0; t < sec; t += DT) {
    me.position.x += mps * DT;
    // facing +z: a point at +x is on the body's left or right — put him on the side the ball is in (away = the other hand)
    const side = carry.hand === 'Right' ? 1 : -1;
    const def = { x: me.position.x + side * 0.9, z: 1.0 };
    if (g.step(DT, carry as never, me, def, true, 'T')) at.push(t);
  }
  return { at, carry };
}
const gaps = (a: number[]) => a.slice(1).map((t, i) => t - a[i]);

describe('the outside hand at rest', () => {
  it('ships at 1.5 s; the knob row carries it', () => {
    expect(GUARD_HAND_REST_GAP_SEC).toBe(1.5);
    expect(FEEL_KNOB_BY_ID.get('hoops.guardHandRestGapSec')?.def).toBe(GUARD_HAND_REST_GAP_SEC);
  });
  it('standing guarded, no two crossings closer than the gap', () => {
    const { at } = run(8);
    expect(at.length).toBeGreaterThanOrEqual(4);
    for (const g of gaps(at)) expect(g).toBeGreaterThanOrEqual(GUARD_HAND_REST_GAP_SEC - 1e-6);
  });
  it('0 is the rule as before: it crosses more often than the gap at rest', () => {
    setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.guardHandRestGapSec', 0);
    const { at } = run(8);
    expect(Math.min(...gaps(at))).toBeLessThan(GUARD_HAND_REST_GAP_SEC - 0.2);
  });
  it('on the move the gap does not apply (the rule as before)', () => {
    const moving = run(8, 2).at; setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.guardHandRestGapSec', 0);
    expect(run(8, 2).at).toEqual(moving);
  });
  it('its crossing asks for the catch lead; at the schedule\'s own lead the call is the old one', () => {
    expect(run(2).carry.opts[0]).toEqual({ pace: 1, catchLeadSec: HAND_CHANGE_CATCH_LEAD_SEC });
    setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.handChangeCatchLeadSec', 0.06);
    expect(run(2).carry.opts[0]).toEqual({ pace: 1 });
  });
});
