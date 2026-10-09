// Four tracks, three lanes each, and the readers the mode runs every frame.
import { describe, it, expect } from 'vitest';
import { trackPieces, coursePieces, courseLength, checkpoints, laneAt, railAt, springAt, gateAhead, overGap, LANE_X, HIGH_Y, indexCourse, probeNear, rayPiece, castCourse, PROBE_KINDS, PROBE_REACH_M, type Piece, type ProbeKind, type RayHit } from './freeRunCourse';
import { FREERUN_TRACKS } from '../nexus/freeRunTracks';
import { TIERS } from '../core/FreeRunCore';

describe('the tracks', () => {
  it('there are four, each with a start, a finish, checkpoints, and something in every lane', () => {
    expect(FREERUN_TRACKS).toHaveLength(4);
    for (const t of FREERUN_TRACKS) {
      const p = trackPieces(t, TIERS[1]);
      expect(p.some((q) => q.kind === 'start'), t.id).toBe(true);
      expect(courseLength(p), t.id).toBeGreaterThan(100);
      expect(checkpoints(p).length, t.id).toBeGreaterThanOrEqual(2);
      for (const lane of ['low', 'mid', 'high'] as const) expect(p.some((q) => q.route === lane), `${t.id} ${lane}`).toBe(true);
      expect(p.some((q) => q.kind === 'rail'), t.id).toBe(true);
      expect(p.some((q) => q.kind === 'gate'), t.id).toBe(true);
      expect(p.some((q) => q.kind === 'wall' && q.face === 1) && p.some((q) => q.kind === 'wall' && q.face === -1), `${t.id} has no rebound pair`).toBe(true);
    }
  });
  it('every piece with a lane sits in that lane, and the ground covers the course except the gaps', () => {
    for (const t of FREERUN_TRACKS) {
      const p = trackPieces(t, TIERS[2]);
      for (const q of p) {
        if (q.route === 'high' && q.kind !== 'wall') expect(q.x, `${t.id} ${q.kind}`).toBeCloseTo(LANE_X.high, 6);
        if (q.route === 'low') expect(Math.abs(q.x - LANE_X.low), `${t.id} ${q.kind}`).toBeLessThan(2);
      }
      const finish = courseLength(p);
      for (let z = 2; z < finish - 2; z += 1.5) {
        const ground = p.some((q) => q.kind === 'ground' && Math.abs(z - q.z) <= q.d / 2);
        const gap = overGap(p, 0, z);
        expect(ground || gap, `${t.id} nothing under z ${z}`).toBe(true);
      }
    }
  });
  it('the tier widens the gaps', () => {
    const wide = (tier: (typeof TIERS)[number]) => Math.max(...trackPieces(FREERUN_TRACKS[0], tier).filter((q) => q.kind === 'gap').map((q) => q.d));
    expect(wide(TIERS[2])).toBeGreaterThan(wide(TIERS[0]));
    expect(coursePieces(TIERS[0]).length).toBeGreaterThan(10);
  });
});

describe('the readers', () => {
  const p = trackPieces(FREERUN_TRACKS[0], TIERS[0]);
  it('lanes', () => { expect(laneAt(6, HIGH_Y + 0.5)).toBe('high'); expect(laneAt(-6, 0)).toBe('low'); expect(laneAt(0, 0)).toBe('mid'); expect(laneAt(6, 0)).toBe('mid'); });
  it('a rail is found under a body at its height, a spring under a foot on it, a gate ahead on the lane', () => {
    const rail = p.find((q) => q.kind === 'rail')!;
    expect(railAt(p, rail.x, rail.y + 0.3, rail.z)).toBe(rail);
    expect(railAt(p, rail.x + 2, rail.y + 0.3, rail.z)).toBeNull();
    expect(railAt(p, rail.x, rail.y + 3, rail.z)).toBeNull();
    const spring = p.find((q) => q.kind === 'spring')!;
    expect(springAt(p, spring.x, spring.z)).toBe(spring);
    const gate = p.find((q) => q.kind === 'gate')!;
    expect(gateAhead(p, gate.x, gate.z - 2)).toBe(gate);
    expect(gateAhead(p, gate.x, gate.z - 6)).toBeNull();
  });
});

// IMPROVE (2026-10-06): the per-frame readers indexed once per build (item 16), and the probe's ray-box test that replaced
// four whole-scene ray picks a frame (item 14)
describe('the course index', () => {
  it('holds the same answers the whole-list scans gave', () => {
    for (const t of FREERUN_TRACKS) for (const tier of TIERS) {
      const p = trackPieces(t, tier);
      const idx = indexCourse(p);
      expect(idx.finishZ).toBe(courseLength(p));
      expect(idx.checkpointCount).toBe(checkpoints(p).length);
      expect(idx.bars.map((i) => p[i].kind).every((k) => k === 'bar')).toBe(true);
      expect(idx.bars).toHaveLength(p.filter((q) => q.kind === 'bar').length);
      expect(idx.checkpoints.map((i) => p[i])).toEqual(p.filter((q) => q.kind === 'checkpoint'));
      expect(idx.slopes).toEqual(p.filter((q) => q.kind === 'slope'));
      expect(idx.anchors).toEqual(p.filter((q) => q.kind === 'anchor'));
      expect(idx.obstacles).toEqual(p.filter((q) => q.kind === 'vault' || q.kind === 'hazard' || q.kind === 'bar'));
      for (const q of p) expect(idx.indexOf.get(q)).toBe(p.indexOf(q));
      // the readers give the same answer over an index list as over the whole course
      const gap = p.find((q) => q.kind === 'gap')!;
      expect(overGap(idx.gaps, 0, gap.z)).toBe(overGap(p, 0, gap.z));
      const g = idx.gates[0];
      if (g) expect(gateAhead(idx.gates, g.x, g.z - 2)).toBe(gateAhead(p, g.x, g.z - 2));
    }
  });
  it('a probe bucket holds every probe piece within reach of the runner', () => {
    const p = trackPieces(FREERUN_TRACKS[1], TIERS[2]);
    const idx = indexCourse(p);
    for (let z = -2; z < idx.finishZ + 2; z += 0.9) {
      const near = new Set(probeNear(idx, z));
      for (const q of p) {
        if (!(PROBE_KINDS as readonly string[]).includes(q.kind)) { expect(near.has(q)).toBe(false); continue; }
        const dz = Math.max(0, Math.abs(q.z - z) - q.d / 2);
        if (dz <= PROBE_REACH_M - 0.01) expect(near.has(q), `${q.kind} at ${q.z} from ${z}`).toBe(true);
      }
    }
  });
});

describe('the probe ray (slab test)', () => {
  const box: Piece = { kind: 'wall', x: 0, y: 2, z: 10, w: 0.6, h: 4, d: 4 };
  it('hits the near face with its outward normal at the right distance', () => {
    const h = rayPiece(-2, 1, 10, 1, 0, 0, 5, box)!;
    expect(h.t).toBeCloseTo(1.7, 9); expect([h.nx, h.ny, h.nz]).toEqual([-1, 0, 0]);
    const f = rayPiece(0, 1, 5, 0, 0, 1, 9, box)!;
    expect(f.t).toBeCloseTo(3, 9); expect([f.nx, f.ny, f.nz]).toEqual([0, 0, -1]);
    const d = rayPiece(0, 9, 10, 0, -1, 0, 9, box)!;
    expect(d.t).toBeCloseTo(5, 9); expect([d.nx, d.ny, d.nz]).toEqual([0, 1, 0]);
  });
  it('misses past its length, behind the origin, and beside the box', () => {
    expect(rayPiece(-2, 1, 10, 1, 0, 0, 1.6, box)).toBeNull();
    expect(rayPiece(2, 1, 10, 1, 0, 0, 5, box)).toBeNull();
    expect(rayPiece(-2, 1, 13, 1, 0, 0, 5, box)).toBeNull();
    expect(rayPiece(-2, 4.5, 10, 1, 0, 0, 5, box)).toBeNull();
  });
  it('from inside, it hits the face it leaves by (as a two-sided pick does)', () => {
    const h = rayPiece(0, 1, 10, 1, 0, 0, 5, box)!;
    expect(h.t).toBeCloseTo(0.3, 9); expect([h.nx, h.ny, h.nz]).toEqual([1, 0, 0]);
  });
  it('the bucketed cast finds what a cast against every piece finds', () => {
    const p = trackPieces(FREERUN_TRACKS[0], TIERS[1]);
    const idx = indexCourse(p);
    const brute = (o: number[], d: number[], len: number, kinds: readonly ProbeKind[]): RayHit | null => {
      let best: RayHit | null = null;
      for (const q of p) { if (!(kinds as readonly string[]).includes(q.kind)) continue; const h = rayPiece(o[0], o[1], o[2], d[0], d[1], d[2], len, q); if (h && (!best || h.t < best.t)) best = h; }
      return best;
    };
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let hits = 0;
    for (let n = 0; n < 4000; n++) {
      const x = -9 + rnd() * 18, z = rnd() * idx.finishZ, y = rnd() < 0.5 ? 0 : HIGH_Y + 0.2, a = rnd() * Math.PI * 2;
      const fwd = [Math.sin(a), 0, Math.cos(a)];
      const rays: [number[], number[], number, readonly ProbeKind[]][] = [
        [[x, y + 0.6, z], fwd, 1.7, ['vault']], [[x, y + 1.3, z], fwd, 1.4, ['wall']], [[x, y + 1.25, z], fwd, 1.9, ['bar']],
        [[x + fwd[0] * 2.2, y + 4.2, z + fwd[2] * 2.2], [0, -1, 0], 2.6, ['ledge', 'roof']],
      ];
      for (const [o, d, len, kinds] of rays) {
        const a1 = castCourse(idx, z, o[0], o[1], o[2], d[0], d[1], d[2], len, kinds), b1 = brute(o, d, len, kinds);
        expect(a1).toEqual(b1);
        if (a1) hits++;
      }
    }
    expect(hits).toBeGreaterThan(100);   // the sample really exercised hits, not only misses
  });
});
