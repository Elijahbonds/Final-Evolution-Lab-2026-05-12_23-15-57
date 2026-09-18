// The card has to SEPARATE dunks (dunk 10-phase pass P3, 2026-09-16).
//
// The rc22 baseline, measured with scripts/probes/_dunk-lab.mts: every attempt scored DIFF 10.0 — the cap — so a
// WINDMILL and a BETWEEN THE LEGS off a self-lob were the same dunk to the panel, and the whole range of slam timing
// was worth five points of fifty. These tests are the balance argument, in numbers.
import { describe, expect, it } from 'vitest';
import { dunkCard, slamIsClean, RIM_CLEAN, type DunkAttemptFacts } from './DunkCard';
import { judgeDunk } from './JudgePanel';

const base: DunkAttemptFacts = {
  trickDifficulty: 0, runwayDifficulty: 0, propBonus: 0, charge: 1, launchSpeed01: 1,
  styleTier: 3, styleTaps: 0, hype: 0, hang: false, repeat: false, execution01: 1,
};
const card = (f: Partial<DunkAttemptFacts>) => dunkCard({ ...base, ...f });
const total = (f: Partial<DunkAttemptFacts>) => {
  const c = card(f);
  return judgeDunk(c.difficulty, c.execution, c.style, 0.5).reduce((a, j) => a + j.score, 0);
};

describe('the difficulty number', () => {
  it('is the VOCABULARY, not the run-up: a full-speed plain dunk is barely difficult', () => {
    expect(card({}).difficulty).toBeLessThan(2.5);
  });

  it('separates the named dunks — the thing the rc22 cap hid', () => {
    const windmill = card({ trickDifficulty: 2.4 }).difficulty;
    const betweenLegs = card({ trickDifficulty: 3.8 }).difficulty;
    expect(betweenLegs - windmill).toBeGreaterThan(1.5);
    expect(windmill).toBeLessThan(betweenLegs);
    expect(betweenLegs).toBeLessThan(10);            // there is still room above the hardest single trick
  });

  it('stacking is what reaches the ceiling: a hard trick off a runway trick over a prop', () => {
    const stacked = card({ trickDifficulty: 3.8, runwayDifficulty: 2.2, propBonus: 2.5 }).difficulty;
    expect(stacked).toBeGreaterThan(9);
    expect(card({ trickDifficulty: 3.8 }).difficulty).toBeLessThan(stacked - 3);
  });

  it('a dunk the judges have already seen is worth less', () => {
    expect(card({ trickDifficulty: 3, repeat: true }).difficulty).toBeLessThan(card({ trickDifficulty: 3 }).difficulty);
  });
});

describe('the style number', () => {
  it('is where the called tier lives — signature reads louder than power', () => {
    expect(card({ styleTier: 8 }).style).toBeGreaterThan(card({ styleTier: 3 }).style + 3);
  });
  it('the room and the rim hang are part of how it read', () => {
    expect(card({ hype: 100, hang: true }).style).toBeGreaterThan(card({}).style + 2.5);
  });
});

describe('a chain', () => {
  it('is worth something even when difficulty has already saturated', () => {
    const maxed = { trickDifficulty: 3.8, runwayDifficulty: 2.2, propBonus: 2.5, styleTier: 5.5 };
    expect(card({ ...maxed }).difficulty).toBe(10);
    expect(card({ ...maxed, chainTricks: 1 }).difficulty).toBe(10);          // the cap eats it here…
    expect(card({ ...maxed, chainTricks: 1 }).style).toBeGreaterThan(card(maxed).style + 1);   // …so it lands here
  });
  it('does not become a second scoring system: two extra tricks is the most it pays', () => {
    expect(card({ chainTricks: 5 }).style - card({}).style).toBeCloseTo(2.4, 2);
  });
});

describe('what the panel does with them', () => {
  it('a plain dunk, perfectly finished, is a solid card — not a great one', () => {
    const t = total({});
    expect(t).toBeGreaterThan(33);
    expect(t).toBeLessThan(42);
  });

  it('a hard dunk landed perfectly reaches the top of the card', () => {
    const t = total({ trickDifficulty: 3.8, runwayDifficulty: 1.6, styleTier: 5.5, hype: 60 });
    expect(t).toBeGreaterThan(44);
  });

  it('TIMING IS WORTH MORE THAN A ROUNDING ERROR, across the whole vocabulary', () => {
    // rc22: the entire range of slam timing was worth 5 points of 50, once, for every dunk in the game. The panel
    // scores in whole numbers, so a single scenario can still land on a rounding boundary — the property that matters
    // is that it holds across the vocabulary.
    const deltas = [0, 2.0, 2.4, 2.8, 3.4, 3.8].map((trickDifficulty) => {
      const dunk = { trickDifficulty, styleTier: 5.5, hype: 50 };
      return total({ ...dunk, execution01: 1 }) - total({ ...dunk, execution01: 0.4 });
    });
    const mean = deltas.reduce((a, d) => a + d, 0) / deltas.length;
    expect(mean).toBeGreaterThanOrEqual(6);
    expect(Math.min(...deltas)).toBeGreaterThanOrEqual(5);
  });

  it('WHAT YOU CALL is worth as much as how you land it', () => {
    const plain = total({ trickDifficulty: 0, styleTier: 5.5, hype: 50 });
    const stacked = total({ trickDifficulty: 3.8, runwayDifficulty: 2.2, propBonus: 2.5, styleTier: 5.5, hype: 50 });
    expect(stacked - plain).toBeGreaterThanOrEqual(6);   // rc22: zero — difficulty was pinned at the cap for both
  });

  it('fifty is still reachable — the ceiling must not be decorative', () => {
    expect(total({ trickDifficulty: 3.8, runwayDifficulty: 2.8, propBonus: 2.5, styleTier: 8, hype: 100, hang: true, styleTaps: 2 })).toBe(50);
  });
});

describe('the rim is honest', () => {
  it('a jam thrown at the iron before you get there hits iron', () => {
    expect(slamIsClean(RIM_CLEAN - 0.01)).toBe(false);
    expect(slamIsClean(0.05)).toBe(false);
  });
  it('but everything from a scruffy press upward goes in', () => {
    expect(slamIsClean(RIM_CLEAN)).toBe(true);
    expect(slamIsClean(0.45)).toBe(true);
    expect(slamIsClean(1)).toBe(true);
  });
});
