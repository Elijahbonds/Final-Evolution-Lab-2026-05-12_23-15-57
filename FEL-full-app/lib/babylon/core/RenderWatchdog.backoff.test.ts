// The black-screen watchdog backs off after a clean run, and snaps back on the first dark sample (perf-guard, 2026-10-06).
import { describe, it, expect } from 'vitest';
import { watchdogShouldSample, CLEAN_BEFORE_BACKOFF, BACKOFF_EVERY } from './RenderWatchdog';

describe('watchdogShouldSample', () => {
  it('samples every tick until the frame has been clean for a while', () => {
    for (let t = 1; t <= CLEAN_BEFORE_BACKOFF; t++) expect(watchdogShouldSample(t, t - 1, 0)).toBe(true);
  });
  it('then every BACKOFF_EVERY-th tick', () => {
    const hits = Array.from({ length: 50 }, (_, i) => watchdogShouldSample(100 + i, 40, 0)).filter(Boolean).length;
    expect(hits).toBe(50 / BACKOFF_EVERY);
  });
  it('a strike puts it back on every tick (a real black screen is still caught fast)', () => {
    for (let t = 101; t < 110; t++) expect(watchdogShouldSample(t, 40, 1)).toBe(true);   // a long clean run, then one dark sample
    for (let t = 101; t < 110; t++) expect(watchdogShouldSample(t, 0, 0)).toBe(true);
  });
});
