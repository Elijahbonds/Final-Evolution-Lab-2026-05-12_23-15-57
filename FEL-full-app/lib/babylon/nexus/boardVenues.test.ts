// BOARD VENUES — the rules a place has to obey to be a place (2026-09-12).
//
// Owner: "different venues", "lets fix the world size issue too", "quality product production".
//
// These are not shape tests. Each one is a defect the first cut of this file actually had, or one the
// skatepark had before venues existed:
//
//   · The Warehouse rendered under Venice's sunset sky, because the venue carried a palette and the LIGHT
//     was a literal at module scope. The mood now has to be a mood the rig owns.
//   · The venue vocabulary ('sunset', 'night') was not the rig's vocabulary ('goldenHour', 'nightGame'),
//     which is two lists to keep in step and a silent fallback when they drift.
//   · Every surf break sat under a city skyline while a painted OCEAN backdrop existed, mounted by nothing.
//   · The rider crossed the whole skatepark in eight seconds.
//
// Pure data plus two pure functions, so all of it is provable without a scene.

import { describe, it, expect } from 'vitest';
import {
  SKATE_VENUES, SNOW_VENUES, SURF_VENUES, VENUES_BY_DISCIPLINE, allBoardVenues, venueById,
  readyVenues, boundGrowth, LEGACY_BOUND, LEGACY_PARK_BOUND, type BoardDiscipline,
} from './boardVenues';
import { MOODS } from '../scene/moods';

const ALL = allBoardVenues();

describe('nine places, three per discipline', () => {
  it('every discipline offers three ready venues', () => {
    for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) {
      expect(VENUES_BY_DISCIPLINE[d]).toHaveLength(3);
      expect(readyVenues(d)).toHaveLength(3);
    }
    expect(ALL).toHaveLength(9);
  });

  it('ids are unique and findable', () => {
    expect(new Set(ALL.map((v) => v.id)).size).toBe(9);
    for (const v of ALL) expect(venueById(v.id)).toBe(v);
    expect(venueById('no-such-place')).toBeNull();
  });

  it('every venue says where it is and what it is like', () => {
    for (const v of ALL) {
      expect(v.name.length).toBeGreaterThan(2);
      expect(v.sub.length).toBeGreaterThan(10);       // one real line, not a label
      expect(v.name).toBe(v.name.toUpperCase());      // the picker shouts them
    }
  });
});

describe('THE MOOD IS THE LIGHT RIG’S OWN WORD', () => {
  // The bug this closes: a venue that names a mood the rig does not have renders under the FALLBACK, and
  // a fallback is silent. With the field typed as VenueMood that is a compile error; this proves the
  // table agrees at runtime too, which is what the harness actually indexes.
  it('every venue mood exists in MOODS', () => {
    for (const v of ALL) expect(MOODS[v.mood], `${v.id} names mood ${v.mood}`).toBeDefined();
  });

  it('a discipline’s three venues are not all the same light', () => {
    for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) {
      const moods = new Set(VENUES_BY_DISCIPLINE[d].map((v) => v.mood));
      expect(moods.size, `${d} venues run ${[...moods].join('/')}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('the night venues are night and the flat-light venues are flat', () => {
    expect(SKATE_VENUES.find((v) => v.id === 'warehouse')!.mood).toBe('nightGame');
    expect(SNOW_VENUES.find((v) => v.id === 'night-park')!.mood).toBe('nightGame');
    expect(SNOW_VENUES.find((v) => v.id === 'glacier')!.mood).toBe('overcast');
    expect(SURF_VENUES.find((v) => v.id === 'reef')!.mood).toBe('overcast');
  });

  it('overcast light is carried by the HEMI, not the sun — that inversion is what overcast IS', () => {
    const o = MOODS.overcast;
    expect(o.hemiIntensity).toBeGreaterThan(0.8);
    expect(o.sunIntensity).toBeLessThan(1.2);
    // and every other mood is the usual way round, so 'overcast' is a real change of rig
    for (const m of ['goldenHour', 'daylight', 'nightGame'] as const) {
      expect(MOODS[m].sunIntensity).toBeGreaterThan(MOODS[m].hemiIntensity);
    }
  });
});

describe('the light and the sky agree', () => {
  // THE REEF ran flat overcast light under ocean.jpg, which is a photograph of a SUNSET: two times of day in
  // one frame. A mood that contradicts the bake it will be mounted over has to be able to take the sky back.
  it('the flat-light and night moods wash the baked photograph; the others leave it alone', () => {
    expect(MOODS.overcast.skyWash).toBeGreaterThan(0.5);
    expect(MOODS.nightGame.skyWash).toBeGreaterThan(0.3);
    expect(MOODS.goldenHour.skyWash).toBe(0);   // the bakes were chosen for this light
    expect(MOODS.daylight.skyWash).toBe(0);
    expect(MOODS.alpine.skyWash).toBe(0);
  });

  it('every mood declares a wash, and it is a fraction', () => {
    for (const m of Object.values(MOODS)) {
      expect(m.skyWash).toBeGreaterThanOrEqual(0);
      expect(m.skyWash).toBeLessThanOrEqual(1);
    }
  });
});

describe('EVERY SURF BREAK GETS THE OCEAN', () => {
  it('the surf venues mount the ocean backdrop', () => {
    for (const v of SURF_VENUES) expect(v.sky).toBe('ocean');
  });

  it('snow stays on the ridge line and skate on a built horizon', () => {
    for (const v of SNOW_VENUES) expect(v.sky).toBe('alpine');
    for (const v of SKATE_VENUES) expect(['venice', 'stadium']).toContain(v.sky);
  });
});

describe('THE WORLD SIZE ISSUE', () => {
  // The measurement that started this: the rider crossed the old 33-unit park in EIGHT SECONDS. Every
  // venue grows on its OWN discipline's baseline, because the three bounds are half-extents of different
  // things (a square slab, a groomed corridor's width, a break's width).
  it('every venue is bigger than the one fixed world its discipline used to have', () => {
    for (const v of ALL) {
      expect(boundGrowth(v), `${v.id} grows ${boundGrowth(v).toFixed(2)}×`).toBeGreaterThan(1.15);
    }
  });

  it('growth is measured per discipline — one number for all three would be meaningless', () => {
    expect(LEGACY_BOUND).toEqual({ skate: 33, snow: 17, surf: 45 });
    expect(LEGACY_PARK_BOUND).toBe(LEGACY_BOUND.skate);
    // the glacier is a 34 m half-corridor: bigger than the legacy SNOW run, smaller than any skatepark.
    // Compared against skate's 33 it would read as "barely grew" and against surf's 45 as a shrink.
    const glacier = SNOW_VENUES.find((v) => v.id === 'glacier')!;
    expect(boundGrowth(glacier)).toBeCloseTo(2, 1);
  });

  it('the deliberately tight places are still tight, and the biggest is the one with the least in it', () => {
    const warehouse = SKATE_VENUES.find((v) => v.id === 'warehouse')!;
    expect(warehouse.bound).toBeLessThan(Math.max(...SKATE_VENUES.map((v) => v.bound)));
    const biggestSnow = [...SNOW_VENUES].sort((a, b) => b.bound - a.bound)[0];
    expect(biggestSnow.id).toBe('glacier');
    expect(biggestSnow.crowd).toBe(Math.min(...SNOW_VENUES.map((v) => v.crowd)));
  });
});

describe('a place has people in it, and the glacier is above the trees', () => {
  it('every venue puts somebody there', () => {
    for (const v of ALL) expect(v.crowd).toBeGreaterThan(0);
  });

  it('the glacier grows no trees, because its own line says it is above them', () => {
    const glacier = SNOW_VENUES.find((v) => v.id === 'glacier')!;
    expect(glacier.sub.toLowerCase()).toContain('above the trees');
    expect(glacier.trees).toBe(0);
    // and the venues that do not say that, do
    expect(SNOW_VENUES.find((v) => v.id === 'alpine-run')!.trees).toBeGreaterThan(0);
  });
});

describe('a palette is six decisions, and they have to differ', () => {
  it('no venue paints two surfaces the same colour', () => {
    for (const v of ALL) {
      const { ground, structure, accent, edge } = v.palette;
      expect(new Set([ground, structure, accent, edge]).size, `${v.id} reuses a colour`).toBe(4);
    }
  });

  it('no two venues in a discipline share a ground colour — that was the original defect', () => {
    // the whole first skatepark was six shades of one grey-purple; three venues that shared a ground
    // would be the same mistake one level up
    for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) {
      const grounds = VENUES_BY_DISCIPLINE[d].map((v) => v.palette.ground);
      expect(new Set(grounds).size).toBe(3);
    }
  });

  it('a venue’s own surfaces differ in VALUE, not only in hue — the washed-out defect, measured', () => {
    // The original park was six materials at one value (ground #8d8496 · ramps #6f6680 · bowl #5f5670 ·
    // lane #79708a · boxes #5a5266 · fence #3c3947). Hue variety would not have saved it: what a camera
    // reads as flat is a narrow LUMINANCE spread, so that is what this measures.
    for (const v of ALL) {
      const lum = [v.palette.ground, v.palette.structure, v.palette.accent, v.palette.edge].map((hex) => {
        const n = parseInt(hex.slice(1), 16);
        const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
      expect(Math.max(...lum) - Math.min(...lum), `${v.id} value spread`).toBeGreaterThan(0.25);
    }
  });

  it('every colour is a hex triple the painters can parse', () => {
    for (const v of ALL) {
      for (const [k, hex] of Object.entries(v.palette)) {
        expect(hex, `${v.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
