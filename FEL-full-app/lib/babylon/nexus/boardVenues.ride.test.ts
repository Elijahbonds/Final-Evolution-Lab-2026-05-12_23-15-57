// THE PLACES HAVE TO PLAY THE WAY THEY LOOK (2026-09-13).
//
// Nine board venues shipped with palette, mood, sky, crowd and trees — a real visual pass. Every field
// except `bound` was cosmetic, so three genuinely different-looking places rode identically and the copy
// was writing cheques the physics did not honour: "granite ledges" skated like warm Venice concrete, the
// glacier ("a long way down") descended at the alpine run's pitch, and the reef, which "breaks hard and it
// breaks shallow", broke exactly like an afternoon point.
//
// The load-bearing test is the last one: THE COPY AND THE NUMBERS AGREE. If a venue's one line of prose
// says it is fast and shallow, the venue's ride has to say so too, or the pass has just moved the lie.

import { describe, it, expect } from 'vitest';
import {
  SKATE_VENUES, SNOW_VENUES, SURF_VENUES, rideOf, tuneForVenue, NEUTRAL_RIDE, type BoardVenue,
} from './boardVenues';

const ALL = [...SKATE_VENUES, ...SNOW_VENUES, ...SURF_VENUES];
const byId = (id: string) => ALL.find((v) => v.id === id)!;

describe('every venue has a character', () => {
  it('rideOf always returns a complete set, authored or not', () => {
    for (const v of ALL) {
      const r = rideOf(v);
      for (const k of Object.keys(NEUTRAL_RIDE) as (keyof typeof NEUTRAL_RIDE)[]) {
        expect(typeof r[k], `${v.id}.${k}`).toBe('number');
        expect(Number.isFinite(r[k]), `${v.id}.${k}`).toBe(true);
      }
    }
  });

  it('NO TWO VENUES IN A DISCIPLINE RIDE THE SAME — otherwise the picker is a colour swatch', () => {
    for (const set of [SKATE_VENUES, SNOW_VENUES, SURF_VENUES]) {
      const shapes = set.map((v) => JSON.stringify(rideOf(v)));
      expect(new Set(shapes).size, set[0].discipline).toBe(set.length);
    }
  });

  it('and no multiplier is extreme enough to be a different sport', () => {
    for (const v of ALL) {
      const r = rideOf(v);
      for (const [k, n] of Object.entries(r)) {
        expect(n, `${v.id}.${k}`).toBeGreaterThan(0.5);
        expect(n, `${v.id}.${k}`).toBeLessThan(2);
      }
    }
  });
});

describe('THE COPY AND THE NUMBERS AGREE', () => {
  it('the glacier is "a long way down" — the steepest pitch of the three', () => {
    const pitches = SNOW_VENUES.map((v) => ({ id: v.id, p: rideOf(v).pitch }));
    const steepest = pitches.reduce((a, b) => (b.p > a.p ? b : a));
    expect(steepest.id).toBe('glacier');
    expect(byId('glacier').sub.toLowerCase()).toContain('a long way down');
  });

  it('the reef "breaks hard and it breaks shallow" — biggest wave, fastest wall, worst fall', () => {
    const reef = rideOf(byId('reef'));
    for (const other of SURF_VENUES.filter((v) => v.id !== 'reef')) {
      expect(reef.waveHeight, other.id).toBeGreaterThan(rideOf(other).waveHeight);
      expect(reef.wavePeriod, other.id).toBeGreaterThan(rideOf(other).wavePeriod);
      expect(reef.hazard, other.id).toBeGreaterThan(rideOf(other).hazard);
    }
  });

  it('sunset point has "long walls" — the mellowest wave, and the most room to carve', () => {
    const pt = rideOf(byId('sunset-point'));
    expect(pt.waveHeight).toBeLessThan(1);
    expect(pt.carve).toBeGreaterThan(1);
  });

  it('the plaza is "granite ledges" — the slickest skate surface, and the fastest', () => {
    const plaza = rideOf(byId('city-plaza'));
    for (const other of SKATE_VENUES.filter((v) => v.id !== 'city-plaza')) {
      expect(plaza.grip, other.id).toBeLessThan(rideOf(other).grip);
    }
    expect(plaza.speed).toBeGreaterThan(1);
  });

  it('the glacier is "above the trees" and grows none', () => {
    expect(byId('glacier').trees).toBe(0);
  });
});

describe('NO VENUE IS STRICTLY BEST', () => {
  it('every venue is beaten by another on something', () => {
    // a place that is fastest AND grippiest AND safest is the only place anyone would play
    const good = (v: BoardVenue) => {
      const r = rideOf(v);
      return { speed: r.speed, grip: r.grip, carve: r.carve, safety: 1 / r.hazard };
    };
    for (const set of [SKATE_VENUES, SNOW_VENUES, SURF_VENUES]) {
      for (const v of set) {
        const mine = good(v);
        const dominated = set.some((o) => o.id !== v.id && (Object.keys(mine) as (keyof typeof mine)[])
          .every((k) => good(o)[k] >= mine[k]) && (Object.keys(mine) as (keyof typeof mine)[])
          .some((k) => good(o)[k] > mine[k]));
        expect(dominated, `${v.id} is strictly worse than another venue`).toBe(false);
      }
    }
  });
});

describe('tuneForVenue', () => {
  const base = { maxSpeed: 10, carveTurnRate: 2, carveHold: 1.02, scrubRate: 0.6 };

  it('a neutral venue leaves the sport exactly as tuned', () => {
    const neutral = { ...byId('alpine-run') };
    expect(tuneForVenue(base, neutral)).toEqual(base);
  });

  it('a slick venue scrubs MORE and holds a carve LESS', () => {
    const slick = tuneForVenue(base, byId('city-plaza'));
    expect(slick.scrubRate).toBeGreaterThan(base.scrubRate);
    expect(slick.carveHold).toBeLessThan(base.carveHold);
  });

  it('grip is spent on HOLD, not on turn rate — a slick surface does not stop you turning', () => {
    const slick = tuneForVenue(base, byId('city-plaza'));
    // the plaza's carve multiplier is what moves turn rate; grip must not also
    expect(slick.carveTurnRate).toBeCloseTo(base.carveTurnRate * rideOf(byId('city-plaza')).carve, 6);
  });

  it('does not mutate the tuning it was given — a remount must not compound the venue', () => {
    const copy = { ...base };
    tuneForVenue(base, byId('reef'));
    expect(base).toEqual(copy);
  });

  it('never produces a nonsense tuning', () => {
    for (const v of ALL) {
      const t = tuneForVenue(base, v);
      expect(t.maxSpeed, v.id).toBeGreaterThan(0);
      expect(t.carveTurnRate, v.id).toBeGreaterThan(0);
      expect(t.scrubRate, v.id).toBeGreaterThan(0);
      expect(t.carveHold, v.id).toBeGreaterThan(1);
    }
  });
});
