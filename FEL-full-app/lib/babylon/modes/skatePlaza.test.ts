import { describe, expect, it } from 'vitest';
import {
  PLAZA_CROWD, SKATE_PLAZA, SPAWN_CLEAR_M, plazaCrowd, plazaMarkers, plazaRails, plazaSolids,
} from './skatePlaza';
import { SKATE_VENUES } from '../nexus/boardVenues';

/** Every skate venue, because the layout is fractions of the bound and a small venue is where it breaks. */
const VENUES = SKATE_VENUES.map((v) => [v.id, v.bound] as const);

const len = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

describe('the skate plaza', () => {
  it('adds a real amount of stuff', () => {
    expect(SKATE_PLAZA.solids.length).toBeGreaterThanOrEqual(18);
    expect(SKATE_PLAZA.rails.length).toBeGreaterThanOrEqual(8);
    expect(SKATE_PLAZA.markers.length).toBeGreaterThanOrEqual(6);
  });

  it('brings a vocabulary, not more of the same thing', () => {
    const kinds = new Set(SKATE_PLAZA.solids.map((s) => s.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(8);
    for (const must of ['spine', 'pyramid', 'gapLedge', 'manualPad', 'table', 'bench', 'wallride'] as const) {
      expect(kinds.has(must), must).toBe(true);
    }
  });

  describe.each(VENUES)('on %s (bound %s)', (_id, bound) => {
    const solids = plazaSolids(bound);
    const rails = plazaRails(bound);
    const markers = plazaMarkers(bound);

    it('keeps every solid inside the fence', () => {
      // a feature outside the bound is a feature the rider is clamped away from — built and unreachable
      for (const s of solids) {
        const reach = Math.max(s.width, s.depth) / 2;
        expect(Math.abs(s.x) + reach, `${s.kind} x`).toBeLessThanOrEqual(bound);
        expect(Math.abs(s.z) + reach, `${s.kind} z`).toBeLessThanOrEqual(bound);
      }
    });

    it('keeps every rail inside the fence', () => {
      for (const r of rails) {
        for (const p of [r.a, r.b]) {
          expect(Math.abs(p[0]), r.of).toBeLessThanOrEqual(bound);
          expect(Math.abs(p[2]), r.of).toBeLessThanOrEqual(bound);
        }
      }
    });

    it('leaves the spawn clear', () => {
      // the rider drops in at the origin; a bench on that spot is a rider inside geometry on frame one
      for (const s of solids.filter((x) => x.solid)) {
        const near = Math.hypot(s.x, s.z) - Math.max(s.width, s.depth) / 2;
        expect(near, `${s.kind} sits on the spawn`).toBeGreaterThan(SPAWN_CLEAR_M - Math.max(s.width, s.depth) / 2 - 0.001);
      }
      const clear = solids.filter((x) => x.solid).every((s) => Math.hypot(s.x, s.z) > SPAWN_CLEAR_M);
      expect(clear).toBe(true);
    });

    it('gives every rail a length a grind can actually lock onto', () => {
      // GRIND_MAGNET is 2.0 m in SkateRunMode; a rail shorter than that is a point, not a line
      for (const r of rails) expect(len(r.a, r.b), r.of).toBeGreaterThan(2.5);
    });

    it('never puts two rails in the same place', () => {
      const seen = new Set<string>();
      for (const r of rails) {
        const key = [...r.a, ...r.b].map((n) => n.toFixed(2)).join(',');
        expect(seen.has(key), r.of).toBe(false);
        seen.add(key);
      }
    });

    it('keeps the kinked rail actually joined', () => {
      const first = rails.find((r) => r.of.includes('first half'))!;
      const second = rails.find((r) => r.of.includes('second half'))!;
      // a kink with a gap in it is two rails you fall between
      expect(len(first.b, second.a)).toBeLessThan(0.01);
    });

    it('puts every marker inside the fence and above the floor', () => {
      for (const m of markers) {
        expect(Math.abs(m[0])).toBeLessThanOrEqual(bound);
        expect(Math.abs(m[2])).toBeLessThanOrEqual(bound);
        expect(m[1]).toBeGreaterThan(0);
      }
    });
  });

  describe('the bonuses are difficulty, not size', () => {
    const by = (needle: string): number => SKATE_PLAZA.rails.find((r) => r.of.includes(needle))!.bonus;

    it('a bench is the cheapest and the wallride lip is the dearest', () => {
      expect(by('bench')).toBeLessThan(by('table'));
      expect(by('table')).toBeLessThan(by('hubba'));
      expect(by('hubba')).toBeLessThan(by('gap'));
      expect(by('gap')).toBeLessThan(by('wallride'));
    });

    it('pays the kinked rail as two ordinary locks rather than one big one', () => {
      // two locks in a row should beat a single bench but neither half should beat the hubba
      expect(by('first half') + by('second half')).toBeGreaterThan(by('hubba'));
      expect(by('first half')).toBeLessThan(by('hubba'));
      expect(by('second half')).toBeLessThan(by('hubba'));
    });

    it('never pays nothing', () => {
      for (const r of SKATE_PLAZA.rails) expect(r.bonus).toBeGreaterThan(0);
    });
  });

  it('only leans the wallride', () => {
    const pitched = SKATE_PLAZA.solids.filter((s) => s.pitch);
    expect(pitched.map((s) => s.kind)).toEqual(['wallride']);
  });

  it('marks the bins and planters solid, because a skater ollies a bin', () => {
    for (const s of SKATE_PLAZA.solids.filter((x) => x.kind === 'bin' || x.kind === 'planter')) {
      expect(s.solid).toBe(true);
    }
  });
});

describe('where the crowd stands', () => {
  it('has somewhere for every venue to seat its crowd', () => {
    for (const [, bound] of VENUES) expect(plazaCrowd(bound).length).toBeGreaterThanOrEqual(10);
  });

  it('puts every group inside the fence', () => {
    for (const [id, bound] of VENUES) {
      for (const c of plazaCrowd(bound)) {
        expect(Math.abs(c.x), `${c.watching} on ${id}`).toBeLessThan(bound);
        expect(Math.abs(c.z), `${c.watching} on ${id}`).toBeLessThan(bound);
      }
    }
  });

  it('stands them clear of every solid, because a body on a landing is an obstacle', () => {
    // A solid is a rotated box, not a disc. Measuring centre-to-centre against max(width, depth)/2 reads a long
    // thin solid — the 11 m wallride, the 9.5 m manual pad — as overlapping a group standing well beside it, and
    // reads a group standing on the narrow end of one as clear. So rotate the offset into the solid's own frame
    // and measure against the real half-extents. Same mistake the snow gate-clearance test made by comparing
    // only distance down the fall line.
    for (const [id, bound] of VENUES) {
      const solids = plazaSolids(bound).filter((s) => s.solid);
      for (const c of plazaCrowd(bound)) {
        for (const s of solids) {
          const dx = c.x - s.x;
          const dz = c.z - s.z;
          const cos = Math.cos(-s.ry);
          const sin = Math.sin(-s.ry);
          const lx = dx * cos - dz * sin;
          const lz = dx * sin + dz * cos;
          const ox = Math.abs(lx) - s.width / 2;
          const oz = Math.abs(lz) - s.depth / 2;
          // Outside on either axis means clear by that much; inside both means the body is on the feature.
          const gap = ox > 0 && oz > 0 ? Math.hypot(ox, oz) : Math.max(ox, oz);
          expect(gap, `${c.watching} stands on the ${s.kind} at ${id}`).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it('gives each group something real to look at', () => {
    const kinds = new Set(SKATE_PLAZA.solids.map((s) => s.kind as string));
    const named = new Set(PLAZA_CROWD.map((c) => c.watching));
    // every thing being watched corresponds to a feature that exists, by name or by description
    for (const w of named) {
      const ok = [...kinds].some((k) => w.toLowerCase().includes(k.toLowerCase()))
        || ['the gap', 'west bench', 'east bench', 'picnic table'].includes(w);
      expect(ok, `nobody should be watching "${w}"`).toBe(true);
    }
  });

  it('spreads them around rather than bunching them in one corner', () => {
    const c = PLAZA_CROWD;
    expect(c.some((x) => x.fx > 0.3)).toBe(true);
    expect(c.some((x) => x.fx < -0.3)).toBe(true);
    expect(c.some((x) => x.fz > 0.3)).toBe(true);
    expect(c.some((x) => x.fz < -0.3)).toBe(true);
  });
});
