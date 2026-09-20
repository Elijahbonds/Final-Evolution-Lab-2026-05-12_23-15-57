import { describe, expect, it } from 'vitest';
import {
  GHOST_HZ, GhostRecorder, bestSectors, deltaLabel, deltaMs, fasterGhost, ghostAtProgress, ghostAtTime,
  judgeSectors, sectorsFrom, theoreticalBestMs, type Ghost,
} from './ghost';

/** A lap driven at a steady pace: progress p reached at p * timeMs. */
function lap(timeMs: number, courseId = 'boardwalk-loop'): Ghost {
  const samples = [];
  for (let i = 0; i <= 20; i++) {
    const p = i / 20;
    samples.push({ progress: p, t: p * timeMs, x: p * 100, y: 0, z: 0 });
  }
  return { courseId, timeMs, samples, recordedAtMs: 0 };
}

describe('the ghost', () => {
  it('thins a frame-rate stream to its sample rate', () => {
    const rec = new GhostRecorder();
    for (let f = 0; f < 120; f++) rec.sample({ progress: f / 120, t: f * (1000 / 60), x: f, y: 0, z: 0 });
    const g = rec.finish('c', 2000)!;
    // 2 seconds at GHOST_HZ, give or take the first sample
    expect(g.samples.length).toBeLessThanOrEqual(2 * GHOST_HZ + 2);
    expect(g.samples.length).toBeGreaterThan(2 * GHOST_HZ - 4);
  });

  it('never lets progress go backwards — a reversing kart would break every lookup', () => {
    const rec = new GhostRecorder();
    rec.sample({ progress: 0.50, t: 0, x: 0, y: 0, z: 0 });
    rec.sample({ progress: 0.30, t: 100, x: 0, y: 0, z: 0 });   // spun round and drove back
    rec.sample({ progress: 0.55, t: 200, x: 0, y: 0, z: 0 });
    const g = rec.finish('c', 200)!;
    const ps = g.samples.map((s) => s.progress);
    expect(ps).toEqual([...ps].sort((a, b) => a - b));
  });

  it('refuses to make a ghost out of nothing', () => {
    const rec = new GhostRecorder();
    expect(rec.finish('c', 1000)).toBeNull();
    rec.sample({ progress: 0, t: 0, x: 0, y: 0, z: 0 });
    expect(rec.finish('c', 1000)).toBeNull();      // one sample is not a lap
  });

  it('keeps the faster lap', () => {
    const slow = lap(60_000), fast = lap(58_000);
    expect(fasterGhost(slow, fast)).toBe(fast);
    expect(fasterGhost(fast, slow)).toBe(fast);
    expect(fasterGhost(null, slow)).toBe(slow);
    expect(fasterGhost(slow, null)).toBe(slow);
    expect(fasterGhost(null, null)).toBeNull();
  });

  it('interpolates position by progress and by time', () => {
    const g = lap(60_000);
    expect(ghostAtProgress(g, 0.5)!.t).toBeCloseTo(30_000, 0);
    expect(ghostAtTime(g, 30_000)!.progress).toBeCloseTo(0.5, 3);
    // off the ends it clamps rather than extrapolating into fiction
    expect(ghostAtProgress(g, -1)!.progress).toBe(0);
    expect(ghostAtTime(g, 999_999)!.progress).toBe(1);
  });

  it('THE DELTA IS MEASURED AT THE SAME DISTANCE, not the same clock', () => {
    const best = lap(60_000);
    // halfway round, two seconds quicker than the best lap was at that point
    expect(deltaMs(best, 0.5, 28_000)).toBeCloseTo(-2000, 0);
    expect(deltaMs(best, 0.5, 31_500)).toBeCloseTo(1500, 0);
    expect(deltaMs(null, 0.5, 1000)).toBeNull();
  });

  it('reads ahead as minus and behind as plus', () => {
    expect(deltaLabel(-420)).toBe('−0.42');
    expect(deltaLabel(1080)).toBe('+1.08');
    expect(deltaLabel(null)).toBe('—');
  });
});

describe('sectors', () => {
  it('turns gate times into per-sector splits', () => {
    const s = sectorsFrom([10_000, 25_000, 40_000]);
    expect(s.splits).toEqual([10_000, 15_000, 15_000]);
  });

  it('marks the sectors you just drove faster than ever', () => {
    const best = sectorsFrom([10_000, 25_000, 40_000]);
    const now = sectorsFrom([9_500, 25_500, 39_000]);   // sector 1 up, sector 2 down, sector 3 up
    const v = judgeSectors(now, best);
    expect(v[0].delta).toBe(-500); expect(v[0].personalBest).toBe(true);
    expect(v[1].delta).toBe(1000); expect(v[1].personalBest).toBe(false);
    expect(v[2].personalBest).toBe(true);
  });

  it('does not judge a sector the reference lap never reached', () => {
    const short = sectorsFrom([10_000]);
    const full = sectorsFrom([10_000, 25_000, 40_000]);
    const v = judgeSectors(full, short);
    expect(v[1].delta).toBe(0);            // no lie about a sector with no benchmark
    expect(v[2].delta).toBe(0);
  });

  it('with no reference at all, every sector is a personal best', () => {
    expect(judgeSectors(sectorsFrom([1000, 2000]), null).every((x) => x.personalBest)).toBe(true);
  });

  it('builds the theoretical best lap out of your best sectors from any laps', () => {
    const a = sectorsFrom([10_000, 26_000, 40_000]);   // splits 10, 16, 14
    const b = sectorsFrom([11_000, 24_000, 41_000]);   // splits 11, 13, 17
    expect(bestSectors([a, b])!.splits).toEqual([10_000, 13_000, 14_000]);
    expect(theoreticalBestMs([a, b])).toBe(37_000);    // faster than either real lap
    expect(theoreticalBestMs([])).toBeNull();
  });
});
