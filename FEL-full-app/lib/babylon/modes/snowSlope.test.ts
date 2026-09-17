import { describe, expect, it } from 'vitest';
import {
  CROWD_FEATURE_CLEAR_M, CROWD_INSET_M, EDGE_FRACTION, GATE_CLEAR_M, SNOW_CROWD, SNOW_SLOPE,
  gateDist, gateX, snowCrowd, snowRails,
} from './snowSlope';
import { SLALOM_GATES, SLALOM_SPACING, SLALOM_START, SLOPE_PITCH } from './rideWorlds';
import { SNOW_VENUES } from '../nexus/boardVenues';

const RUN_LEN = SLALOM_START + SLALOM_GATES * SLALOM_SPACING + 60;

describe('the snow slope', () => {
  it('brings snow up to its SSX feature target', () => {
    // Phase 1 measured ONE grind line, and it was a ski-lift cable. The benchmark asks for eight features.
    expect(SNOW_SLOPE.length).toBeGreaterThanOrEqual(8);
    expect(snowRails().length).toBeGreaterThanOrEqual(3);
  });

  it('brings a vocabulary rather than eleven kickers', () => {
    const kinds = new Set(SNOW_SLOPE.map((f) => f.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    for (const k of ['kicker', 'rail', 'box'] as const) expect(kinds.has(k), k).toBe(true);
  });

  it('keeps every feature on the run', () => {
    for (const f of SNOW_SLOPE) {
      expect(f.dist, f.kind).toBeGreaterThan(0);
      expect(f.dist + f.length, f.kind).toBeLessThan(RUN_LEN);
    }
  });

  /**
   * THE ONE THAT MATTERS: a kicker on a slalom gate is a gate the player cannot take.
   *
   * Checked in TWO dimensions. A first version of this test compared only distance down the fall line and
   * failed everything — but gates sit 3–4 m either side of centre (`gateX`) while every feature is pushed
   * 42%+ of the half-width out, which on the narrowest snow venue is already 8.4 m. They overlap in distance
   * constantly and in space never, which is the whole point of the edge rule. One-dimensional clearance was
   * measuring the wrong thing.
   */
  it('never sits on a slalom gate, in either axis', () => {
    for (const v of SNOW_VENUES) {
      for (const f of SNOW_SLOPE) {
        const fx = f.lateral * v.bound;
        for (let i = 0; i < SLALOM_GATES; i++) {
          const d = gateDist(i, SLALOM_START, SLALOM_SPACING);
          const nearInDist = f.dist - GATE_CLEAR_M < d && d < f.dist + f.length + GATE_CLEAR_M;
          if (!nearInDist) continue;
          const sideways = Math.abs(fx - gateX(i)) - f.width / 2;
          expect(sideways, `${f.kind} at ${f.dist} m fouls gate ${i} on ${v.id}`).toBeGreaterThan(GATE_CLEAR_M);
        }
      }
    }
  });

  it('leaves the middle of the piste as the racing line', () => {
    for (const f of SNOW_SLOPE) {
      expect(Math.abs(f.lateral), f.kind).toBeGreaterThanOrEqual(EDGE_FRACTION);
      expect(Math.abs(f.lateral), f.kind).toBeLessThanOrEqual(0.85);
    }
  });

  it('keeps every feature inside the piste on every snow venue', () => {
    for (const v of SNOW_VENUES) {
      for (const f of SNOW_SLOPE) {
        const edge = Math.abs(f.lateral) * v.bound + f.width / 2;
        expect(edge, `${f.kind} on ${v.id}`).toBeLessThanOrEqual(v.bound);
      }
    }
  });

  it('alternates sides, so the run is a rhythm rather than one long wall', () => {
    const sides = SNOW_SLOPE.map((f) => Math.sign(f.lateral));
    let flips = 0;
    for (let i = 1; i < sides.length; i++) if (sides[i] !== sides[i - 1]) flips++;
    expect(flips).toBeGreaterThanOrEqual(sides.length - 3);
  });

  it('pays a snow rail less than a skate rail, because the slope holds the lock for you', () => {
    for (const f of snowRails()) {
      expect(f.bonus).toBeGreaterThan(0);
      expect(f.bonus).toBeLessThan(300);
    }
  });

  it('agrees with the gate formula the builder uses', () => {
    expect(gateX(0)).toBe(0);
    expect(Math.sign(gateX(1))).toBe(1);
    expect(Math.sign(gateX(2))).toBe(-1);
  });

  it('confirms the run really is a descent', () => {
    // the Phase 2 criterion, measured the right way: bound is the piste WIDTH, the run is its own length
    const drop = Math.sin(SLOPE_PITCH) * RUN_LEN;
    expect(drop).toBeGreaterThan(60);
    expect(Math.tan(SLOPE_PITCH)).toBeGreaterThan(0.18);
  });
});

describe('where the crowd stands on the slope (P9)', () => {
  it('stands nobody on a park feature, at any snow venue', () => {
    // The defect this replaces: at night-park (bound 20) the dist-188 kicker spans lateral -15.6 .. -7.6 and a
    // spectator stood at -14. The margin at alpine-run was 8 cm, and a Math.random() jitter of up to 1.5 m was
    // free to spend it. Both are gone; this is the assertion that keeps them gone.
    for (const v of SNOW_VENUES) {
      for (const c of snowCrowd(v.bound)) {
        for (const f of SNOW_SLOPE) {
          const along = Math.max(f.dist - c.dist, c.dist - (f.dist + f.length));
          if (along > CROWD_FEATURE_CLEAR_M) continue;         // nowhere near it down the fall line
          const across = Math.abs(c.lateral - f.lateral * v.bound) - f.width / 2;
          expect(across, `${c.watching} stands on the ${f.kind} at ${f.dist} m on ${v.id}`)
            .toBeGreaterThan(CROWD_FEATURE_CLEAR_M);
        }
      }
    }
  });

  it('keeps them off the racing line and inside the piste', () => {
    for (const v of SNOW_VENUES) {
      for (const c of snowCrowd(v.bound)) {
        // outside every feature's lateral band, so outside the gate corridor by a long way
        expect(Math.abs(c.lateral), `${c.watching} on ${v.id}`).toBeGreaterThan(EDGE_FRACTION * v.bound);
        expect(Math.abs(c.lateral), `${c.watching} on ${v.id}`).toBeLessThanOrEqual(v.bound);
      }
    }
  });

  it('clears the trees at HALF - 2 and the lift pylons at HALF - 3.5', () => {
    for (const v of SNOW_VENUES) {
      for (const c of snowCrowd(v.bound)) {
        expect(Math.abs(c.lateral), `${c.watching} on ${v.id}`).toBeLessThan(v.bound - 3.5);
      }
    }
  });

  it('places them by table, not by chance — the same venue twice is the same crowd', () => {
    const a = snowCrowd(20);
    const b = snowCrowd(20);
    expect(a).toEqual(b);
  });

  it('gathers them in clusters rather than lining the whole run', () => {
    const dists = [...new Set(SNOW_CROWD.map((c) => c.dist))].sort((x, y) => x - y);
    // three knots of people, not eight evenly spaced ones
    const gaps = dists.slice(1).map((d, i) => d - dists[i]);
    expect(gaps.filter((g) => g > 30).length).toBeGreaterThanOrEqual(2);
    expect(CROWD_INSET_M).toBeGreaterThan(3.5);
  });
});
