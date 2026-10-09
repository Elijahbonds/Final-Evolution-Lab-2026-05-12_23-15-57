// ITEM WEIGHTING BY PLACE (racing 10-phase, decode gap 12: "items are not weighted by place"). The draw moved
// from the balloon's fixed grid colour to a weighted draw at collection — the leader meets defence, the back
// of the field meets offence. These pin the rubber-band so a future pass cannot flatten it back to a uniform
// table without a failing test, and so the weight table itself stays findable.
import { describe, expect, it } from 'vitest';
import { ITEM_KINDS, weightedItemKind, type ItemKind } from './AeroItems';

/** Draw `n` times at a place and count the kinds. */
function draw(place: number, field: number, n = 4000, seed = 1): Record<ItemKind, number> {
  // a tiny deterministic rng so the test is stable across machines and vitest runs
  let a = seed >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Record<ItemKind, number> = { missile: 0, boost: 0, shield: 0, mine: 0 };
  for (let i = 0; i < n; i++) out[weightedItemKind(place, field, rng)]++;
  return out;
}

describe('weightedItemKind — items weighted by place (gap 12)', () => {
  it('the leader draws defence-heavy (shield + mine over missile)', () => {
    const c = draw(1, 8);
    expect(c.shield + c.mine).toBeGreaterThan(c.missile * 3);   // leader table 5+4 vs 1
  });

  it('the backmarker draws offence-heavy (missile + boost over shield)', () => {
    const c = draw(8, 8);
    expect(c.missile + c.boost).toBeGreaterThan(c.shield * 4);  // trailer table 6+5 vs 1
  });

  it('mid-field sits between the two tables (the rubber band actually ramps, not two cliffs)', () => {
    const lead = draw(1, 8), mid = draw(4, 8), back = draw(8, 8);
    expect(mid.missile).toBeGreaterThan(lead.missile);
    expect(mid.missile).toBeLessThan(back.missile);
  });

  it('a one-racer field reports the mid table (solo play is a fair draw, unchanged behaviour)', () => {
    const c = draw(1, 1);                                       // p = 0.5
    const total = c.missile + c.boost + c.shield + c.mine;
    expect(total).toBe(4000);
    // every kind reachable, none starved out
    for (const k of ITEM_KINDS) expect(c[k]).toBeGreaterThan(0);
  });

  it('never returns outside the four kinds, and honours the rng edge', () => {
    expect(ITEM_KINDS).toContain(weightedItemKind(1, 8, () => 0));        // first slice
    expect(ITEM_KINDS).toContain(weightedItemKind(8, 8, () => 0.9999));   // last slice
  });
});
