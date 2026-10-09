// IMPROVE (2026-10-06): Brain Brawl's pure rules from the owner-picked pass (brainBrawlPlay.ts).
import { describe, expect, it } from 'vitest';
import {
  armCpu, BB_CPU, cpuAllowed, cpuChoice, exposeDone, extraFor, handicapLabel, HANDICAP_STEPS, HOW_TO, KIND_NAME, parseFastest,
  parseSeenKinds, recordFastest, SOLO_STRIKES, spinTurns, stepHandicap, strikeRow, tickSecond, WHEEL_CRAWL, wheelRoll,
} from './brainBrawlPlay';
import { challengeScore, solveCard, type ChallengeKind } from '../core/BrainBrawlCore';

const TAU = Math.PI * 2, PEG = TAU / 5;
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('#2 the spinner spins', () => {
  it('a tap is three turns, a full hold five, and anything else is held to that range', () => {
    expect(spinTurns(0)).toBe(3);
    expect(spinTurns(0.5)).toBe(4);
    expect(spinTurns(1)).toBe(5);
    expect(spinTurns(-2)).toBe(3);
    expect(spinTurns(9)).toBe(5);
    expect(spinTurns(Number.NaN)).toBe(3);
  });
});

describe('#12 the wheel crawls the last peg', () => {
  const from = 1.1, to = from + 4 * TAU + 2.3, fast = 1.5, total = fast + WHEEL_CRAWL.sec;
  it('starts at from, ends exactly on to, and never runs backwards', () => {
    expect(wheelRoll(0, from, to, fast)).toBe(from);
    expect(wheelRoll(total, from, to, fast)).toBe(to);
    expect(wheelRoll(total + 1, from, to, fast)).toBe(to);
    let last = from;
    for (let t = 0; t <= total; t += 0.005) { const r = wheelRoll(t, from, to, fast); expect(r).toBeGreaterThanOrEqual(last - 1e-9); last = r; }
  });
  it('spends the crawl on the last ~peg, and its speed does not jump where the fast part hands over', () => {
    const crawl = to - wheelRoll(fast, from, to, fast);
    expect(crawl).toBeCloseTo(WHEEL_CRAWL.pegs * PEG, 6);
    const h = 1e-4;
    const vIn = (wheelRoll(fast, from, to, fast) - wheelRoll(fast - h, from, to, fast)) / h;
    const vOut = (wheelRoll(fast + h, from, to, fast) - wheelRoll(fast, from, to, fast)) / h;
    expect(Math.abs(vIn - vOut)).toBeLessThan(0.05);
    // the crawl is slow: well under a peg every quarter second at its start, and it comes to rest
    expect(vOut * 0.25).toBeLessThan(PEG * 1.1);
    const vEnd = (to - wheelRoll(total - h, from, to, fast)) / h;
    expect(vEnd).toBeLessThan(0.01);
  });
  it('a spin too short for the crawl is one plain ease-out to the same stop', () => {
    expect(wheelRoll(total, 0, 0.3, fast)).toBe(0.3);
    expect(wheelRoll(total / 2, 0, 0.3, fast)).toBeGreaterThan(0.15);
  });
});

describe('#3 the CPU contestant', () => {
  it('sits in on an ordinary night, never on a compared run or a review round', () => {
    expect(cpuAllowed('')).toBe(true);
    expect(cpuAllowed(null)).toBe(true);
    expect(cpuAllowed('?players=1')).toBe(true);
    for (const q of ['?arena=abc', '?mp=1', '?c=xyz', '?round=review']) expect(cpuAllowed(q)).toBe(false);
  });
  it('commits inside QuizRound\'s window', () => {
    const lo = armCpu(10, seq(0, 0.99));
    const hi = armCpu(10, seq(0.9999, 0));
    expect(lo.at).toBeCloseTo(1.5, 6);
    expect(hi.at).toBeLessThanOrEqual(10 * (1 - BB_CPU.speed * 0.7) + 1e-3);
    expect(lo.right).toBe(false);
    expect(hi.right).toBe(true);
  });
  it('presses the answer when right, another option when wrong', () => {
    expect(cpuChoice(2, 4, true, seq(0.9))).toBe(2);
    for (const r of [0, 0.3, 0.6, 0.99]) { const c = cpuChoice(2, 4, false, seq(r)); expect(c).not.toBe(2); expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(4); }
    expect(cpuChoice(0, 1, false, seq(0.5))).toBe(0);
  });
});

describe('#4 solo strikes', () => {
  it('draws the misses and what is left', () => {
    expect(SOLO_STRIKES).toBe(3);
    expect(strikeRow(0)).toBe('···');
    expect(strikeRow(2)).toBe('✗✗·');
    expect(strikeRow(7)).toBe('✗✗✗');
  });
});

describe('#5 the last three seconds', () => {
  it('ticks 3, 2, 1 once each (reused from whoScenePlay)', () => {
    expect(tickSecond(3.01, 2.99)).toBe(3);
    expect(tickSecond(1.01, 0.99)).toBe(1);
    expect(tickSecond(4.01, 3.99)).toBeNull();
    expect(tickSecond(2.5, 2.4)).toBeNull();
  });
});

describe('#10 the duel handicap', () => {
  it('steps along the ladder and holds at the ends', () => {
    expect(stepHandicap(0, 1)).toBe(2);
    expect(stepHandicap(2, 1)).toBe(4);
    expect(stepHandicap(4, 1)).toBe(4);
    expect(stepHandicap(0, -1)).toBe(-2);
    expect(stepHandicap(-4, -1)).toBe(-4);
    expect(stepHandicap(3, 1)).toBe(2);   // off the ladder: back on it from even
    expect(HANDICAP_STEPS).toContain(0);
  });
  it('gives the seconds to one seat only', () => {
    expect([extraFor(-2, 0), extraFor(-2, 1)]).toEqual([2, 0]);
    expect([extraFor(4, 0), extraFor(4, 1)]).toEqual([0, 4]);
    expect([extraFor(0, 0), extraFor(0, 1), extraFor(4, 2)]).toEqual([0, 0, 0]);
    expect(handicapLabel(0)).toBe('HANDICAP · EVEN');
    expect(handicapLabel(-2)).toBe('HANDICAP · P1 +2 s');
  });
  it('a handicapped answer can never pay more than a perfect card (the arena ceiling holds)', () => {
    const extra = Math.max(...HANDICAP_STEPS);
    for (const tier of [1, 2, 3] as const) {
      const t = 6;
      expect(challengeScore(true, t + extra, t + extra, tier)).toBe(challengeScore(true, t, t, tier));
      expect(challengeScore(true, -1 + extra, t + extra, tier)).toBeLessThanOrEqual(100 * tier);
    }
  });
});

describe('#8 the fastest right answers', () => {
  it('records a first time silently, and names a beaten one — the category over the kind', () => {
    let r = recordFastest({}, 'COMPUTE', 'arithmetic', 3.04);
    expect(r.note).toBe('');
    expect(r.table).toEqual({ COMPUTE: 3, 'COMPUTE/arithmetic': 3 });
    r = recordFastest(r.table, 'COMPUTE', 'arithmetic', 2.12);
    expect(r.note).toBe('NEW BEST COMPUTE 2.1 s');
    r = recordFastest(r.table, 'COMPUTE', 'quantity', 2.5);   // a new kind, slower than the category's best
    expect(r.note).toBe('');
    r = recordFastest(r.table, 'COMPUTE', 'quantity', 2.4);   // beats the kind, not the category
    expect(r.note).toBe(`NEW BEST COMPUTE ${KIND_NAME.quantity} 2.4 s`);
    expect(recordFastest(r.table, 'COMPUTE', 'arithmetic', 2.1).note).toBe('');   // a tie is not a best
  });
  it('ignores a time that is not a time, and reads only a table of positive numbers', () => {
    expect(recordFastest({ A: 1 }, 'LOGIC', 'sequence', 0).table).toEqual({ A: 1 });
    expect(recordFastest({}, 'LOGIC', 'sequence', Number.NaN).note).toBe('');
    expect(parseFastest('{"LOGIC":2.5,"bad":"x","neg":-1}')).toEqual({ LOGIC: 2.5 });
    expect(parseFastest('[1,2]')).toEqual({});
    expect(parseFastest('nope')).toEqual({});
    expect(parseFastest(null)).toEqual({});
  });
});

describe('#9 the how-to cards', () => {
  const kinds: ChallengeKind[] = ['sequence', 'pattern', 'recall_grid', 'order_repeat', 'arithmetic', 'quantity', 'rotation', 'shape_match', 'count', 'odd_one_out', 'recognition'];
  it('covers every kind', () => {
    for (const k of kinds) { expect(HOW_TO[k].length).toBeGreaterThan(10); expect(KIND_NAME[k]).toBeTruthy(); }
    expect(Object.keys(HOW_TO).sort()).toEqual([...kinds].sort());
  });
  it('every worked example is right, read by the game\'s own card solver', () => {
    const ex = (k: ChallengeKind) => { const m = /\s{2}(.+) → (\S+)$/.exec(HOW_TO[k]); if (!m) throw new Error(`no example for ${k}`); return { shown: m[1], answer: m[2] }; };
    const s = ex('sequence');
    expect(solveCard({ prompt: 'What comes next?', display: [s.shown], options: [s.answer, '9', '11', '12'] })).toEqual([0]);
    const p = ex('pattern');
    expect(solveCard({ prompt: 'Which shape continues the pattern?', display: [p.shown], options: [p.answer, '▲', '■', '◆'] })).toEqual([0]);
    const a = ex('arithmetic');
    expect(solveCard({ prompt: 'Solve it', display: [a.shown], options: [a.answer, '11', '13', '2'] })).toEqual([0]);
  });
  it('reads the seen list defensively', () => {
    expect(parseSeenKinds('["count",3,"rotation"]')).toEqual(['count', 'rotation']);
    expect(parseSeenKinds('{}')).toEqual([]);
    expect(parseSeenKinds('x')).toEqual([]);
    expect(parseSeenKinds(undefined)).toEqual([]);
  });
});

describe('#11 ending the memorise', () => {
  it('one player ends it; a duel waits for both', () => {
    expect(exposeDone([true, false], 1)).toBe(true);
    expect(exposeDone([true, false], 2)).toBe(false);
    expect(exposeDone([true, true], 2)).toBe(true);
    expect(exposeDone([false, true], 2)).toBe(false);
    expect(exposeDone([], 0)).toBe(false);
  });
});
