// NO BLEND BREAKS THE BUDGET (2026-09-13).
//
// The owner asked for blends, and a blend system is exactly where a fighting game goes wrong: somebody finds
// the 30-70 of two schools that is quietly better than everything, and from then on there is one style in the
// game. You cannot playtest your way out of that — six schools give thirty ordered pairs and a continuous
// slider between each, so the space is infinite and a hand-checked table of examples proves nothing.
//
// So the safety is ARITHMETIC rather than tuning: every school's traits sum to STYLE_BUDGET, a blend is a
// convex combination, and a convex combination of two vectors summing to 6 sums to 6. These tests hold the
// invariant that makes that argument true, and then sweep the whole space to confirm it — every pair, every
// mix, at a resolution far finer than any player can move a slider.

import { describe, it, expect } from 'vitest';
import {
  SCHOOLS, STYLE_BUDGET, STYLE_TRAIT_KEYS, schoolById, readySchools, blendTraits, blendName, blendTint,
  clampMix, startupMult, damageMult, rangeMult, guardTakenMult, chiMult, cancelMult,
  favouredStrike, routeBonus, FAVOUR_BONUS, parseBlend, formatBlend, type StyleBlend, type StyleTraits,
} from './schools';

const sum = (t: StyleTraits) => STYLE_TRAIT_KEYS.reduce((a, k) => a + t[k], 0);

describe('THE BUDGET IS THE BALANCE', () => {
  it('every school spends exactly STYLE_BUDGET and not a point more', () => {
    for (const s of SCHOOLS) expect(sum(s.traits), s.id).toBeCloseTo(STYLE_BUDGET, 9);
  });

  it('NO BLEND OF ANY TWO SCHOOLS AT ANY MIX CAN EXCEED IT', () => {
    // every ordered pair, every mix at 1% resolution — 30 pairs x 101 mixes
    for (const a of SCHOOLS) for (const b of SCHOOLS) {
      for (let i = 0; i <= 100; i++) {
        const blend: StyleBlend = { primary: a.id, secondary: b.id, mix: i / 100 };
        expect(sum(blendTraits(blend)), `${a.id}/${b.id}@${i}`).toBeCloseTo(STYLE_BUDGET, 9);
      }
    }
  });

  it('and no blend can push a single trait past the best school at it', () => {
    // a convex combination lies BETWEEN its inputs, so the extremes of the whole space are the schools
    // themselves. If this ever fails, blendTraits stopped being a lerp.
    for (const k of STYLE_TRAIT_KEYS) {
      const hi = Math.max(...SCHOOLS.map((s) => s.traits[k]));
      const lo = Math.min(...SCHOOLS.map((s) => s.traits[k]));
      for (const a of SCHOOLS) for (const b of SCHOOLS) for (const mix of [0, 0.13, 0.5, 0.87, 1]) {
        const v = blendTraits({ primary: a.id, secondary: b.id, mix })[k];
        expect(v, `${k} ${a.id}/${b.id}@${mix}`).toBeLessThanOrEqual(hi + 1e-9);
        expect(v, `${k} ${a.id}/${b.id}@${mix}`).toBeGreaterThanOrEqual(lo - 1e-9);
      }
    }
  });

  it('NO SCHOOL DOMINATES ANOTHER — a consequence of the budget, checked anyway', () => {
    const bad: string[] = [];
    for (const a of SCHOOLS) for (const b of SCHOOLS) {
      if (a === b) continue;
      const noWorse = STYLE_TRAIT_KEYS.every((k) => a.traits[k] >= b.traits[k]);
      const better = STYLE_TRAIT_KEYS.some((k) => a.traits[k] > b.traits[k]);
      if (noWorse && better) bad.push(`${a.id} dominates ${b.id}`);
    }
    expect(bad).toEqual([]);
  });

  it('every school is genuinely different — nobody is a copy with a new name', () => {
    for (const a of SCHOOLS) for (const b of SCHOOLS) {
      if (a === b) continue;
      const spread = STYLE_TRAIT_KEYS.reduce((acc, k) => acc + Math.abs(a.traits[k] - b.traits[k]), 0);
      expect(spread, `${a.id} vs ${b.id}`).toBeGreaterThan(0.15);
    }
    expect(new Set(SCHOOLS.map((s) => s.name)).size).toBe(SCHOOLS.length);
  });

  it('and each school is the best in the game at the thing its line claims', () => {
    const best = (k: keyof StyleTraits) => SCHOOLS.reduce((a, b) => (b.traits[k] > a.traits[k] ? b : a)).id;
    expect(best('speed'), 'the fastest hands').toBe('sharp');
    expect(best('guard'), 'the guard that nothing gets through').toBe('anchored');
    expect(best('flow'), 'the one that chains everything').toBe('flowing');
    expect(best('reach'), 'the long legs').toBe('sweeping');
    expect(schoolById('sharp').sub.toLowerCase()).toContain('fastest');
    expect(schoolById('flowing').sub.toLowerCase()).toContain('chains');
  });
});

describe('a style is how you fight, never what you are allowed to do', () => {
  it('the converters flip the two inverted traits, and never the others', () => {
    const sharp = schoolById('sharp').traits;          // speed 1.25
    const anchored = schoolById('anchored').traits;    // speed 0.85, guard 1.25
    // faster school => SHORTER startup
    expect(startupMult(sharp)).toBeLessThan(startupMult(anchored));
    expect(startupMult(sharp)).toBeCloseTo(0.75, 6);
    // better guard => LESS guard damage taken
    expect(guardTakenMult(anchored)).toBeLessThan(guardTakenMult(sharp));
    expect(guardTakenMult(anchored)).toBeCloseTo(0.75, 6);
    // the four that are not inverted pass straight through
    expect(damageMult(anchored)).toBe(anchored.power);
    expect(rangeMult(sharp)).toBe(sharp.reach);
    expect(chiMult(sharp)).toBe(sharp.chi);
    expect(cancelMult(sharp)).toBe(sharp.flow);
  });

  it('no converter can produce a value that breaks a fight', () => {
    // across the whole blend space: nothing free, nothing unreactable, nothing that cannot be blocked
    for (const a of SCHOOLS) for (const b of SCHOOLS) for (let i = 0; i <= 20; i++) {
      const t = blendTraits({ primary: a.id, secondary: b.id, mix: i / 20 });
      const tag = `${a.id}/${b.id}@${i}`;
      expect(startupMult(t), tag).toBeGreaterThanOrEqual(0.5);
      expect(startupMult(t), tag).toBeLessThan(1.5);
      expect(guardTakenMult(t), tag).toBeGreaterThanOrEqual(0.4);
      expect(damageMult(t), tag).toBeGreaterThan(0.5);
      expect(damageMult(t), tag).toBeLessThan(1.5);
      expect(rangeMult(t), tag).toBeGreaterThan(0.5);
    }
  });

  it('the favour bonus is small, and it is outside the budget on purpose', () => {
    expect(FAVOUR_BONUS).toBeLessThanOrEqual(0.08);
    const blend: StyleBlend = { primary: 'sweeping', secondary: 'sharp', mix: 0 };
    expect(favouredStrike(blend)).toBe('kick');
    expect(routeBonus(blend, 'kick')).toBeCloseTo(1 + FAVOUR_BONUS, 9);
    expect(routeBonus(blend, 'heavy')).toBe(1);
    // past halfway the secondary leads
    expect(favouredStrike({ ...blend, mix: 0.75 })).toBe('jab');
  });
});

describe('the blend as the picker sees and stores it', () => {
  it('offers six schools, all ready, each naming its cost', () => {
    const list = readySchools();
    expect(list.length).toBe(6);
    for (const s of list) expect(s.sub.length, s.id).toBeGreaterThan(20);
  });

  it('names itself honestly — a blend that is really one school says one name', () => {
    expect(blendName({ primary: 'sharp', secondary: 'sharp', mix: 0.5 })).toBe('SHARP');
    expect(blendName({ primary: 'sharp', secondary: 'anchored', mix: 0 })).toBe('SHARP');
    expect(blendName({ primary: 'sharp', secondary: 'anchored', mix: 1 })).toBe('ANCHORED');
    expect(blendName({ primary: 'sharp', secondary: 'anchored', mix: 0.3 })).toBe('SHARP / ANCHORED 70-30');
    expect(blendTint({ primary: 'sharp', secondary: 'anchored', mix: 0.2 })).toBe(schoolById('sharp').tint);
    expect(blendTint({ primary: 'sharp', secondary: 'anchored', mix: 0.8 })).toBe(schoolById('anchored').tint);
  });

  it('round-trips through the stored string', () => {
    const blend: StyleBlend = { primary: 'flowing', secondary: 'crashing', mix: 0.35 };
    const back = parseBlend(formatBlend(blend));
    expect(back).toEqual({ ...blend, mix: 0.35 });
  });

  it('NEVER THROWS ON GARBAGE — an old or hand-edited pick degrades to a real style', () => {
    expect(parseBlend(null)).toBeNull();
    expect(parseBlend('')).toBeNull();
    expect(parseBlend('nonsense:sharp:0.5')).toBeNull();
    // a known primary with a junk secondary or mix still produces a fightable style
    expect(parseBlend('sharp:junk:abc')).toEqual({ primary: 'sharp', secondary: 'sharp', mix: 0 });
    expect(parseBlend('sharp:anchored:9')).toEqual({ primary: 'sharp', secondary: 'anchored', mix: 1 });
    expect(parseBlend('sharp:anchored:-4')).toEqual({ primary: 'sharp', secondary: 'anchored', mix: 0 });
    expect(schoolById('nope').id).toBe(SCHOOLS[0].id);
    expect(clampMix(NaN)).toBe(0);
  });

  it('the default is a real school and it is the even one', () => {
    // a player who never opens the picker fights close to how the karate modes always played
    expect(SCHOOLS[0].id).toBe('straight');
    const t = SCHOOLS[0].traits;
    for (const k of STYLE_TRAIT_KEYS) expect(Math.abs(t[k] - 1), `${k}`).toBeLessThanOrEqual(0.05 + 1e-9);
  });
});
