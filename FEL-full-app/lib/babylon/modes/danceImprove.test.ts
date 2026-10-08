// IMPROVE (2026-10-06): DanceMode's own small decisions from the owner-picked pass — the pick screen's auto-start (#7),
// the lane's host rate (#14) and REPLAY with no finished run (#8). The rest of the pass is pure and tested beside its
// module (lib/babylon/dance/runFeedback, chartPlay, danceBests).
import { describe, expect, it } from 'vitest';
import { pickAutoStarts, replayDance, LANE_HUD_MS } from './DanceMode';

describe('DanceMode IMPROVE pass', () => {
  it('#7 the pick screen starts a track by itself only with no pad connected', () => {
    expect(pickAutoStarts(true, 0)).toBe(true);
    expect(pickAutoStarts(true, 1)).toBe(false);
    expect(pickAutoStarts(true, 2)).toBe(false);
    expect(pickAutoStarts(false, 0)).toBe(false);
  });
  it('#14 the lane reaches the host at least ~20 Hz and at most ~60 Hz', () => {
    expect(LANE_HUD_MS).toBeGreaterThanOrEqual(1000 / 60);
    expect(LANE_HUD_MS).toBeLessThanOrEqual(50);
  });
  it('#8 REPLAY with no Cypher loaded answers false (the shell remounts, as before)', () => {
    expect(replayDance()).toBe(false);
  });
});
