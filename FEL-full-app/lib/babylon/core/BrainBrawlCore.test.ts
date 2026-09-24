import { describe, it, expect } from 'vitest';
import { CATEGORIES, mulberry32, makeChallenge, drawChallenge, solveCard, cardFaults, challengeScore, freshClaims, spinWheel, resolveClaim, claimedBy, matchWinner, boardRows, wheelLanding, wedgeAtPin, wedgeAngle, verdicts, claimLine, type Tier } from './BrainBrawlCore';

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
  // BRAINBRAWL-MAJOR (2026-09-24): the test above only read the fraction of `turns` — it never asked where a wheel that
  // was ALREADY TURNED stops. The mode spun from the last landing, and 4 of 5 live spins showed a different wedge under
  // the pin than the category the game announced.
  it('a spin lands the NAMED wedge under the pin from wherever the wheel last stopped — every round, not just the first', () => {
    const rnd = mulberry32(11);
    let roll = 0;
    for (let round = 0; round < 60; round++) {
      const s = spinWheel(rnd, freshClaims(), round % 2);
      const to = wheelLanding(roll, s.category, s.fullTurns);
      expect(wedgeAtPin(to)).toBe(s.category);
      expect(to - roll).toBeGreaterThanOrEqual(s.fullTurns * Math.PI * 2 - 1e-9);     // forward, and at least the whole turns
      expect(to - roll).toBeLessThan((s.fullTurns + 1) * Math.PI * 2);
      roll = to;
    }
    // …and the old arithmetic (from + turns·2π) is exactly what that forbids once the wheel has moved: two wedge angles
    // summed put the pin on a wedge BORDER, 36° off the named wedge's centre
    const first = wheelLanding(0, 'LOGIC', 3);
    const old = first + (3 + (CATEGORIES.indexOf('ANALYZE') + 0.5) / 5) * Math.PI * 2;
    const off = Math.abs(((old - wedgeAngle('ANALYZE')) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    expect(off).toBeGreaterThan(0.6);
  });
  it('the wedge under the pin is read off the roll the way the wheel lays them out', () => {
    CATEGORIES.forEach((c, i) => {
      expect(wedgeAtPin(wedgeAngle(c))).toBe(c);
      expect(wedgeAtPin(wedgeAngle(c) + 0.55)).toBe(c);                                // inside the 72° wedge
      expect(wedgeAtPin(wedgeAngle(c) - 7 * Math.PI * 2)).toBe(c);                      // whole turns do not matter
      expect(wedgeAtPin(wedgeAngle(c) + (Math.PI * 2) / 5)).toBe(CATEGORIES[(i + 1) % 5]);
    });
  });
});

describe('Brain Brawl — the reveal tells the truth', () => {
  it('verdicts: a pick that is the answer, a pick that is not, no pick before the clock', () => {
    expect(verdicts([2, 0, null], 2)).toEqual(['correct', 'wrong', 'timeout']);
  });
  it('the banner tells the truth about the claim: STAYS WITH, HOLDS, TAKES … FROM, CLAIMS, UNCLAIMED', () => {
    const claims = freshClaims(); claims.MEMORY = 1;
    const duel = ['P1', 'P2'];
    const before = claims.MEMORY;
    expect(resolveClaim(claims, 'MEMORY', [0, 0])).toBe(-1);
    expect(claims.MEMORY).toBe(1);
    expect(claimLine(before, 'MEMORY', -1, duel)).toBe('MEMORY STAYS WITH P2');     // nobody won it: still P2's
    expect(claimLine(null, 'LOGIC', -1, duel)).toBe('LOGIC UNCLAIMED');
    expect(claimLine(null, 'LOGIC', 0, duel)).toBe('P1 CLAIMS LOGIC');
    expect(claimLine(0, 'LOGIC', 0, duel)).toBe('P1 HOLDS LOGIC');                 // won again by its holder
    expect(claimLine(1, 'LOGIC', 0, duel)).toBe('P1 TAKES LOGIC FROM P2');        // the steal
    expect(claimLine(null, 'LOGIC', 0, ['YOU'])).toBe('LOGIC CLAIMED');
    expect(claimLine(null, 'LOGIC', -1, ['YOU'])).toBe('LOGIC UNCLAIMED');
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

describe('Brain Brawl — a rotation says which way', () => {
  // the 90° answer and the 270° distractor are both "a 90° turn" unless the prompt names the direction
  it('90° and 270° name the direction (clockwise), and the answer IS the clockwise turn', () => {
    const rnd = mulberry32(21); const seen = new Set<string>();
    let checked = 0;
    for (let i = 0; i < 200 && checked < 12; i++) {
      const c = makeChallenge('ANALYZE', 2, rnd, seen);
      if (c.kind !== 'rotation') continue;
      const m = /turned (\d+)°/.exec(c.prompt)!;
      const deg = Number(m[1]);
      if (deg !== 180) expect(c.prompt).toContain('clockwise');
      // turn the display clockwise by hand and compare with the keyed answer
      let g = c.display.map((r) => r.split(' '));
      for (let k = 0; k < deg / 90; k++) g = g.map((_, r) => g.map((row) => row[r]).reverse());
      expect(c.options[c.answer]).toBe(g.map((r) => r.join(' ')).join(' / '));
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});

// BRAINBRAWL-RESIDUAL (2026-09-24): a card must have EXACTLY ONE right option as a player reads it. The eye's MEMORY round keyed
// one lit cell of three and offered another lit cell as a "wrong" option; an IDENTIFY count of 0 offered −2.
describe('Brain Brawl — every card has exactly one right answer', () => {
  it('the reader catches the eye\'s MEMORY card (A3, B2, C1 lit; A3 and C1 both offered)', () => {
    const card = { prompt: 'Which cell was lit? (rows A–C, columns 1–3)', display: ['· · ●', '· ● ·', '● · ·'], options: ['A3', 'A2', 'C1', 'C2'], answer: 2 };
    expect(solveCard(card)).toEqual([0, 2]);
    expect(cardFaults(card)[0]).toMatch(/^2 right options/);
  });
  it('the reader catches a negative count', () => {
    expect(cardFaults({ prompt: 'How many ★ flashed?', display: ['▲ ● ■ ◆ ✚ ◐'], options: ['-2', '1', '0', '2'], answer: 2 })).toContain('impossible option -2');
  });
  it('raw generators: 60 000 draws across every category, tier and seed, none with 0 or 2+ right options or an impossible one', () => {
    let draws = 0; const faults: string[] = [];
    const byKind = new Map<string, number>();
    for (let seed = 1; seed <= 1000; seed++) {
      const rnd = mulberry32(seed * 7919);
      for (const cat of CATEGORIES) for (const tier of [1, 2, 3] as Tier[]) for (let k = 0; k < 4; k++) {
        const c = drawChallenge(cat, tier, rnd); draws++;
        byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);
        const right = solveCard(c);
        if (right.length !== 1 || right[0] !== c.answer) faults.push(`${c.kind} ${c.prompt} [${c.display.join(' | ')}] ${c.options.join(' / ')} key ${c.options[c.answer]} → ${right.map((i) => c.options[i]).join(' / ')}`);
        for (const f of cardFaults(c)) faults.push(`${c.kind}: ${f}`);
      }
    }
    expect(draws).toBe(60000);
    expect(faults.slice(0, 5)).toEqual([]);
    // every one of the eleven kinds was actually exercised
    expect([...byKind.keys()].sort()).toEqual(['arithmetic', 'count', 'odd_one_out', 'order_repeat', 'pattern', 'quantity', 'recall_grid', 'recognition', 'rotation', 'sequence', 'shape_match']);
  });
  it('MEMORY "which cell": exactly one option is a lit cell, the other three are dark, on every seed', () => {
    let which = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const c = drawChallenge('MEMORY', ((seed % 3) + 1) as Tier, mulberry32(seed));
      if (!c.prompt.startsWith('Which cell')) continue;
      which++;
      const lit = c.display.flatMap((row, r) => row.split(' ').flatMap((t, col) => (t === '●' ? [`${'ABC'[r]}${col + 1}`] : [])));
      expect(c.options.filter((o) => lit.includes(o))).toEqual([c.options[c.answer]]);
    }
    expect(which).toBeGreaterThan(500);   // a quarter of MEMORY draws (two generators, two questions)
  });
  it('a count of 0 is offered with 0 and three positive counts — never a negative', () => {
    let zeros = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const c = drawChallenge('IDENTIFY', 1, mulberry32(seed));
      if (c.kind !== 'recognition' || c.options[c.answer] !== '0') continue;
      zeros++;
      expect(c.options.every((o) => Number(o) >= 0)).toBe(true);
    }
    expect(zeros).toBeGreaterThan(20);
  });
  it('LOGIC shows the sequence and its gap on ONE line', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const c = drawChallenge('LOGIC', 3, mulberry32(seed));
      expect(c.display).toHaveLength(1);
      expect(c.display[0].trim().endsWith('?')).toBe(true);
    }
  });
});
