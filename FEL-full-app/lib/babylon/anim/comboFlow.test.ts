// hoops-moves (owner 2026-10-20): THE COMBO WINDOW. "A move pressed in the last part of the previous one flows straight into it with no
// reset. Three in a row reads as a combo on screen. This is flow only: no odds change." Proven here: the count and its window (pure), the
// hesi's cut-in (the cross thrown out of a hesitation takes the ball at the float's top — the HESI CROSS — instead of after the hesi's
// pound and catch), on the real carry through the real renderer, and that the flow never reaches the decision (same outcomes, same
// rolls, with and without it).
import { describe, expect, it } from 'vitest';
import { pressCombo, endCombo, ComboFlow, COMBO_IDLE, COMBO_OPEN_K, COMBO_GRACE_SEC, COMBO_SHOW_AT, cutInWindow, type ComboState } from './comboFlow';
import { pathFor, type PathMove } from './handlePaths';
import { requestMove, type HandleHost } from './handleMotion';
import { MOVE_SHAPE, resolveHandleMove, CHAIN_IDLE, MOVES_UNLOCKED_GATE, type ChainState, type HandleMove } from '../core/HandleSystem';
import { hoopsNodeRig, type HoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';

const press = (st: ComboState, move: string, runningK: number | null, nowSec = 10, runningName: string | null = 'crossover', cutIn = false) => pressCombo(st, { move, runningK, runningName, cutIn, nowSec });

describe('the combo count (pure)', () => {
  it('a press in the last part of the running move flows; earlier in it, or long after, starts a new count', () => {
    let s = press(COMBO_IDLE, 'crossover', null);
    expect(s.flowed).toBe(false); expect(s.state.count).toBe(1);
    s = press(s.state, 'between_legs', COMBO_OPEN_K);
    expect(s.flowed).toBe(true); expect(s.state.count).toBe(2);
    s = press(s.state, 'behind_back', COMBO_OPEN_K - 0.05);
    expect(s.flowed).toBe(false); expect(s.state.count).toBe(1);
    const ended = endCombo(s.state, 20);
    expect(press(ended, 'crossover', null, 20 + COMBO_GRACE_SEC - 0.01).flowed).toBe(true);
    expect(press(ended, 'crossover', null, 20 + COMBO_GRACE_SEC + 0.05).flowed).toBe(false);
  });
  it('three in a row reads on screen ("3-MOVE COMBO"), and the fourth says 4; two does not', () => {
    let s = press(COMBO_IDLE, 'crossover', null);
    s = press(s.state, 'between_legs', 0.8); expect(s.label).toBeNull();
    s = press(s.state, 'behind_back', 0.7); expect(COMBO_SHOW_AT).toBe(3); expect(s.label).toBe('3-MOVE COMBO');
    s = press(s.state, 'crossover', 0.9); expect(s.label).toBe('4-MOVE COMBO');
  });
  it('a crossing flowed out of a hesi is the HESI CROSS — cut in at its float, whatever the k; a between out of a hesi is not', () => {
    const h = press(COMBO_IDLE, 'hesi', null);
    expect(press(h.state, 'crossover', 0.2, 10, 'hesi', true).label).toBe('HESI CROSS');
    expect(press(h.state, 'momentum_cross', 0.6, 10, 'hesi').label).toBe('HESI CROSS');
    expect(press(h.state, 'between_legs', 0.6, 10, 'hesi').label).toBeNull();
    expect(press(h.state, 'crossover', 0.2, 10, 'hesi', false).label).toBeNull();   // too early and no cut-in: a new count, no label
  });
  it('ComboFlow: the label is taken once; the clock is the flow\'s own', () => {
    let now = 5; const f = new ComboFlow(() => now);
    f.press({ move: 'hesi', runningK: null, runningName: null, cutIn: false }); f.event('start');   // (the hesi's path is on the carry)
    f.press({ move: 'crossover', runningK: 0.3, runningName: 'hesi', cutIn: true });
    expect(f.takeLabel()).toBe('HESI CROSS'); expect(f.takeLabel()).toBeNull();
    f.ended(); now += COMBO_GRACE_SEC / 2;
    expect(f.press({ move: 'behind_back', runningK: null, runningName: null, cutIn: false }).state.count).toBe(3);
    expect(f.takeLabel()).toBe('3-MOVE COMBO');
  });
});

describe('a quiet carry move (the guard hand) is not a move to flow out of', () => {
  it('pressed during a crossing the flow did not press: a new count, no label; pressed during its own move: it flows', () => {
    let now = 5; const f = new ComboFlow(() => now);
    f.press({ move: 'crossover', runningK: null, runningName: null, cutIn: false }); f.event('start'); f.event('end');
    now += 2;   // long after: the guard hand crosses (runMove, no events), and the hesi is pressed late in that crossing
    const h = f.press({ move: 'hesi', runningK: 0.8, runningName: 'crossover', cutIn: false });
    expect(h.flowed).toBe(false); expect(h.state.count).toBe(1);
    f.event('start');   // the hesi's own path starts
    const c = f.press({ move: 'crossover', runningK: 0.2, runningName: 'hesi', cutIn: true });
    expect(c.state.count).toBe(2); expect(f.takeLabel()).toBe('HESI CROSS');   // was "3-MOVE COMBO" on the 3v3 rig
    // pure: the same press with runningQuiet unset flows as before (the count's own tests above)
    expect(pressCombo({ ...COMBO_IDLE, count: 1 }, { move: 'hesi', runningK: 0.8, runningName: 'crossover', cutIn: false, nowSec: 0 }).flowed).toBe(true);
    expect(pressCombo({ ...COMBO_IDLE, count: 1 }, { move: 'hesi', runningK: 0.8, runningName: 'crossover', cutIn: false, runningQuiet: true, nowSec: 0 }).flowed).toBe(false);
  });
  it('on the real carry: a hesi requested during a quiet runMove crossing counts 1; the cross out of its float reads HESI CROSS', () => {
    const r: HoopsNodeRig = hoopsNodeRig('right');
    for (let i = 0; i < 60; i++) r.frame(1 / 60, 0.3);
    let t = 0; const flow = new ComboFlow(() => t);
    const host: HandleHost = { carry: r.carry, beat: () => {}, flow };
    flow.press({ move: 'crossover', runningK: null, runningName: null, cutIn: false });   // a stale count from an earlier move
    expect(r.carry.runMove('crossover', { pace: 1 })).toBe(true);   // the guard hand's quiet crossing (hoopsFlow.PlayerGuardHand)
    for (let i = 0; i < 24; i++) { t += 1 / 60; r.frame(1 / 60, 0.3); }   // late in it (k > COMBO_OPEN_K)
    expect(r.carry.move!.k).toBeGreaterThan(COMBO_OPEN_K);
    requestMove(host, { move: 'hesi', decide: { kind: 'none' } });
    expect(flow.state.count).toBe(1);
    let crossed = false;
    for (let i = 0; i < 90 && !crossed; i++) {
      t += 1 / 60; r.frame(1 / 60, 0.3);
      const m = r.carry.move; if (m?.name === 'hesi' && m.cutIn && m.t >= m.cutIn.from - 0.05) { requestMove(host, { move: 'crossover', decide: { kind: 'none' } }); crossed = true; }
    }
    expect(crossed).toBe(true); expect(flow.state.count).toBe(2); expect(flow.takeLabel()).toBe('HESI CROSS');
    r.dispose();
  });
});

describe('the cut-in window', () => {
  const moves: PathMove[] = [...(Object.keys(MOVE_SHAPE) as HandleMove[]).filter((m) => MOVE_SHAPE[m].path !== 'none'), 'jab', 'pausin', 'pausin_release'];
  it('only the hesitation has one — its float\'s top to the end of its pound, the start hand on the ball', () => {
    for (const m of moves) {
      for (const hand of ['right', 'left'] as const) {
        const p = pathFor(m, hand)!; const w = cutInWindow(p);
        if (m !== 'hesi') { expect(w, `${m} ${hand}`).toBeNull(); continue; }
        expect(w).not.toBeNull();
        expect(w!.from).toBeCloseTo(0.32, 2); expect(w!.to).toBeCloseTo(0.42, 2);   // handlePaths' hesi keys, pace 1
        expect(w!.to).toBeLessThan(p.duration);
      }
    }
  });
});

/** Dribble standing (0.3) a second, then run the hesi through the renderer and the cross `atSec` into it; per frame, the ball's x. */
function hesiThenCross(withFlow: boolean, at: number | ((w: { from: number; to: number }) => number), startHand: 'right' | 'left' = 'right') {
  const r: HoopsNodeRig = hoopsNodeRig(startHand);
  for (let i = 0; i < 60; i++) r.frame(1 / 60, 0.3);
  let t = 0;
  const flow = withFlow ? new ComboFlow(() => t) : undefined;
  const clips: string[] = []; const decided: string[] = [];
  const host: HandleHost = { carry: r.carry, beat: (c) => clips.push(c), flow };
  let chain: ChainState = { ...CHAIN_IDLE };
  const resolve = (m: HandleMove) => ({ kind: 'resolve' as const, run: () => { decided.push(m); const o = resolveHandleMove(m, chain, 50, { present: true, closing: true, set: false, within: true }, () => 0.5, MOVES_UNLOCKED_GATE); chain = o.chain; return o; } });
  const r1 = requestMove(host, { move: 'hesi', decide: resolve('hesi') });
  const win = r.carry.move!.cutIn!;   // the hesi's own window on this body (its stroke stretches the path: not handlePaths' raw 0.32–0.42)
  const atSec = typeof at === 'number' ? at : at(win);
  const xs: number[] = []; const steps: number[] = []; let last = r.ball.getAbsolutePosition().clone(); let r2 = null as ReturnType<typeof requestMove> | null; let firstContact: string | null | undefined;
  const sgn = startHand === 'right' ? 1 : -1;
  for (let i = 0; i < 90; i++) {
    t += 1 / 60;
    if (!r2 && t >= atSec) r2 = requestMove(host, { move: 'crossover', decide: resolve('crossover') });
    const p = r.frame(1 / 60, 0.3); steps.push(p.subtract(last).length()); last = p;
    if (firstContact === undefined && r.carry.move?.name === 'crossover') firstContact = r.carry.move.contact;
    xs.push(sgn * r.local(p).x);
  }
  const crossedAt = xs.findIndex((x) => x < -0.05) / 60;
  const out = { firstContact, win, r1, r2: r2!, crossedAt, maxStep: Math.max(...steps), hand: r.carry.hand, clips, decided, chain, label: flow?.takeLabel() ?? null };
  r.dispose();
  return out;
}

describe('the hesi cross: the cross thrown during a hesi flows from its float, not after its catch (the real carry, the real renderer)', () => {
  it('pressed in the float, the ball crosses at the float\'s top — ≥ 0.15 s sooner than the old queue — and nothing jumps', () => {
    for (const hand of ['right', 'left'] as const) {
      const old = hesiThenCross(false, 0.15, hand), now = hesiThenCross(true, 0.15, hand);
      expect(now.r2.ball, hand).toBe('queued'); expect(old.r2.ball).toBe('queued');
      expect(now.crossedAt, hand).toBeGreaterThan(0);
      expect(old.crossedAt - now.crossedAt, `${hand}: old ${old.crossedAt} now ${now.crossedAt}`).toBeGreaterThanOrEqual(0.15);
      expect(now.maxStep, hand).toBeLessThanOrEqual(0.15);
      expect(now.hand).toBe(hand === 'right' ? 'Left' : 'Right');
      expect(now.label).toBe('HESI CROSS');
      expect(now.firstContact, `${hand}: the hand PUSHES the cross out of the float — it is not dropped`).toBe(hand);
      expect(now.clips).toEqual(old.clips);   // the same two clips, the cross's at its own start
    }
  });
  it('pressed while the pound is still in the hand, it cuts in at once; pressed after the pound let go, it waits for the catch as before', () => {
    const inPoundAt = (w: { from: number; to: number }) => (w.from + w.to) / 2, lateAt = (w: { from: number; to: number }) => w.to + 0.06;
    const inPound = hesiThenCross(true, inPoundAt), late = hesiThenCross(true, lateAt), lateOld = hesiThenCross(false, lateAt);
    expect(inPound.win.to - inPound.win.from).toBeGreaterThan(2 / 60);
    expect(inPound.r2.ball).toBe('queued');
    expect(inPound.crossedAt).toBeLessThan(lateOld.crossedAt);
    expect(late.crossedAt).toBeCloseTo(lateOld.crossedAt, 2);   // past the window: today's queue, exactly
    expect(inPound.maxStep).toBeLessThanOrEqual(0.15);
  });
  it('FLOW ONLY: the decision is the same with and without the flow — the same moves decided once each, the same chain, the same odds', () => {
    for (const at of [0.15, (w: { from: number; to: number }) => (w.from + w.to) / 2, (w: { from: number; to: number }) => w.to + 0.06]) {
      const a = hesiThenCross(true, at), b = hesiThenCross(false, at);
      expect(a.decided).toEqual(['hesi', 'crossover']); expect(b.decided).toEqual(a.decided);
      expect(a.chain).toEqual(b.chain);
      expect(a.r2.outcome).toEqual(b.r2.outcome); expect(a.r1.outcome).toEqual(b.r1.outcome);
      expect(a.r2.impulse).toEqual(b.r2.impulse);
    }
  });
});
