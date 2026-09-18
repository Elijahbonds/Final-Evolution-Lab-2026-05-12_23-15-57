// Does an upgraded fighter fight differently, and is a combo a THING rather than a counter?
//
// Written against the owner's brief for the combat siblings: prq and upgrades, special effects, better
// movement, more fun. The cases that matter most are the ones that were previously indistinguishable —
// jab-jab-jab versus jab-kick-heavy.

import { describe, it, expect } from 'vitest';
import {
  BASELINE_RATING, BASELINE_RATINGS, ROUTES,
  ratingsFrom, hasFightMove, fightMovesFor, cancelWindowSec, startupScale, damageScale,
  routeFor, routesFor, routeHitStopMs, routeShake,
  type FightRatings, type RouteStrike,
} from './FighterStyle';

const MAX: FightRatings = { quickness: 100, force: 100 };

describe('ratings come out of the PRQ scan', () => {
  it('a default scan is the baseline in both', () => {
    const r = ratingsFrom({});
    expect(r.quickness).toBeCloseTo(BASELINE_RATING, 5);
    expect(r.force).toBeCloseTo(BASELINE_RATING, 5);
  });

  it('quickness is agility and speed; force is power and strength', () => {
    expect(ratingsFrom({ agility: 95, speed: 95 }).quickness).toBeGreaterThan(BASELINE_RATING);
    expect(ratingsFrom({ agility: 95, speed: 95 }).force).toBeCloseTo(BASELINE_RATING, 5);
    expect(ratingsFrom({ power: 95, strength: 95 }).force).toBeGreaterThan(BASELINE_RATING);
    expect(ratingsFrom({ power: 95, strength: 95 }).quickness).toBeCloseTo(BASELINE_RATING, 5);
  });

  it('never leaves 0..100 however absurd the scan', () => {
    const hi = ratingsFrom({ agility: 900, power: 900, speed: 900, strength: 900, mental: 900, flexibility: 900 });
    expect(hi.quickness).toBeLessThanOrEqual(100);
    expect(hi.force).toBeLessThanOrEqual(100);
    const lo = ratingsFrom({ agility: -900, power: -900 });
    expect(lo.quickness).toBeGreaterThanOrEqual(0);
    expect(lo.force).toBeGreaterThanOrEqual(0);
  });
});

describe('the basics are never gated — a fresh fighter is not helpless', () => {
  it('a baseline body can strike, block and parry', () => {
    for (const m of ['jab', 'kick', 'heavy', 'block', 'parry'] as const) {
      expect(hasFightMove(m, BASELINE_RATINGS)).toBe(true);
    }
  });

  it('but the trained moves are NOT available at baseline', () => {
    expect(hasFightMove('counter_throw', BASELINE_RATINGS)).toBe(false);
    expect(hasFightMove('dragon', BASELINE_RATINGS)).toBe(false);
  });

  it('a maxed body owns everything', () => {
    expect(fightMovesFor(MAX).length).toBe(8);
    expect(hasFightMove('dragon', MAX)).toBe(true);
  });

  it('upgrading the scan is what unlocks the finisher — the subscription link', () => {
    const before = ratingsFrom({ power: 50, strength: 50, mental: 50 });
    const after = ratingsFrom({ power: 95, strength: 90, mental: 85 });
    expect(hasFightMove('dragon', before)).toBe(false);
    expect(hasFightMove('dragon', after)).toBe(true);
  });

  it('the move set only ever GROWS with the rating', () => {
    let prev = 0;
    for (let v = 0; v <= 100; v += 5) {
      const n = fightMovesFor({ quickness: v, force: v }).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

describe('better movement is a real dial, not an adjective', () => {
  it('a quick body holds its cancel window open longer', () => {
    expect(cancelWindowSec({ quickness: 0, force: 50 })).toBeLessThan(cancelWindowSec(MAX));
  });

  it('a slow body cannot hold a route together; a quick one can', () => {
    // the same real gap between strikes: one fighter cancels, the other is making separate presses
    const gap = 1.2;
    expect(cancelWindowSec(MAX)).toBeGreaterThan(gap);
    expect(cancelWindowSec({ quickness: 0, force: 50 })).toBeLessThan(gap);
  });

  it('a quick body starts up sooner, but never unreactably so', () => {
    expect(startupScale(MAX)).toBeLessThan(startupScale(BASELINE_RATINGS));
    expect(startupScale(MAX)).toBeGreaterThanOrEqual(0.6);
  });

  it('damage scaling is narrow — a fight is never decided before it starts', () => {
    expect(damageScale({ quickness: 50, force: 0 })).toBeGreaterThan(0.7);
    expect(damageScale(MAX)).toBeLessThan(1.4);
  });
});

describe('a combo is a ROUTE with a name, not a counter', () => {
  const seq = (...s: RouteStrike[]) => s;

  it('jab-jab-jab is NOT a route; jab-jab-kick is the TRIPLE', () => {
    // these two used to be worth exactly the same, because only the count was read
    expect(routeFor(seq('jab', 'jab', 'jab'), MAX)).toBeNull();
    expect(routeFor(seq('jab', 'jab', 'kick'), MAX)?.id).toBe('triple');
  });

  it('a route completes on the TAIL, so it works inside a real exchange', () => {
    expect(routeFor(seq('kick', 'heavy', 'jab', 'jab', 'kick'), MAX)?.id).toBe('triple');
  });

  it('a LONGER route wins over the shorter one that is its own suffix', () => {
    // jab-kick-heavy (BREAKER) ends with kick-heavy (SWEEP); the longer one must win or it never fires
    expect(routeFor(seq('jab', 'kick', 'heavy'), MAX)?.id).toBe('breaker');
  });

  it('the heavy routes are EARNED — a baseline fighter cannot run them', () => {
    expect(routeFor(seq('kick', 'kick', 'heavy'), BASELINE_RATINGS)).toBeNull();
    expect(routeFor(seq('kick', 'kick', 'heavy'), MAX)?.id).toBe('storm');
  });

  it('but a baseline fighter still owns real routes — it is not an empty list', () => {
    const owned = routesFor(BASELINE_RATINGS);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.map((r) => r.id)).toContain('triple');
  });

  it('a longer or earned route pays off harder than a cheap one', () => {
    const triple = ROUTES.find((r) => r.id === 'triple')!;
    const storm = ROUTES.find((r) => r.id === 'storm')!;
    expect(storm.payoff).toBeGreaterThan(triple.payoff);
    expect(storm.fx).toBeGreaterThanOrEqual(triple.fx);
  });

  it('every route has a label, a payoff above 1, and an ender', () => {
    for (const r of ROUTES) {
      expect(r.label).toMatch(/^[A-Z]+$/);
      expect(r.payoff).toBeGreaterThan(1);
      expect(['stun', 'knockdown', 'launch']).toContain(r.ender);
    }
  });

  it('no two routes share a sequence — one input pattern, one outcome', () => {
    const keys = ROUTES.map((r) => r.steps.join('>'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('an empty or short sequence is simply not a route', () => {
    expect(routeFor([], MAX)).toBeNull();
    expect(routeFor(seq('jab'), MAX)).toBeNull();
  });
});

describe('special effects scale with what just happened', () => {
  it('a bigger route holds the frame longer and shakes harder', () => {
    expect(routeHitStopMs(3)).toBeGreaterThan(routeHitStopMs(2));
    expect(routeHitStopMs(2)).toBeGreaterThan(routeHitStopMs(1));
    expect(routeShake(3).amp).toBeGreaterThan(routeShake(1).amp);
  });

  it('even the loudest hit-stop stays short enough not to feel like a freeze', () => {
    expect(routeHitStopMs(3)).toBeLessThanOrEqual(140);
  });
});
