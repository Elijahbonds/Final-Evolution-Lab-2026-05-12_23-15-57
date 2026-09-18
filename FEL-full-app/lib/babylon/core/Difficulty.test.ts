// A TIER HAS TO CHANGE WHAT THE OPPONENT DOES (2026-09-13).
//
// Part 1 Phase 6 asks for "three difficulty tiers that differ in behavior, not just stat multipliers", and
// that is exactly the kind of requirement a codebase satisfies on paper and fails in play — ship three
// profiles whose only real difference is a speed scalar and every box is ticked while all three opponents
// play identically.
//
// So the contract is tested structurally: `edge` is excluded, and every pair of tiers must differ on most of
// the BEHAVIOURAL fields. A future tune cannot pass by moving one number.

import { describe, it, expect } from 'vitest';
import {
  TIERS, TIER_PROFILES, DEFAULT_TIER, profileFor, tierList, behavioural,
  blunders, punishes, hasReacted, tendencyLean,
} from './Difficulty';

describe('THE TIERS DIFFER IN BEHAVIOUR, NOT IN A MULTIPLIER', () => {
  it('every pair differs on at least three behavioural fields', () => {
    const bad: string[] = [];
    for (const a of TIERS) for (const b of TIERS) {
      if (a === b) continue;
      const pa = behavioural(TIER_PROFILES[a]);
      const pb = behavioural(TIER_PROFILES[b]);
      const differing = Object.keys(pa).filter((k) => pa[k] !== pb[k]);
      if (differing.length < 3) bad.push(`${a} vs ${b}: only ${differing.length} behavioural differences`);
    }
    expect(bad).toEqual([]);
  });

  it('and `edge` alone could never satisfy that — it is excluded on purpose', () => {
    expect(Object.keys(behavioural(TIER_PROFILES.pro))).not.toContain('edge');
  });

  it('the ladder is monotonic in every behavioural field', () => {
    const [r, p, e] = [TIER_PROFILES.rookie, TIER_PROFILES.pro, TIER_PROFILES.elite];
    expect(r.reactionMs).toBeGreaterThan(p.reactionMs);       // a novice is LATE
    expect(p.reactionMs).toBeGreaterThan(e.reactionMs);
    expect(r.mistakeRate).toBeGreaterThan(p.mistakeRate);     // and beats itself
    expect(p.mistakeRate).toBeGreaterThan(e.mistakeRate);
    expect(r.punishRate).toBeLessThan(p.punishRate);          // an expert punishes everything
    expect(p.punishRate).toBeLessThan(e.punishRate);
    expect(r.adaptRate).toBeLessThan(p.adaptRate);            // and reads you
    expect(p.adaptRate).toBeLessThan(e.adaptRate);
  });

  it('A ROOKIE BEATS ITSELF OFTEN ENOUGH TO NOTICE', () => {
    // the whole reason mistakeRate exists: an easy opponent should LOSE, not be slow. Under ~15% a player
    // never sees an unforced error and reads the tier as "the same guy, nerfed".
    expect(TIER_PROFILES.rookie.mistakeRate).toBeGreaterThan(0.15);
    // and an elite almost never does — otherwise the top tier is a coin flip
    expect(TIER_PROFILES.elite.mistakeRate).toBeLessThan(0.06);
  });

  it('a rookie cannot read you at all, which is why it loses the same way twice', () => {
    expect(TIER_PROFILES.rookie.adaptRate).toBe(0);
    expect(tendencyLean(TIER_PROFILES.rookie, ['L', 'L', 'L', 'L', 'L', 'L'], 'L')).toBe(0);
  });

  it('every tier explains what the opponent is LIKE, not how hard it is', () => {
    for (const t of tierList()) {
      expect(t.sub.length).toBeGreaterThan(20);
      expect(t.sub.toLowerCase()).not.toMatch(/\b(easy|hard|difficult|normal)\b/);
    }
  });
});

describe('reading a tendency is what makes an elite feel like it is watching', () => {
  const elite = TIER_PROFILES.elite;
  const pro = TIER_PROFILES.pro;

  it('nothing to read at chance level', () => {
    expect(tendencyLean(elite, ['L', 'R', 'L', 'R', 'L', 'R'], 'L')).toBe(0);
  });

  it('a real tendency leans, and the elite leans hardest', () => {
    const h = ['L', 'L', 'L', 'L', 'R', 'L'];
    const eLean = tendencyLean(elite, h, 'L');
    const pLean = tendencyLean(pro, h, 'L');
    expect(eLean).toBeGreaterThan(0);
    expect(eLean).toBeGreaterThan(pLean);
    expect(eLean).toBeLessThanOrEqual(1);
  });

  it('too little history is not a tendency', () => {
    expect(tendencyLean(elite, ['L', 'L'], 'L')).toBe(0);
    expect(tendencyLean(elite, [], 'L')).toBe(0);
  });

  it('only recent choices count — an old habit you dropped is not read back at you', () => {
    const dropped = ['L', 'L', 'L', 'L', 'L', 'L', 'R', 'R', 'R', 'R', 'R', 'R'];
    expect(tendencyLean(elite, dropped, 'L', 6)).toBe(0);
    expect(tendencyLean(elite, dropped, 'R', 6)).toBeGreaterThan(0);
  });

  it('never returns anything a mode could multiply into nonsense', () => {
    for (const t of tierList()) {
      for (const h of [[], ['A'], ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A']]) {
        const v = tendencyLean(t, h, 'A');
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the helpers a mode actually calls', () => {
  it('blunders and punishes read the tier, and are deterministic when given a roll', () => {
    expect(blunders(TIER_PROFILES.rookie, 0.2)).toBe(true);
    expect(blunders(TIER_PROFILES.elite, 0.2)).toBe(false);
    expect(punishes(TIER_PROFILES.elite, 0.5)).toBe(true);
    expect(punishes(TIER_PROFILES.rookie, 0.5)).toBe(false);
  });

  it('reaction is a real wait, not a scale', () => {
    expect(hasReacted(TIER_PROFILES.rookie, 300)).toBe(false);
    expect(hasReacted(TIER_PROFILES.elite, 300)).toBe(true);
    expect(hasReacted(TIER_PROFILES.rookie, 500)).toBe(true);
  });

  it('an unknown tier degrades to the default rather than throwing', () => {
    expect(profileFor('nonsense' as never).id).toBe(DEFAULT_TIER);
    expect(DEFAULT_TIER).toBe('pro');   // a new player meets the middle one, not the easiest
  });
});
