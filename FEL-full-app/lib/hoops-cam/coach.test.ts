import { describe, expect, it } from 'vitest';
import { athleteShots, DOTS_MAX } from './coach';
import type { HoopsSession } from './log';

const shots = (day: string, at: number, list: [boolean, number | null][]): HoopsSession => ({
  kind: 'shots', day, at, placement: 'top', shots: list.map(([made, x], i) => ({ t: i * 1000, made, fixed: false, x, z: x === null ? null : 3 })),
});

describe('one athlete\'s window for the coach', () => {
  it('totals every shot, charts the spotted ones, and trends by day', () => {
    const a = athleteShots([
      shots('2026-11-01', 1_761_955_200_000, [[true, 0], [false, 2], [true, null]]),
      shots('2026-11-02', 1_762_041_600_000, [[true, -6.9]]),
      { kind: 'dribble', day: '2026-11-02', at: 1_762_041_700_000, count: 120, crossovers: 14, left: 60, right: 60, rateHz: 2.1, rhythmCv: 12, sec: 60 },
    ]);
    expect(a.sessions).toBe(2);
    expect(a.total).toEqual({ made: 3, taken: 4 });
    expect(a.noSpot).toBe(1);
    expect(a.dots).toHaveLength(3);
    expect(a.trend.map((d) => [d.day, d.made, d.taken])).toEqual([['2026-11-01', 2, 3], ['2026-11-02', 1, 1]]);
    expect(a.lastDay).toBe('2026-11-02');
    expect(a.dribble).toEqual({ sessions: 1, count: 120, crossovers: 14 });
    expect(a.zones.rim.taken + a.zones.paint.taken + a.zones.mid.taken + a.zones.corner3.taken + a.zones.three.taken).toBe(3);
  });

  it('caps the dots to the newest DOTS_MAX (the totals keep every shot)', () => {
    const old = shots('2026-10-20', 1_760_918_400_000, Array.from({ length: DOTS_MAX }, () => [false, 1] as [boolean, number]));
    const fresh = shots('2026-11-02', 1_762_041_600_000, Array.from({ length: 10 }, () => [true, -1] as [boolean, number]));
    const a = athleteShots([old, fresh]);
    expect(a.total.taken).toBe(DOTS_MAX + 10);
    expect(a.dots).toHaveLength(DOTS_MAX);
    expect(a.dots.filter((d) => d.made)).toHaveLength(10);
  });

  it('nothing tracked: zeros, no trend, no dribble line', () => {
    const a = athleteShots([]);
    expect(a).toMatchObject({ sessions: 0, total: { made: 0, taken: 0 }, dots: [], trend: [], lastDay: null, dribble: null });
  });
});
