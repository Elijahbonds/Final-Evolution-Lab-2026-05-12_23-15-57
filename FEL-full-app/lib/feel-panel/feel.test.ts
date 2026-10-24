// feel-panel lane (owner 2026-10-20). feel(id, default) returns the DEFAULT for everyone: an override applies only when this device holds
// one AND the server opened the panel for this user AND the run is an unpaid playtest with no staked / ranked / head-to-head / online /
// party session. Proved here on the store itself and on the four #375 numbers as their modules read them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEEL_STORAGE_KEY, feel, feelOverridesUsed, feelValuesJson, getFeelState, parseFeelOverrides, resetAllFeelOverrides, resetFeelForTests,
  resetFeelOverride, setFeelOverride, setFeelSession, setFeelUser, subscribeFeel,
} from './feel';
import { FEEL_KNOBS } from './knobs';
import { feelSessionBlock } from './sessionGate';
import { stepAiHand, aiHandRangeM, AI_HAND_IDLE, AI_HAND_DWELL_SEC, AI_HAND_GAP_SEC, AI_HAND_RANGE_M, type AiHandRead, type AiHandState } from '@/lib/babylon/core/AiBallHand';
import { clearOfBallWeight, HAND_CLEAR_M } from '@/lib/babylon/anim/Dribble';

// a device's localStorage, counted
class FakeStorage {
  m = new Map<string, string>(); reads = 0; writes = 0; throwOnRead = false;
  getItem(k: string) { this.reads++; if (this.throwOnRead) throw new Error('blocked'); return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.writes++; this.m.set(k, v); }
  removeItem(k: string) { this.writes++; this.m.delete(k); }
}
let ls: FakeStorage;
const g = globalThis as { window?: unknown };
const PLAYTEST = feelSessionBlock('/play/threevthree', '?playtest=1');
const OWNER = { 'hoops.aiHandRangeM': 3.1, 'hoops.aiHandDwellSec': 0.7, 'hoops.aiHandGapSec': 1.6, 'hoops.handClearM': 0.03 };

beforeEach(() => {
  resetFeelForTests();
  ls = new FakeStorage();
  g.window = { localStorage: ls };
});
afterEach(() => { resetFeelForTests(); delete g.window; });

/** The owner's device: overrides stored by an earlier visit. */
const seed = (o: Record<string, unknown> = OWNER) => ls.m.set(FEEL_STORAGE_KEY, JSON.stringify(o));

describe('feel(): the default for everyone', () => {
  it('nothing set: the default', () => {
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
  });
  it('an override stored but the server never opened the panel (any non-admin, or the flag off): the default, and storage is never read', () => {
    seed();
    setFeelSession(PLAYTEST);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
    expect(ls.reads).toBe(0);
  });
  it('admin + playtest but no override on this device: the default', () => {
    setFeelUser(true); setFeelSession(PLAYTEST);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
    expect(getFeelState().active).toBe(false);
  });
  it('admin + override, but the page has not told the gate where it is yet (UNKNOWN): the default', () => {
    seed(); setFeelUser(true);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
  });
  it('ALL THREE: the override', () => {
    seed(); setFeelUser(true); setFeelSession(PLAYTEST);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(3.1);
    expect(getFeelState().active).toBe(true);
  });
  it('a FRESH page (the module as first loaded, no reset helper): closed on every condition, even for an allowed user with an override', async () => {
    // resetFeelForTests() writes the closed state itself, so it cannot prove the module STARTS closed. A page that never mounts the
    // panel (/story/*, /arena/*, /dev/*) relies on exactly this start state.
    vi.resetModules();
    const fresh = await import('./feel');
    expect(fresh.getFeelState()).toMatchObject({ userAllowed: false, block: 'UNKNOWN', active: false });
    seed();
    fresh.setFeelUser(true);   // the server said yes, but nothing has told the gate where we are
    expect(fresh.getFeelState().block).toBe('UNKNOWN');
    for (const k of FEEL_KNOBS) expect(fresh.feel(k.id, k.def), k.id).toBe(k.def);
    expect(fresh.getFeelState().active).toBe(false);
    fresh.resetFeelForTests();
  });
  it('the panel closing (unmount: user false, session UNKNOWN) closes it again', () => {
    seed(); setFeelUser(true); setFeelSession(PLAYTEST);
    setFeelSession('UNKNOWN');
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
    setFeelSession(PLAYTEST); setFeelUser(false);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
  });
});

describe('fairness: the owner\'s overrides are IGNORED in every session that is staked, ranked, head-to-head, online, party or paid', () => {
  const sessions: Array<[string, string]> = [
    ['/play/threevthree', ''],                                // a normal run: it PAYS
    ['/play/threevthree', '?arena=m_1&playtest=1'],          // Arena duel (staked)
    ['/play/threevthree', '?mp=AB12&playtest=1'],            // async challenge
    ['/play/onevone', '?c=k9x2&playtest=1'],                 // friend challenge link
    ['/play/threepoint', '?signature=1&playtest=1'],         // Signature ladder (ranked)
    ['/play/onevone', '?story=n7&playtest=1'],               // Story node (pays)
    ['/play/threepoint', '?carnival=1&playtest=1'],          // Carnival relay
    ['/play/onevone', '?net=r1&peer=h1&party=1&playtest=1'], // party-room online start
    ['/play/onevone', '?net=r1&playtest=1'],                 // netplay
    ['/play/onevone', '?ranked=1&playtest=1'],               // ranked (reserved)
    ['/play/onevone', '?agent=1&playtest=1'],                // agent / probe
    ['/play/party', '?playtest=1'],                          // couch party room
  ];
  it.each(sessions)('%s%s: every knob reads its default', (path, search) => {
    seed(); setFeelUser(true); setFeelSession(feelSessionBlock(path, search));
    for (const k of FEEL_KNOBS) expect(feel(k.id, k.def), k.id).toBe(k.def);
    expect(getFeelState().active).toBe(false);
  });
  it('moving from a playtest run INTO an Arena duel on the same visit drops the overrides at once', () => {
    seed(); setFeelUser(true); setFeelSession(PLAYTEST);
    expect(feel('hoops.aiHandGapSec', 0.9)).toBe(1.6);
    setFeelSession(feelSessionBlock('/play/threevthree', '?arena=m_1'));
    expect(feel('hoops.aiHandGapSec', 0.9)).toBe(0.9);
  });
  it('a slider moved during an Arena duel is saved, never applied there', () => {
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', '?arena=m_1'));
    expect(setFeelOverride('hoops.aiHandRangeM', 3.5)).toBe(3.5);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
    expect(getFeelState().values).toEqual({ 'hoops.aiHandRangeM': 3.5 });
  });
});

describe('the four #375 numbers, as their modules read them', () => {
  const DT = 1 / 60;
  const R = (o: Partial<AiHandRead> = {}): AiHandRead => ({ hand: 'right', away: 'left', dribbling: true, moveActive: false, ...o });
  const firstCross = (st: AiHandState = AI_HAND_IDLE) => { for (let f = 1; f <= 600; f++) { const s = stepAiHand(st, DT, R()); st = s.state; if (s.cross) return f * DT; } return -1; };
  const gapAfterCross = () => { let st: AiHandState = { wrongSec: 0, sinceSec: 0 }; for (let f = 1; f <= 600; f++) { const s = stepAiHand(st, DT, R()); st = s.state; if (s.cross) return f * DT; } return -1; };

  it('defaults: the shipped numbers', () => {
    expect(aiHandRangeM()).toBe(AI_HAND_RANGE_M);
    expect(firstCross()).toBeCloseTo(AI_HAND_DWELL_SEC, 1);
    expect(gapAfterCross()).toBeGreaterThanOrEqual(AI_HAND_GAP_SEC - 1e-9);
    expect(gapAfterCross()).toBeLessThan(AI_HAND_GAP_SEC + 2 * DT);
    expect(clearOfBallWeight(0.87, 1.13, 0.98)).toBeCloseTo((0.98 + HAND_CLEAR_M - 0.87) / (1.13 - 0.87), 9);
  });
  it('the owner\'s playtest: each module reads the override', () => {
    seed(); setFeelUser(true); setFeelSession(PLAYTEST);
    expect(aiHandRangeM()).toBe(3.1);
    expect(firstCross()).toBeCloseTo(0.7, 1);
    expect(gapAfterCross()).toBeGreaterThanOrEqual(1.6 - 1e-9);
    expect(gapAfterCross()).toBeLessThan(1.6 + 2 * DT);
    expect(clearOfBallWeight(0.87, 1.13, 0.98)).toBeCloseTo((0.98 + 0.03 - 0.87) / (1.13 - 0.87), 9);
  });
  it('the same device in an Arena duel: the shipped numbers again', () => {
    seed(); setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', '?arena=m_1'));
    expect(aiHandRangeM()).toBe(AI_HAND_RANGE_M);
    expect(firstCross()).toBeCloseTo(AI_HAND_DWELL_SEC, 1);
    expect(clearOfBallWeight(0.87, 1.13, 0.98)).toBeCloseTo((0.98 + HAND_CLEAR_M - 0.87) / (1.13 - 0.87), 9);
  });
  it('a tuned gap above the default does not hold back the FIRST crossing (AI_HAND_IDLE has served the gap)', () => {
    seed({ 'hoops.aiHandGapSec': 2.5 }); setFeelUser(true); setFeelSession(PLAYTEST);
    expect(firstCross()).toBeCloseTo(AI_HAND_DWELL_SEC, 1);
  });
});

describe('safe bounds and storage', () => {
  it('stored junk, unknown ids and out-of-range values: dropped or clamped into the knob\'s min/max', () => {
    expect(parseFeelOverrides('not json').size).toBe(0);
    expect(parseFeelOverrides('[1,2]').size).toBe(0);
    expect(parseFeelOverrides(null).size).toBe(0);
    const m = parseFeelOverrides(JSON.stringify({ 'hoops.aiHandRangeM': 99, 'hoops.aiHandDwellSec': -5, 'hoops.aiHandGapSec': 'x', 'nope.knob': 1, 'hoops.handClearM': 0.01 }));
    expect(m.get('hoops.aiHandRangeM')).toBe(4.0);   // max
    expect(m.get('hoops.aiHandDwellSec')).toBe(0.05); // min
    expect(m.has('hoops.aiHandGapSec')).toBe(false);
    expect(m.has('nope.knob')).toBe(false);
    expect(m.has('hoops.handClearM')).toBe(false);    // equal to the default: no override
  });
  it('a blocked localStorage (private window) reads as no overrides, and nothing throws', () => {
    ls.throwOnRead = true; seed();
    setFeelUser(true); setFeelSession(PLAYTEST);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
  });
  it('no window at all (the server render): defaults, nothing throws', () => {
    delete g.window;
    setFeelUser(true); setFeelSession(PLAYTEST);
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
    expect(setFeelOverride('hoops.aiHandRangeM', 3)).toBe(3);   // held for this page
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(3);
  });
  it('setting: clamped, stepped, saved; the default value removes the override; reset one / reset all', () => {
    setFeelUser(true); setFeelSession(PLAYTEST);
    expect(setFeelOverride('hoops.aiHandRangeM', 3.333)).toBe(3.35);
    expect(setFeelOverride('hoops.aiHandDwellSec', 9)).toBe(1.5);
    expect(JSON.parse(ls.m.get(FEEL_STORAGE_KEY)!)).toEqual({ 'hoops.aiHandRangeM': 3.35, 'hoops.aiHandDwellSec': 1.5 });
    setFeelOverride('hoops.aiHandDwellSec', 0.35);
    expect(getFeelState().values).toEqual({ 'hoops.aiHandRangeM': 3.35 });
    resetFeelOverride('hoops.aiHandRangeM');
    expect(getFeelState().values).toEqual({});
    expect(ls.m.has(FEEL_STORAGE_KEY)).toBe(false);
    setFeelOverride('hoops.aiHandRangeM', 3); setFeelOverride('hoops.handClearM', 0.02);
    resetAllFeelOverrides();
    expect(getFeelState().values).toEqual({});
    expect(feel('hoops.aiHandRangeM', 2.4)).toBe(2.4);
  });
  it('a non-admin cannot set anything (the panel never opened)', () => {
    expect(setFeelOverride('hoops.aiHandRangeM', 3)).toBeNull();
    expect(ls.writes).toBe(0);
  });
  it('unknown ids and non-numbers are refused', () => {
    setFeelUser(true);
    expect(setFeelOverride('nope', 1)).toBeNull();
    expect(setFeelOverride('hoops.aiHandRangeM', Number.NaN)).toBeNull();
  });
});

describe('per frame: cheap', () => {
  it('10,000 reads with overrides active touch localStorage zero times and return the same number', () => {
    seed(); setFeelUser(true); setFeelSession(PLAYTEST);
    const before = ls.reads;
    let sum = 0;
    for (let i = 0; i < 10_000; i++) sum += feel('hoops.aiHandRangeM', 2.4) + feel('hoops.aiHandDwellSec', 0.35);
    expect(ls.reads).toBe(before);
    expect(sum).toBeCloseTo(10_000 * (3.1 + 0.7), 6);
  });
  it('storage is read ONCE, when the server opens the panel — not again on a session change', () => {
    seed(); setFeelUser(true);
    expect(ls.reads).toBe(1);
    setFeelSession(PLAYTEST); setFeelSession('NOT_PLAYTEST'); setFeelSession(PLAYTEST);
    setFeelUser(false); setFeelUser(true);
    expect(ls.reads).toBe(1);
  });
});

describe('copy values, the challenge-link latch, subscribers', () => {
  it('copy values: this device\'s overrides as JSON, id → value, in catalogue order', () => {
    setFeelUser(true);
    setFeelOverride('hoops.handClearM', 0.02); setFeelOverride('hoops.aiHandRangeM', 2.8);
    expect(JSON.parse(feelValuesJson())).toEqual({ 'hoops.aiHandRangeM': 2.8, 'hoops.handClearM': 0.02 });
    expect(Object.keys(JSON.parse(feelValuesJson()))).toEqual(['hoops.aiHandRangeM', 'hoops.handClearM']);
  });
  it('overrides applied once on this page: the challenge-link mint stays closed for the page (latched)', () => {
    expect(feelOverridesUsed()).toBe(false);
    seed(); setFeelUser(true);
    expect(feelOverridesUsed()).toBe(false);   // stored, not applied yet
    setFeelSession(PLAYTEST);
    expect(feelOverridesUsed()).toBe(true);
    setFeelSession('NOT_PLAYTEST');
    expect(feelOverridesUsed()).toBe(true);
  });
  it('subscribers hear every change; the snapshot is stable between changes', () => {
    let n = 0; const off = subscribeFeel(() => { n++; });
    const s0 = getFeelState();
    expect(getFeelState()).toBe(s0);
    setFeelUser(true); setFeelSession(PLAYTEST); setFeelOverride('hoops.aiHandRangeM', 3);
    expect(n).toBe(3);
    expect(getFeelState()).not.toBe(s0);
    off(); setFeelOverride('hoops.aiHandRangeM', 3.2);
    expect(n).toBe(3);
  });
});
