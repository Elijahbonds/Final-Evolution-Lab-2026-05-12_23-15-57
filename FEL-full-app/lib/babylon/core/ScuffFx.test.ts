// THE SAME STOP MUST FIRE AT EVERY FRAME RATE (2026-09-14).
//
// The naive hard-stop detector compares this frame's speed to last frame's and fires on a big enough drop.
// That is frame-rate dependent: at 30 fps a stop shows a drop twice the size of the same stop at 60, so the
// effect appears on a slow machine and not on a fast one. The threshold has to be a DECELERATION, which is
// a property of the body rather than of the refresh rate — and this file is the proof.

import { describe, it, expect } from 'vitest';
import {
  tickScuff, scuffPuffScale, scuffVolume, SCUFF_IDLE,
  SCUFF_MIN_SPEED, SCUFF_MIN_DECEL, SCUFF_COOLDOWN_SEC,
} from './ScuffFx';

/** Run a stop from `from` to `to` m/s over `overSec`, simulated at `fps`. Returns total puffs + peak. */
function stopAt(fps: number, from: number, to: number, overSec: number) {
  const dt = 1 / fps;
  let st = { ...SCUFF_IDLE, prevSpeed: from };
  let fires = 0, peak = 0;
  const steps = Math.max(1, Math.round(overSec / dt));
  for (let i = 1; i <= steps; i++) {
    const speed = from + (to - from) * (i / steps);
    const r = tickScuff(st, speed, dt, true);
    st = r.state;
    if (r.strength > 0) { fires++; peak = Math.max(peak, r.strength); }
  }
  return { fires, peak };
}

describe('FRAME INDEPENDENCE', () => {
  it('the SAME stop fires at 30, 60 and 144 fps', () => {
    const results = [30, 60, 144].map((f) => stopAt(f, 7, 0, 0.12));
    for (const r of results) expect(r.fires).toBeGreaterThan(0);
  });

  it('and at roughly the same strength — the frame rate is not a difficulty setting', () => {
    const peaks = [30, 60, 144].map((f) => stopAt(f, 7, 0, 0.12).peak);
    const spread = Math.max(...peaks) - Math.min(...peaks);
    expect(spread, `peaks ${peaks.join(', ')}`).toBeLessThan(0.2);
  });

  it('a GENTLE slow-down fires at no frame rate', () => {
    // easing off over two seconds is not a cut, however many frames it is sampled in
    for (const fps of [30, 60, 144]) {
      expect(stopAt(fps, 7, 0, 2.0).fires, `${fps} fps`).toBe(0);
    }
  });

  it('a zero-length frame cannot manufacture an infinite deceleration', () => {
    const r = tickScuff({ prevSpeed: 9, cooldown: 0 }, 0, 0, true);
    expect(r.strength).toBe(0);
    expect(Number.isFinite(r.state.prevSpeed)).toBe(true);
  });
});

describe('what counts as a scuff', () => {
  // dt of a QUARTER SECOND, because that is how long a real athletic stop takes. An 8 -> 1 drop inside a
  // single 60 fps frame is 420 m/s², which saturates the scale — correctly, but it is not a stop anybody
  // performs, and testing against it measures the clamp rather than the curve.
  const hard = (prev: number, now: number, sec = 0.25) => tickScuff({ prevSpeed: prev, cooldown: 0 }, now, sec, true);

  it('a hard cut from speed scuffs', () => {
    expect(hard(8, 1).strength).toBeGreaterThan(0);     // 28 m/s^2 over a quarter second
  });

  it('walking does not, however abruptly it ends', () => {
    expect(hard(SCUFF_MIN_SPEED - 0.5, 0, 1 / 60).strength).toBe(0);
  });

  it('IN THE AIR NOTHING SCUFFS — that is the difference between a cut and the top of a jump', () => {
    expect(tickScuff({ prevSpeed: 9, cooldown: 0 }, 0, 1 / 60, false).strength).toBe(0);
  });

  it('speeding up never scuffs', () => {
    expect(hard(4, 9).strength).toBe(0);
  });

  it('harder stops are stronger, and it never exceeds 1', () => {
    const a = hard(5.5, 2).strength;        // ~14 m/s^2 … a firm slow-down
    const b = hard(9, 0).strength;          // ~36 m/s^2 … a planted cut
    expect(b).toBeGreaterThan(a);
    expect(hard(40, 0, 1 / 60).strength).toBeLessThanOrEqual(1);   // the clamp still holds at absurd values
  });
});

describe('ONE PUFF PER STOP', () => {
  it('a body decelerating for several frames emits once, not every frame', () => {
    let st = { ...SCUFF_IDLE, prevSpeed: 10 };
    let fires = 0;
    for (let i = 0; i < 12; i++) {
      const r = tickScuff(st, Math.max(0, 10 - i * 2.2), 1 / 60, true);
      st = r.state;
      if (r.strength > 0) fires++;
    }
    expect(fires).toBe(1);
  });

  it('and the cooldown is counted in SECONDS, so it is the same wait at any frame rate', () => {
    for (const fps of [30, 144]) {
      let st = { prevSpeed: 0, cooldown: SCUFF_COOLDOWN_SEC };
      let elapsed = 0;
      while (st.cooldown > 0 && elapsed < 5) { st = tickScuff(st, 0, 1 / fps, true).state; elapsed += 1 / fps; }
      expect(elapsed, `${fps} fps`).toBeGreaterThan(SCUFF_COOLDOWN_SEC - 0.05);
      expect(elapsed, `${fps} fps`).toBeLessThan(SCUFF_COOLDOWN_SEC + 0.05);
    }
  });
});

describe('the puff stays a puff', () => {
  it('scale and volume are bounded and rise with strength', () => {
    expect(scuffPuffScale(0)).toBeLessThan(scuffPuffScale(1));
    expect(scuffPuffScale(1)).toBeLessThan(1);
    expect(scuffVolume(1)).toBeLessThan(0.3);      // never competes with the whistle
    expect(scuffVolume(-5)).toBeGreaterThan(0);
    expect(scuffPuffScale(9)).toBeLessThanOrEqual(scuffPuffScale(1));
  });
});
