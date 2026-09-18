// Four tracks, three lanes each, and the readers the mode runs every frame.
import { describe, it, expect } from 'vitest';
import { trackPieces, coursePieces, courseLength, checkpoints, laneAt, railAt, springAt, gateAhead, overGap, LANE_X, HIGH_Y } from './freeRunCourse';
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
