// IMPROVE (2026-10-06, snow items 4 / 5 / 8 / 12 / 13): the slalom's new rules, pure — the streak's bonus, a missed gate's time,
// the pace split, a long grab's pay, and the pot the host's gold number reads.
import { describe, expect, it } from 'vitest';
import {
  gateStreakBonus, GATE_STREAK_FROM, GATE_STREAK_STEP, GATE_STREAK_MAX, runTimeSec, GATE_MISS_PENALTY_SEC, paceSplitSec, splitLabel,
  GRAB_HOLD_FROM_SEC, GRAB_HOLD_PER_SEC, GRAB_HOLD_MAX, timeBonus, TIME_PAR_SEC, YETI_WARN_SEC,
} from './gateCrasher';
import { TRICKS, TrickMachine, grabHoldBonus, type BoardRig, type TrickDef, type TrickMachineOpts } from './boardCore';

describe('item 5 — a clean line pays (gateStreakBonus)', () => {
  it('pays nothing for the first two gates of a streak, then STEP more a gate, capped at MAX', () => {
    expect(GATE_STREAK_FROM).toBe(3);
    expect([1, 2].map(gateStreakBonus)).toEqual([0, 0]);
    expect(gateStreakBonus(3)).toBe(GATE_STREAK_STEP);
    expect(gateStreakBonus(4)).toBe(2 * GATE_STREAK_STEP);
    expect(gateStreakBonus(7)).toBe(GATE_STREAK_MAX);
    expect(gateStreakBonus(30)).toBe(GATE_STREAK_MAX);
  });
  it('a broken or junk streak pays nothing', () => {
    for (const s of [0, -3, Number.NaN]) expect(gateStreakBonus(s)).toBe(0);
  });
  it('a whole clean run of 30 is worth 1300 on top of the gates (never more than half a gate each)', () => {
    const total = Array.from({ length: 30 }, (_, i) => gateStreakBonus(i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBe(1300);
    expect(GATE_STREAK_MAX).toBeLessThanOrEqual(50);
  });
});

describe('item 8 — a missed gate costs time (runTimeSec)', () => {
  it('adds the penalty a miss to the time ridden', () => {
    expect(GATE_MISS_PENALTY_SEC).toBe(2);
    expect(runTimeSec(50, 0)).toBe(50);
    expect(runTimeSec(50, 3)).toBe(56);
    expect(runTimeSec(50, -1)).toBe(50);
  });
  it('so the time bonus pays less for a skipped line', () => {
    expect(timeBonus(runTimeSec(55, 4))).toBeLessThan(timeBonus(runTimeSec(55, 0)));
    expect(timeBonus(runTimeSec(55, 4))).toBe(timeBonus(63));
  });
});

describe('item 12 — the pace split (paceSplitSec / splitLabel)', () => {
  it('is the run time minus the par\'s share of the run to this point', () => {
    expect(paceSplitSec(31, 340, 680, 60)).toBeCloseTo(1, 9);         // halfway at 31 s against a 60 s par: one second behind
    expect(paceSplitSec(28, 340, 680, 60)).toBeCloseTo(-2, 9);        // two ahead
    expect(paceSplitSec(70, 900, 680, 60)).toBeCloseTo(10, 9);        // past the finish: the whole par
    expect(paceSplitSec(5, -10, 680)).toBeCloseTo(5, 9);              // above the start: none of it
    expect(paceSplitSec(65, 100, 0)).toBeCloseTo(65 - TIME_PAR_SEC, 9); // no finish known: the whole par
  });
  it('reads ahead with a minus, behind with a plus, one decimal', () => {
    expect(splitLabel(-1.44)).toBe('−1.4');
    expect(splitLabel(0.6)).toBe('+0.6');
    expect(splitLabel(0)).toBe('−0.0');
  });
});

describe('item 6 — the yeti is warned before it comes', () => {
  it('the warning is between one and two seconds', () => {
    expect(YETI_WARN_SEC).toBeGreaterThanOrEqual(1);
    expect(YETI_WARN_SEC).toBeLessThanOrEqual(2);
  });
});

function fake(opts: TrickMachineOpts = {}) {
  const rider = { grounded: true, vel: { scaleInPlace: () => undefined }, jump: () => undefined };
  const rig = { char: { root: { rotation: { y: 0, z: 0 } }, animator: { play: () => undefined } }, rider } as unknown as BoardRig;
  const hud: Record<string, string | number>[] = [];
  const tm = new TrickMachine(rig, (h) => hud.push(h), { anim: 'external', ...opts });
  const step = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) tm.update(1 / 60); };
  /** throw `t`, hold it `holdSec` (a grab's release then), ride to `airSec`, land: the landing's banner */
  const air = (t: TrickDef, holdSec: number, airSec: number): string | null => {
    rider.grounded = false; tm.start(t);
    step(holdSec); tm.endGrab();
    step(airSec - holdSec);
    rider.grounded = true; return tm.update(1 / 60);
  };
  const lastPot = () => { for (let i = hud.length - 1; i >= 0; i--) if ('pot' in hud[i]) return hud[i].pot; return undefined; };
  return { tm, rider, step, air, hud, lastPot };
}
const SNOW: TrickMachineOpts = { minGrabSec: TrickMachine.MIN_TAP_GRAB_SEC, grabHold: { fromSec: GRAB_HOLD_FROM_SEC, perSec: GRAB_HOLD_PER_SEC, max: GRAB_HOLD_MAX } };

describe('item 13 — a long grab pays (grabHoldBonus, TrickMachineOpts.grabHold)', () => {
  it('nothing up to fromSec, perSec a second past it, capped at max; no rule, nothing', () => {
    const rule = { fromSec: 0.4, perSec: 0.5, max: 0.5 };
    expect(GRAB_HOLD_FROM_SEC).toBeGreaterThan(TrickMachine.MIN_TAP_GRAB_SEC + 2 / 60);   // clear of a tap's frame-quantised minimum
    expect(grabHoldBonus(TrickMachine.MIN_TAP_GRAB_SEC + 1 / 60, rule)).toBe(0);
    expect(grabHoldBonus(0.4, rule)).toBe(0);
    expect(grabHoldBonus(0.9, rule)).toBeCloseTo(0.25, 9);
    expect(grabHoldBonus(5, rule)).toBe(0.5);
    expect(grabHoldBonus(5, undefined)).toBe(0);
  });
  it('a grab held 0.9 s pays a quarter more on snow, and says how long it was held', () => {
    const { air } = fake(SNOW);
    const b = air(TRICKS.grab, 0.9, 1.0);
    expect(b).toBe(`GRAB · HELD 0.9s +${Math.round(TRICKS.grab.pts * (1 + (0.9 - GRAB_HOLD_FROM_SEC) * GRAB_HOLD_PER_SEC))}`);
  });
  it('a tap is still the plain clean grab (no hold, no bonus)', () => {
    const { air } = fake(SNOW);
    expect(air(TRICKS.grab, 1 / 60, 0.8)).toBe(`GRAB +${TRICKS.grab.pts}`);
  });
  it('opt-in: without grabHold (surf, the gauntlet) the same long hold pays the same as before', () => {
    const { air } = fake({ minGrabSec: TrickMachine.MIN_TAP_GRAB_SEC });
    expect(air(TRICKS.grab, 0.9, 1.0)).toBe(`GRAB +${TRICKS.grab.pts}`);
  });
  it('a spin is never a held grab', () => {
    const { air } = fake(SNOW);
    expect(air(TRICKS.spin, 1.0, 1.0)).toBe(`360 +${TRICKS.spin.pts}`);
  });
});

describe('item 4 — the pot is published', () => {
  it('a landing publishes the live pot, the bank and a bail clear it', () => {
    const { air, step, lastPot, tm } = fake(SNOW);
    air(TRICKS.grab, 1 / 60, 0.8);
    expect(lastPot()).toBe(tm.comboPts);
    expect(lastPot()).toBe(TRICKS.grab.pts);
    step(TrickMachine.LINK_GRACE_SEC + 0.1);   // banked
    expect(lastPot()).toBe(0);
    air(TRICKS.grab, 1 / 60, 0.8);
    expect(lastPot()).toBeGreaterThan(0);
    tm.bail();
    expect(lastPot()).toBe(0);
  });
  it('a rail opens the chain on the ticker: combo and pot both go out', () => {
    const { tm, hud, lastPot } = fake(SNOW);
    tm.bankGrind({ bonus: 150 } as never);
    expect(hud.some((h) => h.combo === '1x')).toBe(true);
    expect(lastPot()).toBe(150);
  });
  it('the other keys go out in the objects they always did (the carnival host reads them exactly)', () => {
    const { air, hud } = fake(SNOW);
    air(TRICKS.grab, 1 / 60, 0.8);
    expect(hud).toContainEqual({ combo: '1x' });
    expect(hud).toContainEqual({ pot: TRICKS.grab.pts });
  });
});
