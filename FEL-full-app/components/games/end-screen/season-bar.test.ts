// END SCREEN — the season bar's LEVEL UP maths, checked against the server's own engine: SeasonPassCore tiers a real
// state, the session answer is built the way app/api/sessions builds it (gained, tier, into, need, tierUps), and the card
// must rebuild exactly where the run started.
import { describe, it, expect } from 'vitest';
import { SeasonPassCore, TIER_XP } from '@/lib/season/season-pass-core';
import { seasonFill, pct, tierRewardWords } from './season-bar';

/** The session answer's season block for a run that adds `gained` to a pass at (tier, xp). */
function answer(tier: number, xp: number, gained: number) {
  const core = new SeasonPassCore({ state: { tier, xp } });
  const r = core.addXp(gained);
  return { name: 'Season 1', gained, tier: r.tier, into: r.into, need: r.need, hasPro: false, tierUps: r.events.map((e) => ({ tier: e.tier, rewards: e.rewards })) };
}

describe('rebuilding where the run started', () => {
  it('no tier crossed: one segment from (into − gained) to into', () => {
    const a = answer(3, 100, 200);
    const f = seasonFill(a);
    expect(f.exact).toBe(true);
    expect(f).toMatchObject({ tierBefore: 3, intoBefore: 100, tierUps: 0 });
    expect(f.segments).toEqual([{ tier: 3, from: 100, to: 300, need: TIER_XP(3), crossed: false }]);
  });

  it('one tier crossed: fill to the end of the old tier, TIER UP, then 0 → into', () => {
    const a = answer(0, 400, 200);   // TIER_XP(0) = 450: 600 → tier 1 with 150 in
    expect(a.tierUps).toHaveLength(1);
    const f = seasonFill(a);
    expect(f).toMatchObject({ exact: true, tierBefore: 0, intoBefore: 400, tierUps: 1 });
    expect(f.segments).toEqual([
      { tier: 0, from: 400, to: TIER_XP(0), need: TIER_XP(0), crossed: true },
      { tier: 1, from: 0, to: 150, need: TIER_XP(1), crossed: false },
    ]);
  });

  it('several tiers in one run: every whole tier fills, every crossing is marked', () => {
    const a = answer(2, 300, TIER_XP(2) + TIER_XP(3) + 50);
    const f = seasonFill(a);
    expect(f.tierUps).toBe(2);
    expect(f.intoBefore).toBe(300);
    expect(f.segments.map((s) => [s.tier, s.from, s.to, s.crossed])).toEqual([
      [2, 300, TIER_XP(2), true], [3, 0, TIER_XP(3), true], [4, 0, a.into, false],
    ]);
  });

  it('every reachable start rebuilds exactly (sweep against the engine)', () => {
    for (const tier of [0, 1, 7, 20, 48]) {
      for (const xp of [0, 1, 200, TIER_XP(tier) - 1]) {
        for (const gained of [80, 455, 1200, 3000]) {
          const f = seasonFill(answer(tier, xp, gained));
          expect(f.exact, `${tier}/${xp}/${gained}`).toBe(true);
          expect([f.tierBefore, f.intoBefore], `${tier}/${xp}/${gained}`).toEqual([tier, xp]);
        }
      }
    }
  });

  it('numbers that do not add up get one honest segment and no invented crossing', () => {
    const f = seasonFill({ gained: 5000, tier: 1, into: 10, need: TIER_XP(1), tierUps: [] });
    expect(f.exact).toBe(false);
    expect(f.segments).toEqual([{ tier: 1, from: 0, to: 10, need: TIER_XP(1), crossed: false }]);
    expect(f.segments.some((s) => s.crossed)).toBe(false);
  });
});

describe('what a tier paid, in words', () => {
  it('reads only the rewards the server booked', () => {
    expect(tierRewardWords({ tier: 5, rewards: { free: [{ kind: 'lc', amt: 50 }], pro: [] } })).toEqual(['+50 LC']);
    expect(tierRewardWords({ tier: 3, rewards: { free: [{ kind: 'cosmetic', rarity: 'common' }] } })).toEqual(['Common cosmetic']);
    expect(tierRewardWords({ tier: 4, rewards: { free: [], pro: [] } })).toEqual([]);
    expect(tierRewardWords({ tier: 4 })).toEqual([]);
  });

  it('pct clamps', () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(500, 100)).toBe(100);
    expect(pct(5, 0)).toBe(0);
  });
});
