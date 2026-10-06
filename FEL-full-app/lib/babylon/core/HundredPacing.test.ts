// The Hundred's run rules (IMPROVE 2026-10-06) — see HundredPacing.ts.
import { describe, expect, it } from 'vitest';
import { canTopUp, hordeLiveCap, HORDE_LIVE_CAP_MOBILE, HUNDRED_PHONE_ONLOOKERS, waveDone } from './HundredPacing';
import { waveSpec } from './OnslaughtCore';

describe('the phone body cap', () => {
  it('a phone stands at most HORDE_LIVE_CAP_MOBILE; desktop is uncapped', () => {
    expect(hordeLiveCap('mobile')).toBe(HORDE_LIVE_CAP_MOBILE);
    expect(hordeLiveCap('desktop')).toBe(Infinity);
    expect(hordeLiveCap(undefined)).toBe(Infinity);
  });
  it('2 fighters + the onlookers + the cap fit the perf ceiling of 16 skinned bodies', () => {
    expect(2 + HUNDRED_PHONE_ONLOOKERS + HORDE_LIVE_CAP_MOBILE).toBeLessThanOrEqual(16);
  });
  it('the cap is under the phone wave, so the queue is what holds it (the wave itself is unchanged)', () => {
    expect(waveSpec(9, 12).count).toBe(12);
    expect(HORDE_LIVE_CAP_MOBILE).toBeLessThan(12);
  });
  it('a queued body comes in only on a free rig under the cap', () => {
    expect(canTopUp(9, 2, 10)).toBe(true);
    expect(canTopUp(10, 2, 10)).toBe(false);
    expect(canTopUp(3, 0, 10)).toBe(false);
    expect(canTopUp(50, 1, Infinity)).toBe(true);
  });
  it('the wave is done only when nobody stands, loads or waits', () => {
    expect(waveDone(0, 0, 0)).toBe(true);
    expect(waveDone(0, 0, 1)).toBe(false);
    expect(waveDone(0, 1, 0)).toBe(false);
    expect(waveDone(1, 0, 0)).toBe(false);
  });
  it('simulated phone wave: never more than the cap rigged, every body of the wave fights', () => {
    const count = 12, cap = HORDE_LIVE_CAP_MOBILE;
    let live = Math.min(count, cap), queued = count - live, sinking = 0, spawned = live, peak = live;
    for (let t = 0; t < 1000; t++) {
      if (live > 0 && t % 3 === 0) { live--; sinking++; }          // a KO: the body sinks out on its rig
      if (sinking > 0 && t % 7 === 0) { sinking--; while (canTopUp(live + sinking, queued, cap)) { queued--; live++; spawned++; } }
      peak = Math.max(peak, live + sinking);
    }
    expect(spawned).toBe(count);
    expect(peak).toBeLessThanOrEqual(cap);
  });
});
