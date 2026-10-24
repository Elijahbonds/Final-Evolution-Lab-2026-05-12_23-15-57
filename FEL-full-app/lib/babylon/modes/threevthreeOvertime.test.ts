// NB-3, rebuilt (lane/hoops-overtime): the 3v3's overtime rule (threevthreeOvertime), its clock knob, and what an overtime game
// posts — held against the ceilings the Arena and /api/sessions already enforce for 'threevthree' / 'hoops3v3'.
import { afterEach, describe, expect, it } from 'vitest';
import {
  hornCall, overtimeHeadline, overtimeScoreMax, overtimeSec, periodLabel, OVERTIME_3V3_SEC, OVERTIME_BANNER, type HornCall, type HornFrame,
} from './threevthreeOvertime';
import { MIRRORED, SCORE_CEILINGS, checkStakeScore } from '@/lib/arena-score-integrity';
import { judgeHeadToHead, sessionScoreCap } from '@/lib/session-payout';
import { checkUnruledScore } from '@/lib/sessions/modeScoreRules';
import { proofLineFor } from '@/lib/proofLine';
import { scoreFigures } from '@/components/games/end-screen/end-screen';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';

const frame = (o: Partial<HornFrame>): HornFrame => ({ buzzer: false, overtime: false, live: false, my: 0, foe: 0, ...o });

/** The mode's buzzer site, frame by frame, as ThreeVThreeMode runs it: the clock, the horn, hornCall, startOvertime, the end. */
function play(script: Array<{ at: number; my?: number; foe?: number; live?: boolean }>, regulation = 90, ot = OVERTIME_3V3_SEC) {
  const dt = 0.1;
  let t = 0, timeLeft = regulation, buzzer = false, overtimes = 0, my = 0, foe = 0, live = false, ended = false;
  const ends: HornCall[] = [], log: string[] = [];
  const steps = [...script];
  for (let i = 0; i < 20_000 && !ended; i++) {
    t = Math.round((t + dt) * 10) / 10;
    while (steps.length && steps[0].at <= t) { const s = steps.shift()!; my = s.my ?? my; foe = s.foe ?? foe; live = s.live ?? live; }
    if (timeLeft > 0) timeLeft -= dt; else if (!buzzer) buzzer = true;
    const horn = hornCall({ buzzer, overtime: overtimes > 0, live, my, foe });
    if (horn === 'overtime') { overtimes++; buzzer = false; timeLeft = ot; log.push(`${periodLabel(overtimes)} at ${my}–${foe}`); }
    else if (horn !== 'play') { ended = true; ends.push(horn); log.push(`${horn} ${my}–${foe} at ${t.toFixed(1)}`); }
  }
  return { ends, log, overtimes, my, foe };
}

describe('NB-3: a tie at the buzzer goes to overtime', () => {
  it('level at the horn with nothing in the air is OVERTIME, never a result (no DRAW exists any more)', () => {
    expect(hornCall(frame({ buzzer: true, my: 10, foe: 10 }))).toBe('overtime');
    expect(hornCall(frame({ buzzer: true, my: 0, foe: 0 }))).toBe('overtime');
    for (let s = 0; s <= 20; s++) expect(hornCall(frame({ buzzer: true, my: s, foe: s }))).not.toMatch(/WIN|LOSS|DRAW/);
  });
  it('a ball still in the air at the horn is waited out — it can break the tie (a buzzer-beater) or leave it level', () => {
    expect(hornCall(frame({ buzzer: true, live: true, my: 10, foe: 10 }))).toBe('play');
    expect(play([{ at: 89.5, live: true }, { at: 91, my: 12, live: false }]).ends).toEqual(['WIN']);
    const missed = play([{ at: 0.5, my: 10, foe: 10 }, { at: 89.5, live: true }, { at: 91, live: false }, { at: 95, foe: 12 }]);
    expect(missed.log[0]).toBe('OT at 10–10');
    expect(missed.ends).toEqual(['LOSS']);
  });
  it('ahead or behind at the horn is a WIN or a LOSS, as before', () => {
    expect(hornCall(frame({ buzzer: true, my: 12, foe: 10 }))).toBe('WIN');
    expect(hornCall(frame({ buzzer: true, my: 9, foe: 10 }))).toBe('LOSS');
    expect(hornCall(frame({ my: 12, foe: 10 }))).toBe('play');   // the clock still running: nothing decided
  });
  it('ROOKIE-r1, 10–10 at 90 s: overtime starts on the horn with the fresh 30 s clock', () => {
    const r = play([{ at: 1, my: 10, foe: 10 }, { at: 100, my: 12 }]);
    expect(r.log).toEqual(['OT at 10–10', 'WIN 12–10 at 100.0']);
    expect(r.overtimes).toBe(1);
  });
});

describe('NB-3: in overtime the first score wins', () => {
  it('the first bucket either way ends it at once, once nothing is in the air', () => {
    expect(hornCall(frame({ overtime: true, my: 12, foe: 10 }))).toBe('WIN');
    expect(hornCall(frame({ overtime: true, my: 10, foe: 13 }))).toBe('LOSS');
    expect(hornCall(frame({ overtime: true, live: true, my: 12, foe: 10 }))).toBe('play');   // the make's ball is still dropping
    expect(hornCall(frame({ overtime: true, my: 10, foe: 10 }))).toBe('play');               // level, clock running: play on
  });
  it('ONE ending per game: the game ends on the overtime bucket and nothing after it posts', () => {
    const r = play([{ at: 1, my: 10, foe: 10 }, { at: 92, foe: 12 }, { at: 93, my: 13 }]);
    expect(r.ends).toEqual(['LOSS']);
    expect([r.my, r.foe]).toEqual([10, 12]);
  });
  it('level when the overtime clock runs out is another overtime (OT2), and its first bucket ends it', () => {
    const r = play([{ at: 1, my: 7, foe: 7 }, { at: 150, my: 10 }]);
    expect(r.log).toEqual(['OT at 7–7', 'OT2 at 7–7', 'WIN 10–7 at 150.0']);
  });
  it('the banner says the rule', () => {
    expect(OVERTIME_BANNER).toBe('OVERTIME — NEXT BUCKET WINS');
  });
});

describe('NB-3: the result reported to /api/sessions and the Arena stays valid', () => {
  const T = MIRRORED.threevthreeTarget, B = MIRRORED.bucketMax;
  it('an overtime game posts at most 20 + 3 — exactly the ceiling both already hold, so none can trip it', () => {
    expect(overtimeScoreMax(T, B)).toBe(23);
    expect(overtimeScoreMax(T, B)).toBe(SCORE_CEILINGS.hoops3v3.max);
    expect(sessionScoreCap('hoops3v3', null, 120, { killSwitch: false })).toBe(23);
    expect(checkStakeScore({ mode: 'threevthree', score: 23, killSwitch: false })).toMatchObject({ ok: true });
    expect(checkStakeScore({ mode: 'threevthree', score: 24, killSwitch: false })).toMatchObject({ ok: false, code: 'SCORE_ABOVE_CEILING' });
    expect(checkUnruledScore(23)).toMatchObject({ ok: true, score: 23 });
  });
  it('the worst case is 20–20 at the horn and a three in overtime: the posted pair is one the server judges a win', () => {
    for (let tie = 0; tie < T; tie++) {
      for (const bucket of [2, B]) {
        expect(tie + bucket).toBeLessThanOrEqual(SCORE_CEILINGS.hoops3v3.max);
        expect(judgeHeadToHead('hoops3v3', tie + bucket, tie)).toBe(true);    // the winner's post
        expect(judgeHeadToHead('hoops3v3', tie, tie + bucket)).toBe(false);   // the loser's
      }
    }
  });
});

describe('NB-3: the end card shows the real score', () => {
  const run = { score: 13, opponentScore: 11, won: true, outcome: 'WIN', stats: { foeScore: 11, assists: 2, overtimes: 1 } };
  it('the card\'s figures are the board\'s pair, and the headline and proof line say overtime', () => {
    expect(scoreFigures({ run } as never)).toEqual({ mine: 13, vs: 11, vsLabel: null });
    expect(overtimeHeadline(true, 1)).toBe('WON IN OT');
    expect(overtimeHeadline(false, 2)).toBe('LOST IN OT2');
    expect(overtimeHeadline(true, 0)).toBeNull();   // a regulation game keeps the host's own words
    expect(proofLineFor('hoops3v3', run)).toBe('13–11 · WON · OT');
    expect(proofLineFor('hoops3v3', { ...run, score: 10, opponentScore: 12, won: false, stats: { foeScore: 12, assists: 0, overtimes: 2 } })).toBe('10–12 · LOST · OT2');
    expect(proofLineFor('hoops3v3', { score: 14, opponentScore: 21, won: false, stats: { foeScore: 21, assists: 0 } })).toBe('14–21 · LOST');   // unchanged
  });
  it('the period names', () => {
    expect([0, 1, 2, 3].map(periodLabel)).toEqual(['', 'OT', 'OT2', 'OT3']);
  });
});

describe('NB-3: the overtime clock is a feel knob (new), and only a playtest run moves it', () => {
  const g = globalThis as { window?: unknown };
  const open = (o: Record<string, number>, search: string) => {
    resetFeelForTests();
    const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(o)]]);
    g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', search));
  };
  afterEach(() => { resetFeelForTests(); delete g.window; });
  it('closed: the shipped 30 s', () => {
    expect(OVERTIME_3V3_SEC).toBe(30);
    expect(overtimeSec()).toBe(30);
  });
  it('a playtest run reads the override; a staked (arena) run ignores it', () => {
    open({ 'hoops.overtime3v3Sec': 45 }, '?playtest=1');
    expect(overtimeSec()).toBe(45);
    open({ 'hoops.overtime3v3Sec': 45 }, '?playtest=1&arena=m1');
    expect(overtimeSec()).toBe(30);
  });
});
