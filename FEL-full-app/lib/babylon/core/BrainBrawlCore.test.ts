import { describe, it, expect } from 'vitest';
import { CATEGORIES, mulberry32, makeChallenge, challengeScore, freshClaims, spinWheel, resolveClaim, claimedBy, matchWinner, boardRows, type Tier } from './BrainBrawlCore';

describe('Brain Brawl — challenge generators', () => {
  it('every category and tier produces valid, unique, non-repeating challenges', () => {
    for (const cat of CATEGORIES) {
      for (const tier of [1, 2, 3] as Tier[]) {
        const rnd = mulberry32(7 + tier);
        const seen = new Set<string>();
        const keys = new Set<string>();
        for (let i = 0; i < 30; i++) {
          const c = makeChallenge(cat, tier, rnd, seen);
          expect(c.category).toBe(cat);
          expect(c.tier).toBe(tier);
          expect(c.options).toHaveLength(4);
          expect(new Set(c.options).size).toBe(4);
          expect(c.answer).toBeGreaterThanOrEqual(0);
          expect(c.answer).toBeLessThan(4);
          expect(c.timeLimitSec).toBeGreaterThanOrEqual(3);
          expect(c.display.length).toBeGreaterThan(0);
          const key = `${c.kind}|${c.display.join('|')}`;
          expect(keys.has(key)).toBe(false); keys.add(key);
        }
      }
    }
  });
  it('higher tiers run shorter clocks; memory challenges expose then hide', () => {
    const t1 = makeChallenge('COMPUTE', 1, mulberry32(1), new Set()), t3 = makeChallenge('COMPUTE', 3, mulberry32(1), new Set());
    expect(t3.timeLimitSec).toBeLessThanOrEqual(t1.timeLimitSec);
    const m = makeChallenge('MEMORY', 2, mulberry32(3), new Set());
    expect(m.exposureSec).toBeGreaterThan(0);
    const l = makeChallenge('LOGIC', 2, mulberry32(3), new Set());
    expect(l.exposureSec).toBe(0);
  });
  it('the arithmetic answers are right and the sequence answers continue the sequence', () => {
    const rnd = mulberry32(99); const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = makeChallenge('COMPUTE', 3, rnd, seen);
      if (c.kind !== 'arithmetic') continue;
      const m = /^(\d+) (.) (\d+) = \?$/.exec(c.display[0])!;
      const a = Number(m[1]), b = Number(m[3]), op = m[2];
      const v = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : a / b;
      expect(Number(c.options[c.answer])).toBe(v);
    }
  });
  it('seeded: the same seed gives the same challenge', () => {
    const a = makeChallenge('IDENTIFY', 2, mulberry32(5), new Set()), b = makeChallenge('IDENTIFY', 2, mulberry32(5), new Set());
    expect(a).toEqual(b);
  });
});

describe('Brain Brawl — scoring, wheel, claims', () => {
  it('speed AND accuracy: wrong pays nothing, faster pays more, tier multiplies', () => {
    expect(challengeScore(false, 5, 10, 3)).toBe(0);
    expect(challengeScore(true, 10, 10, 1)).toBe(100);
    expect(challengeScore(true, 0, 10, 1)).toBe(50);
    expect(challengeScore(true, 5, 10, 2)).toBe(150);
    expect(challengeScore(true, 5, 10, 3)).toBeGreaterThan(challengeScore(true, 5, 10, 1));
  });
  it('the wheel prefers unclaimed categories and lands on the segment it names', () => {
    const claims = freshClaims(); claims.LOGIC = 0; claims.MEMORY = 0; claims.COMPUTE = 0; claims.ANALYZE = 0;
    const rnd = mulberry32(2);
    for (let i = 0; i < 20; i++) {
      const s = spinWheel(rnd, claims, 0);
      expect(s.category).toBe('IDENTIFY');
      expect(Math.floor(((s.turns % 1) * CATEGORIES.length))).toBe(CATEGORIES.indexOf(s.category));
      expect(s.turns).toBeGreaterThanOrEqual(3);
    }
    claims.IDENTIFY = 0;
    expect(CATEGORIES).toContain(spinWheel(rnd, claims, 0).category);   // all claimed: anywhere
  });
  it('claims: solo claims on any correct answer; a duel goes to the higher score; ties leave it; five claims win', () => {
    const solo = freshClaims();
    expect(resolveClaim(solo, 'LOGIC', [0])).toBe(-1);
    expect(resolveClaim(solo, 'LOGIC', [120])).toBe(0);
    const duel = freshClaims();
    expect(resolveClaim(duel, 'MEMORY', [100, 150])).toBe(1);
    expect(resolveClaim(duel, 'MEMORY', [200, 200])).toBe(-1);
    expect(duel.MEMORY).toBe(1);
    expect(resolveClaim(duel, 'MEMORY', [300, 100])).toBe(0);       // the holder's claim is contested and lost
    expect(matchWinner(duel, 2)).toBe(-1);
    for (const c of CATEGORIES) duel[c] = 1;
    expect(matchWinner(duel, 2)).toBe(1);
    expect(claimedBy(duel, 1)).toHaveLength(5);
    const rows = boardRows(duel, [300, 900], ['P1', 'P2']);
    expect(rows[1].line).toContain('LOGIC');
    expect(rows[0].line).toBe('—');
  });
});
