// BOARD-10PHASE P5 — the invariant the trick tables exist to satisfy.
//
// `fitsAir` is only a mechanic if the pop cannot finish everything. Phase 1 measured skate at 55% (longest trick
// 0.72 s against 1.31 s of hang), which made a 15-trick table into a list with no choosing in it. These tests are
// the guard, expressed as the hang each mode's own pop actually produces rather than as magic numbers.

import { describe, expect, it } from 'vitest';
import { SKATE_TRICKS, SNOW_TRICKS, SURF_TRICKS, fitsAir, type BoardTrick } from './BoardTricks';

/** GroundRide: gravity −14 m/s², jump(p) → vel.y = 5 + 5.5p. Hang is 2v/g. */
const hang = (power: number): number => (2 * (5 + 5.5 * power)) / 14;

/** SkateRunMode's olliePower(): 0.27 + charge·0.49. */
const SKATE = { floor: hang(0.27), half: hang(0.515), full: hang(0.76) };
/** SnowboardSlalomMode: jump(0.5 + tuck·0.5). */
const SNOW = { floor: hang(0.5), half: hang(0.75), full: hang(1.0) };

const airs = (t: readonly BoardTrick[]): BoardTrick[] => t.filter((x) => x.airSec > 0);
const fitCount = (t: readonly BoardTrick[], sec: number): number =>
  airs(t).filter((x) => fitsAir(x, sec)).length;

describe('the pop gates the table', () => {
  it('skate: the hang numbers are what the mode actually produces', () => {
    expect(SKATE.floor).toBeCloseTo(0.93, 2);
    expect(SKATE.full).toBeCloseTo(1.31, 2);
  });

  it('skate: flat ground cannot throw everything', () => {
    const all = airs(SKATE_TRICKS).length;
    expect(fitCount(SKATE_TRICKS, SKATE.floor)).toBeLessThan(all);
    // and it must still be able to skate — a floor that throws nothing is worse than one that throws all
    expect(fitCount(SKATE_TRICKS, SKATE.floor)).toBeGreaterThanOrEqual(Math.ceil(all * 0.5));
  });

  it('skate: charge is what buys the big tricks', () => {
    expect(fitCount(SKATE_TRICKS, SKATE.half)).toBeGreaterThan(fitCount(SKATE_TRICKS, SKATE.floor));
    expect(fitCount(SKATE_TRICKS, SKATE.full)).toBeGreaterThan(fitCount(SKATE_TRICKS, SKATE.half));
    expect(fitCount(SKATE_TRICKS, SKATE.full)).toBe(airs(SKATE_TRICKS).length);
  });

  it('skate: the longest trick needs at least 80% of maximum hang (THPS benchmark)', () => {
    const longest = Math.max(...airs(SKATE_TRICKS).map((t) => t.airSec));
    expect(longest / SKATE.full).toBeGreaterThanOrEqual(0.8);
  });

  it('snow: the same rule, on the pop snow actually has', () => {
    const all = airs(SNOW_TRICKS).length;
    expect(fitCount(SNOW_TRICKS, SNOW.floor)).toBeLessThan(all);
    expect(fitCount(SNOW_TRICKS, SNOW.full)).toBe(all);
    const longest = Math.max(...airs(SNOW_TRICKS).map((t) => t.airSec));
    expect(longest / SNOW.full).toBeGreaterThanOrEqual(0.8);
  });

  it('surf has an air vocabulary, and is still mostly ON the wave', () => {
    // The Kelly Slater benchmark asked for a lip, and my first number for that was five airs — which would have
    // made surf 5 air against 5 carve and contradicted a claim this suite already makes elsewhere: "a surf list
    // is mostly ON the wave, not in the air — a wave is not a ramp". Both halves are asserted here so the two
    // cannot drift apart again.
    const air = airs(SURF_TRICKS).length;
    const carve = SURF_TRICKS.length - air;
    expect(air).toBeGreaterThanOrEqual(4);
    expect(air).toBeLessThan(carve);
  });

  it('every discipline still orders air time by difficulty', () => {
    for (const [name, table] of [['skate', SKATE_TRICKS], ['snow', SNOW_TRICKS], ['surf', SURF_TRICKS]] as const) {
      const rows = airs(table);
      const hardest = rows.reduce((a, b) => (b.difficulty > a.difficulty ? b : a));
      const easiest = rows.reduce((a, b) => (b.difficulty < a.difficulty ? b : a));
      expect(hardest.airSec, `${name}: hardest should want more air than easiest`)
        .toBeGreaterThan(easiest.airSec);
    }
  });

  it('never gives a grind, manual or revert an air requirement', () => {
    for (const table of [SKATE_TRICKS, SNOW_TRICKS, SURF_TRICKS]) {
      for (const t of table) {
        if (t.kind !== 'air') expect(t.airSec, `${t.id} is a ${t.kind}`).toBe(0);
      }
    }
  });
});
