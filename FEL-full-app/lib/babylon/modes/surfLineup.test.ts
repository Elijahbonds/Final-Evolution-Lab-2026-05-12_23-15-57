import { describe, expect, it } from 'vitest';
import {
  LULL_SEC, SET_SIZE, SWELLS_VISIBLE, WAVE_GAP_SEC, WAVE_PROFILES,
  gapAfter, isLastOfSet, nextRideable, profileFor, sectionAt, sectionsOf, startLineup, stepLineup, waveWorth,
} from './surfLineup';

describe('the surf lineup', () => {
  describe('the waves are different rides, not one ride at three sizes', () => {
    it('meets the benchmark for distinct profiles', () => {
      expect(WAVE_PROFILES.length).toBeGreaterThanOrEqual(3);
      expect(new Set(WAVE_PROFILES.map((p) => p.shape)).size).toBe(WAVE_PROFILES.length);
    });

    it('makes peel speed the thing that separates them', () => {
      // the number you feel: a mellow wave peels slower than you can surf, a barreling one faster than a
      // comfortable line, so the ride is a race you are losing on purpose
      const peels = WAVE_PROFILES.map((p) => p.peel);
      expect(new Set(peels).size).toBe(peels.length);
      expect(Math.max(...peels) / Math.min(...peels)).toBeGreaterThan(1.4);
    });

    it('trades wall length against size, so the big one is not simply better', () => {
      const [small, , big] = WAVE_PROFILES;
      expect(big.height).toBeGreaterThan(small.height);
      expect(big.wall).toBeLessThan(small.wall);       // the big one closes out sooner
      expect(big.worth).toBeGreaterThan(small.worth);
    });

    it('only barrels the ones that should', () => {
      expect(WAVE_PROFILES.find((p) => p.shape === 'mellow')!.barrel).toBe(0);
      expect(WAVE_PROFILES.find((p) => p.shape === 'barreling')!.barrel).toBeGreaterThan(0.3);
    });
  });

  describe('a wave has sections to aim at', () => {
    it.each(WAVE_PROFILES.map((p) => [p.id, p] as const))('%s has at least takeoff, wall and closeout', (_id, p) => {
      const s = sectionsOf(p);
      const kinds = s.map((x) => x.kind);
      expect(kinds).toContain('takeoff');
      expect(kinds).toContain('wall');
      expect(kinds).toContain('closeout');
      expect(s.length).toBeGreaterThanOrEqual(3);
    });

    it('meets the benchmark of four sections on the wave that throws', () => {
      const cave = WAVE_PROFILES.find((p) => p.shape === 'barreling')!;
      expect(sectionsOf(cave).length).toBeGreaterThanOrEqual(4);
      expect(sectionsOf(cave).some((s) => s.kind === 'barrel')).toBe(true);
    });

    it.each(WAVE_PROFILES.map((p) => [p.id, p] as const))('%s covers the whole ride with no gaps', (_id, p) => {
      const s = sectionsOf(p);
      expect(s[0].from).toBe(0);
      for (let i = 1; i < s.length; i++) expect(s[i].from).toBeCloseTo(s[i - 1].to, 6);
      expect(s[s.length - 1].to).toBeCloseTo(p.wall, 6);
    });

    it('puts the barrel mid-wall, because a wave stands up before it pitches', () => {
      const cave = WAVE_PROFILES.find((p) => p.shape === 'barreling')!;
      const b = sectionsOf(cave).find((s) => s.kind === 'barrel')!;
      expect(b.from).toBeGreaterThan(sectionsOf(cave)[0].to);
      expect(b.to).toBeLessThan(cave.wall * (5 / 6) + 0.001);
    });

    it('pays the barrel most and the takeoff least', () => {
      const cave = WAVE_PROFILES.find((p) => p.shape === 'barreling')!;
      const s = sectionsOf(cave);
      const pts = Object.fromEntries(s.map((x) => [x.kind, x.pts]));
      expect(pts.barrel).toBeGreaterThan(pts.wall);
      expect(pts.wall).toBeGreaterThan(pts.takeoff);
    });

    it('locates the rider by distance along the ride', () => {
      const p = WAVE_PROFILES.find((x) => x.shape === 'barreling')!;
      expect(sectionAt(p, 0)!.kind).toBe('takeoff');
      expect(sectionAt(p, p.wall - 0.5)!.kind).toBe('closeout');
      expect(sectionAt(p, p.wall + 10)).toBeNull();
    });

    it('is worth more on a harder wave', () => {
      const worths = WAVE_PROFILES.map(waveWorth);
      expect(worths[worths.length - 1]).toBeGreaterThan(worths[0]);
    });
  });

  describe('sets arrive on a rhythm you can read', () => {
    it('groups waves into sets with a lull after', () => {
      const gaps = Array.from({ length: 12 }, (_, n) => gapAfter(n));
      expect(gaps.filter((g) => g === LULL_SEC).length).toBe(3);
      expect(gaps.filter((g) => g === WAVE_GAP_SEC).length).toBe(9);
      expect(LULL_SEC).toBeGreaterThan(WAVE_GAP_SEC);
    });

    it('builds within a set, so letting two go by is a decision', () => {
      const set = [0, 1, 2].map(profileFor);
      expect(set[2].height).toBeGreaterThan(set[0].height);
      expect(set[2].worth).toBeGreaterThan(set[0].worth);
    });

    it('sends the small one after the set', () => {
      expect(isLastOfSet(SET_SIZE)).toBe(true);
      expect(profileFor(SET_SIZE).shape).toBe('mellow');
    });

    it('is deterministic, because a lineup you cannot read is just noise', () => {
      for (let n = 0; n < 40; n++) expect(profileFor(n).id).toBe(profileFor(n + (SET_SIZE + 1) * 3).id);
    });
  });

  describe('the water holds several swells at once', () => {
    it('meets the benchmark for lineup density', () => {
      expect(SWELLS_VISIBLE).toBeGreaterThanOrEqual(2);
      expect(startLineup().swells.length).toBe(SWELLS_VISIBLE);
    });

    it('keeps that many in the water forever', () => {
      let st = startLineup();
      let broke = 0;
      for (let i = 0; i < 60 * 300; i++) {
        const r = stepLineup(st, 1 / 60);
        st = r.state; broke += r.broke.length;
        expect(st.swells.length).toBe(SWELLS_VISIBLE);
      }
      expect(broke).toBeGreaterThan(5);
    });

    it('orders them by distance, so the next one is always first', () => {
      let st = startLineup();
      for (let i = 0; i < 600; i++) st = stepLineup(st, 1 / 60).state;
      const outs = st.swells.map((s) => s.out);
      expect(outs).toEqual([...outs].sort((a, b) => a - b));
      expect(nextRideable(st)!.out).toBe(Math.min(...outs));
    });

    it('advances every swell at the same speed, so none overtakes another', () => {
      // peel is the race along the beach; approach is set by depth. Driving approach from peel let a barreling
      // swell pass through a mellow one in front of it, which is what the out-of-order break sequence exposed.
      let st = startLineup();
      for (let i = 0; i < 600; i++) st = stepLineup(st, 1 / 60).state;
      const byBirth = [...st.swells].sort((a, b) => a.n - b.n).map((s) => s.out);
      expect(byBirth).toEqual([...byBirth].sort((a, b) => a - b));
    });

    it('still lets the horizon inform you — through size, not speed', () => {
      const set = [0, 1, 2].map(profileFor);
      expect(set[2].height).toBeGreaterThan(set[1].height);
    });

    it('never leaves a swell behind the shore', () => {
      let st = startLineup();
      for (let i = 0; i < 60 * 120; i++) {
        st = stepLineup(st, 1 / 60).state;
        for (const s of st.swells) expect(s.out).toBeGreaterThan(0);
      }
    });

    it('hands back every wave that broke, so nothing is silently lost', () => {
      let st = startLineup();
      const seen: number[] = [];
      for (let i = 0; i < 60 * 240; i++) {
        const r = stepLineup(st, 1 / 60);
        st = r.state;
        for (const b of r.broke) seen.push(b.n);
      }
      // the sequence that broke is contiguous and in order
      for (let i = 1; i < seen.length; i++) expect(seen[i]).toBe(seen[i - 1] + 1);
    });
  });
});
