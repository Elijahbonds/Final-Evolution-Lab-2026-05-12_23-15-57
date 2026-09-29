// bodyFight — the body's fight read as the combat modes' verbs, unit by unit (movement play P7). The seams end to end
// (reader → driver → book → strike, the ledger at impact) are bodyFight.gate.test.ts.
import { describe, it, expect } from 'vitest';
import {
  elapsedOf, hitDelayMs, bodyCancelAt, contactMsOf, cancelMsOf, BodyFightDriver, DefenseLedger, bodyDefenseAt, DeferredHits,
  BodyDriveTracker, bodyLunge, stepSpace, planeMove, BODY_WINDUP_FLOOR_MS, BODY_PARRY_WINDOW_MS, BODY_GUARD_IMPACT_MS,
  DEFER_CAP_MS, CONFIRM_MS, CONFIRM_FRAMES, BODY_LUNGE_M, BODY_LUNGE_PAD_M, STEP_SPACE_M, SIDE_STEP_M, BODY_SLIP_IFRAMES_MS, FIGHT_CLAIMS,
  FIGHT_CARD_LINES, PadBlock, type BodyViewLike,
} from './bodyFight';
import { MOVES, STRIKE_TIMING } from '../core/HordeDynamics';
import type { FightEvent } from '@/lib/pose/fightReader';

const view = (readT: number, arrivedAt: number, lagMs: number): BodyViewLike => ({ read: { t: readT }, arrivedAt, lagMs });

describe('the elapsed time of a body event (PLAN-P7 §3.1)', () => {
  it('is the page time since arrival + the capture → arrival lag + the reader delay, each a difference on one clock', () => {
    // captured at 1000 (camera clock), told by the frame captured at 1100, which arrived on the page at 50 000 with a 120 ms
    // lag; the page's now is 50 010
    expect(elapsedOf(1000, view(1100, 50_000, 120), 50_010)).toBe(10 + 120 + 100);
  });
  it('never goes negative (a clock step)', () => {
    expect(elapsedOf(2000, view(1000, 5000, 0), 4000)).toBe(0);
  });
});

describe('offence timing (PLAN-P7 §3.2)', () => {
  it('the hit beat is what is left of the startup, never under the contact frame or the 50 ms floor', () => {
    expect(hitDelayMs(300, 60, 100)).toBe(200);           // plenty left
    expect(hitDelayMs(300, 60, 280)).toBe(60);            // the latency ate the startup: the contact frame
    expect(hitDelayMs(300, 20, 400)).toBe(BODY_WINDUP_FLOOR_MS);
  });
  it('a move\'s contact and cancel frames are its weight\'s over its speed', () => {
    const jab = MOVES.jab;
    expect(contactMsOf(jab)).toBeCloseTo((STRIKE_TIMING[jab.weight].hitAt / jab.speed) * 1000, 9);
    expect(cancelMsOf(jab)).toBeCloseTo((STRIKE_TIMING[jab.weight].cancelAt / jab.speed) * 1000, 9);
  });
  it('the cancel point is past the hit beat (each link lands before the next can cut it) and runs from the onset', () => {
    const m = MOVES.cross;
    expect(bodyCancelAt(1000, 500, m)).toBe(Math.max(1016, 500 + cancelMsOf(m)));
    expect(bodyCancelAt(1000, 990, m)).toBe(990 + cancelMsOf(m));
  });
});

const blow = (name: 'jab' | 'cross' | 'hook' | 'uppercut', t = 1000): FightEvent => ({
  kind: 'blow', t, seen: t + 90, hand: name === 'cross' ? 'R' : 'L', lead: name !== 'cross', form: name === 'jab' || name === 'cross' ? 'straight' : name, name, peakT: t + 60, speed: 4,
} as FightEvent);
const kick = (form: 'front' | 'round', o: { airborne?: boolean; spin?: boolean } = {}): FightEvent => ({
  kind: 'legKick', t: 1000, seen: 1100, foot: 'R', form, airborne: !!o.airborne, spin: !!o.spin, peakT: 1080, speed: 6,
} as FightEvent);

describe('BodyFightDriver: event → intent (PLAN-P7 §4.1)', () => {
  const v = view(1100, 20_000, 100);
  it('each blow is its literal book move, on its string token, with its onset on the page clock', () => {
    const d = new BodyFightDriver();
    const got = (['jab', 'cross', 'hook', 'uppercut'] as const).map((n) => d.intent(blow(n), v, 20_010));
    expect(got.map((i) => i && i.kind === 'strike' ? [i.body, i.move, i.token] : null)).toEqual([
      ['jab', 'jab', 'A'], ['cross', 'cross', 'A'], ['hook', 'hook', 'A'], ['uppercut', 'uppercutLink', 'Y'],
    ]);
    const i = got[0]!;
    expect(i.kind === 'strike' && [i.elapsedMs, i.onsetPage]).toEqual([10 + 100 + 100, 20_010 - 210]);
  });
  it('kicks: front → kick, round → roundhouse; the jump kick only with the opt-in; a spin kick is its path without it', () => {
    let on = false;
    const d = new BodyFightDriver({ kicksOptIn: () => on });
    const move = (e: FightEvent) => { const i = d.intent(e, v, 20_000); return i && i.kind === 'strike' ? i.move : null; };
    expect([move(kick('front')), move(kick('round')), move(kick('round', { airborne: true })), move(kick('round', { spin: true }))])
      .toEqual(['kick', 'roundhouse', null, 'roundhouse']);
    on = true;
    expect([move(kick('round', { airborne: true })), move(kick('round', { spin: true }))]).toEqual(['jumpKick', 'backSpin']);
  });
  it('the guard, the evades and the steps pass through; a turn is never an intent', () => {
    const d = new BodyFightDriver();
    expect(d.intent({ kind: 'guard', t: 1000, seen: 1060, up: true, raise: true, push: false } as FightEvent, v, 20_000)).toMatchObject({ kind: 'guard', up: true, raise: true });
    expect(d.intent({ kind: 'evade', t: 1000, seen: 1080, form: 'slip', side: 'L' } as FightEvent, v, 20_000)).toMatchObject({ kind: 'evade', form: 'slip', side: 'L' });
    expect(d.intent({ kind: 'fightStep', t: 1000, seen: 1200, dir: 'in' } as FightEvent, v, 20_000)).toMatchObject({ kind: 'step', dir: 'in' });
    expect(d.intent({ kind: 'turn', t: 1000, seen: 1100, dir: 'L', deg: 90 } as FightEvent, v, 20_000)).toBeNull();
  });
});

describe('DefenseLedger + bodyDefenseAt: the body\'s state at the impact (PLAN-P7 §3.3)', () => {
  const guard = (up: boolean, onsetPage: number, raise = up, push = false) => ({ kind: 'guard' as const, up, raise, push, onsetPage });
  it('a raise inside the body parry window parries; later, the held guard blocks; a push inside the impact window guard-impacts', () => {
    const L = new DefenseLedger();
    L.guard(guard(true, 1000));
    expect(bodyDefenseAt(L, 1000 + BODY_PARRY_WINDOW_MS).d).toBe('parried');
    expect(bodyDefenseAt(L, 1000 + BODY_PARRY_WINDOW_MS + 1).d).toBe('blocked');
    const P = new DefenseLedger();
    P.guard(guard(true, 1000, true, true));
    expect(bodyDefenseAt(P, 1000 + BODY_GUARD_IMPACT_MS).d).toBe('guardImpact');
    expect(bodyDefenseAt(P, 1000 + BODY_GUARD_IMPACT_MS + 1).d).toBe('parried');
  });
  it('a guard raised AFTER the impact is nothing; a guard let down before it is nothing; a guard held up without a raise blocks', () => {
    const L = new DefenseLedger();
    L.guard(guard(true, 1050));
    expect(bodyDefenseAt(L, 1000).d).toBe('none');
    L.guard(guard(false, 1400));
    expect(bodyDefenseAt(L, 1500).d).toBe('none');
    const H = new DefenseLedger();
    H.guard(guard(true, 1000, false));
    expect(bodyDefenseAt(H, 1100).d).toBe('blocked');
  });
  it('a slip\'s i-frames over the impact evade it (and say when the slip began)', () => {
    const L = new DefenseLedger();
    L.evade({ kind: 'evade', form: 'slip', side: 'R', onsetPage: 900, elapsedMs: 0 });
    expect(bodyDefenseAt(L, 900 + BODY_SLIP_IFRAMES_MS)).toEqual({ d: 'evaded', evadeOnset: 900 });
    expect(bodyDefenseAt(L, 900 + BODY_SLIP_IFRAMES_MS + 1).d).toBe('none');
  });
  it('the guard follows the reader\'s state: an open guard it no longer holds (a body lost, a new one calibrating) closes at that frame — \'down\'', () => {
    const L = new DefenseLedger();
    L.guard(guard(true, 1000, false));
    expect(L.frame({ read: { t: 0, fight: { guard: true } }, arrivedAt: 1500, lagMs: 100 }, 1500)).toBeNull();
    expect(L.guardUp).toBe(true);
    expect(L.frame({ read: { t: 0, fight: null }, arrivedAt: 2000, lagMs: 100 }, 2000)).toBe('down');
    expect(L.guardUp).toBe(false);
    expect(bodyDefenseAt(L, 1800).d).toBe('blocked');   // held until the frame captured at 1900
    expect(bodyDefenseAt(L, 1950).d).toBe('none');
    // a frame with no fight state (the body not seen) changes nothing
    const K = new DefenseLedger(); K.guard(guard(true, 1000, false));
    expect(K.frame(view(0, 2000, 100), 2000)).toBeNull();
    expect(K.guardUp).toBe(true);
  });
  it('…and a guard it holds that is not open here (held through a round\'s start, its up refused in a menu) opens at that frame, no raise — \'up\' (the review, 2026-09-26)', () => {
    const L = new DefenseLedger();
    expect(L.frame({ read: { t: 0, fight: { guard: true } }, arrivedAt: 3000, lagMs: 100 }, 3000)).toBe('up');
    expect(L.guardUp).toBe(true);
    expect(bodyDefenseAt(L, 2950).d).toBe('blocked');
    expect(bodyDefenseAt(L, 2850).d).toBe('none');
    // the up told with the very packet whose state opened it keeps the earlier instant (its onset), and its raise
    const M = new DefenseLedger();
    M.frame({ read: { t: 0, fight: { guard: true } }, arrivedAt: 3000, lagMs: 100 }, 3000);
    M.guard(guard(true, 2800, true));
    expect(bodyDefenseAt(M, 2850).d).toBe('parried');
    expect(bodyDefenseAt(M, 2800 + BODY_PARRY_WINDOW_MS + 50).d).toBe('blocked');
  });
  it('knows how far the body is told: a hit waits until the frames cover its impact, or DEFER_CAP_MS', () => {
    const L = new DefenseLedger();
    const f = (arrivedAt: number, lagMs: number, decidedUntil?: number) => ({ read: { t: arrivedAt - lagMs, fight: { guard: false, decidedUntil } }, arrivedAt, lagMs });
    L.frame(f(2000, 100), 2000);   // captured at page 1900: told up to 1900 − CONFIRM_MS
    expect(L.knownUntil).toBe(2000 - 100 - CONFIRM_MS);
    expect(L.ready(1800, 2000)).toBe(true);
    expect(L.ready(1850, 2000)).toBe(false);
    expect(L.ready(1850, 1850 + DEFER_CAP_MS)).toBe(true);
    // a frame without the fight's state (the body not seen) moves nothing
    L.frame(view(2100, 2200, 100), 2200);
    expect(L.knownUntil).toBe(1800);
  });
  it('…never past the fight read\'s decided horizon: a slip still being judged holds it where the head began to move (the review, 2026-09-26)', () => {
    const L = new DefenseLedger();
    L.frame({ read: { t: 1900, fight: { guard: false, decidedUntil: 1700 } }, arrivedAt: 2000, lagMs: 100 }, 2000);
    expect(L.knownUntil).toBe(1700);
    expect(L.ready(1780, 2000)).toBe(false);
    // quiet again: the margin alone
    L.frame({ read: { t: 1933, fight: { guard: false, decidedUntil: 1933 } }, arrivedAt: 2033, lagMs: 100 }, 2033);
    expect(L.knownUntil).toBe(1933 - CONFIRM_MS);
  });
  it('the margin is CONFIRM_FRAMES frames when those are longer than CONFIRM_MS (a 15 fps camera)', () => {
    const L = new DefenseLedger();
    let t = 1000;
    for (let k = 0; k < 6; k++, t += 1000 / 15) L.frame({ read: { t, fight: { guard: false, decidedUntil: t } }, arrivedAt: t + 50, lagMs: 50 }, t + 50);
    const last = t - 1000 / 15;
    expect(L.knownUntil).toBeCloseTo(last - CONFIRM_FRAMES * (1000 / 15), 6);
  });
  it('keeps what a waiting hit still needs, however long the game was paused (the review, 2026-09-26: a pause over 1.5 s pruned it)', () => {
    const L = new DefenseLedger(), D = new DeferredHits(), got: string[] = [];
    L.guard(guard(true, 1000, false)); L.guard(guard(false, 2030));
    D.push(2000, (at) => got.push(bodyDefenseAt(L, at).d));
    // START pauses the game for 2 s; the first update after it: the frame, then the flush
    const now = 2020 + 2000;
    L.frame({ read: { t: now - 100, fight: { guard: false } }, arrivedAt: now, lagMs: 100 }, now, D.oldest);
    D.flush(L, now);
    expect(got).toEqual(['blocked']);
    // without the keep, the guard would be gone
    const P = new DefenseLedger(); P.guard(guard(true, 1000, false)); P.guard(guard(false, 2030));
    P.frame({ read: { t: now - 100, fight: { guard: false } }, arrivedAt: now, lagMs: 100 }, now);
    expect(bodyDefenseAt(P, 2000).d).toBe('none');
  });
});

describe('DeferredHits', () => {
  it('runs each waiting hit once, in impact order, as the body\'s frames cover it', () => {
    const L = new DefenseLedger(), D = new DeferredHits(), ran: number[] = [];
    D.push(1000, (t) => ran.push(t)); D.push(1100, (t) => ran.push(t));
    expect(D.oldest).toBe(1000);
    expect(D.flush(L, 1050)).toBe(0);
    L.frame({ read: { t: 1200, fight: { guard: false } }, arrivedAt: 1250, lagMs: 50 }, 1250);      // told to 1250 − 50 − 100 = 1100
    expect(D.flush(L, 1250)).toBe(2);
    expect(ran).toEqual([1000, 1100]);
    expect(D.pending).toBe(0);
    expect(D.oldest).toBe(Infinity);
  });
});

describe('PadBlock (the review, 2026-09-26: a deferred hit meets the pad\'s block too)', () => {
  it('held AT the impact, and a press inside the parry window before it', () => {
    const P = new PadBlock();
    expect(P.heldAt(1000)).toBe(false);
    P.press(900);
    expect([P.held, P.heldAt(899), P.heldAt(1000)]).toEqual([true, false, true]);
    expect(P.pressWithin(1000, 160)).toBe(900);
    expect(P.pressWithin(1100, 160)).toBeNull();
    expect(P.pressWithin(850, 160)).toBeNull();          // a press after the impact is no parry of it
    P.release(1200);
    expect([P.held, P.heldAt(1100), P.heldAt(1250)]).toEqual([false, true, false]);
  });
});

describe('BodyDriveTracker (P3 Z5)', () => {
  it('the body drives while its frames track and the latest input was the body\'s', () => {
    const T = new BodyDriveTracker();
    expect(T.driven(true)).toBe(false);
    T.body(100); expect(T.driven(true)).toBe(true); expect(T.driven(false)).toBe(false);
    T.pad(200); expect(T.driven(true)).toBe(false);
    T.body(300); expect(T.driven(true)).toBe(true);
  });
});

describe('auto-spacing and the weapon plane (PLAN-P7 §4.1–4.2)', () => {
  it('a strike a little out of range closes up to BODY_LUNGE_M; far out of range, nothing', () => {
    expect(bodyLunge(1.0, 1.4)).toBe(0);
    expect(bodyLunge(2.0, 1.4)).toBeCloseTo(Math.min(BODY_LUNGE_M, 2.0 - 1.4 * 0.8), 9);
    expect(bodyLunge(1.4 + BODY_LUNGE_PAD_M + 0.01, 1.4)).toBe(0);
  });
  it('steps: in / out along the line to the rival, left / right across it', () => {
    expect([stepSpace('in'), stepSpace('out'), stepSpace('left'), stepSpace('right')]).toEqual([
      { along: STEP_SPACE_M, across: 0 }, { along: -STEP_SPACE_M, across: 0 }, { along: 0, across: SIDE_STEP_M }, { along: 0, across: -SIDE_STEP_M },
    ]);
  });
  it('the plane rule: straight → the first move, hook → the second, uppercut → the third; a kick has no weapon move', () => {
    const staff = ['poke', 'sweep', 'overhead'];
    expect((['jab', 'cross', 'hook', 'uppercut', 'front', 'round'] as const).map((b) => planeMove(staff, b))).toEqual(['poke', 'poke', 'sweep', 'overhead', null, null]);
  });
});

describe('the combat card and claims', () => {
  it('claims the fight read and P2\'s punch / kick (so the floor presses neither), and says the five verbs', () => {
    expect([...FIGHT_CLAIMS].sort()).toEqual(['blow', 'evade', 'fightStep', 'guard', 'kick', 'legKick', 'punch', 'turn']);
    expect(FIGHT_CARD_LINES.map((l) => l.move)).toEqual(['Punch', 'Kick', 'Guard up', 'Slip / duck', 'Step']);
  });
});
