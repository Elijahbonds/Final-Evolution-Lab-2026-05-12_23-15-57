import { describe, it, expect } from 'vitest';
import { judgeShowtime, showtimeMeterT, pickShowtime, showtimeAsked, posterRide, SHOWTIME_DUNKS, SHOWTIME_FLUSH_K, SHOWTIME_DEADLINE_K, SHOWTIME_STICK_BACK, SHOWTIME_PCT } from './ShowtimeDunk';

describe('ShowtimeDunk', () => {
  it('judges the press on the flight clock around the flush', () => {
    expect(judgeShowtime(SHOWTIME_FLUSH_K)).toBe('perfect');
    expect(judgeShowtime(SHOWTIME_FLUSH_K + 0.06)).toBe('good');
    expect(judgeShowtime(SHOWTIME_FLUSH_K - 0.2)).toBe('early');
    expect(judgeShowtime(SHOWTIME_FLUSH_K + 0.2)).toBe('late');
    expect(SHOWTIME_PCT.perfect).toBe(1); expect(SHOWTIME_PCT.early).toBeLessThan(SHOWTIME_PCT.none);
  });
  it('the meter fills to the deadline', () => {
    expect(showtimeMeterT(0)).toBe(0); expect(showtimeMeterT(SHOWTIME_DEADLINE_K)).toBe(1); expect(showtimeMeterT(0.9)).toBe(1);
  });
  it('asks on the stick back, or on any contact dunk', () => {
    expect(showtimeAsked('dunk', SHOWTIME_STICK_BACK)).toBe(true);
    expect(showtimeAsked('dunk', 0)).toBe(false);
    expect(showtimeAsked('standing', -1)).toBe(false);
    expect(showtimeAsked('poster', 0)).toBe(true);
  });
  it('a contact showtime keeps the ball high; the hardest three wait for momentum', () => {
    for (let i = 0; i < 40; i++) {
      const d = pickShowtime({ roll: () => i / 40, contact: true, momentum01: 1 });
      expect(['dunk_360_spin', 'dunk_finish_windmill', 'dunk_360_eastbay', 'dunk_double_clutch', 'dunk_360_windmill']).toContain(d.clip);
    }
    const cold = new Set(Array.from({ length: 40 }, (_, i) => pickShowtime({ roll: () => i / 40, contact: false, momentum01: 0 }).clip));
    expect(cold.has('dunk_double_eastbay')).toBe(false); expect(cold.has('dunk_lost_found')).toBe(false);
    const hot = new Set(Array.from({ length: 60 }, (_, i) => pickShowtime({ roll: () => i / 60, contact: false, momentum01: 1 }).clip));
    expect(hot.has('dunk_double_eastbay')).toBe(true);
    expect(SHOWTIME_DUNKS.every((d) => d.clip.startsWith('dunk_') && d.sec > 0)).toBe(true);
  });
  it('the victim rides the flight from the bump to the release', () => {
    expect(posterRide(0.3, 0.6, 0.3).s).toBe(0); expect(posterRide(0.3, 0.6, 0.6).s).toBe(1); expect(posterRide(0.3, 0.6, 0.45).lift).toBeGreaterThan(0.1);
  });
});
