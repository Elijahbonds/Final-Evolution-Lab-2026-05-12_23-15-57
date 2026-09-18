// THE LENS MUST SETTLE AT THE SAME RATE ON EVERY MONITOR (2026-09-14).
//
// `fov += (target - fov) * 0.1` is the line everybody writes for a smoothed camera value. Run it at 144 fps
// and it converges 2.4× faster than at 60 — the lens snaps on a good machine and drifts on a bad one, and
// the mode feels different for no reason the player can name. `1 - exp(-dt / TAU)` is the same curve in
// wall-clock time at any frame rate, and the fps-parity test below is the reason this file exists.

import { describe, it, expect } from 'vitest';
import {
  speedFovTarget, stepSpeedFov,
  SPEED_FOV_GAIN, SPEED_FOV_FLOOR01, SPEED_FOV_TAU,
} from './SpeedFov';

const BASE = 0.8;          // radians, a typical resting fov
const TOP = 40;            // m/s, a kart

/** Hold `speed` for `sec` seconds at `fps` and report where the lens ended up. */
function settle(fps: number, sec: number, speed: number, from = BASE): number {
  const dt = 1 / fps;
  let fov = from;
  for (let i = 0, n = Math.round(sec * fps); i < n; i++) fov = stepSpeedFov(fov, BASE, speed, TOP, dt);
  return fov;
}

describe('SpeedFov — the ramp', () => {
  it('does nothing at rest, and nothing while cruising below the floor', () => {
    expect(speedFovTarget(0, TOP)).toBe(1);
    expect(speedFovTarget(TOP * SPEED_FOV_FLOOR01 * 0.5, TOP)).toBe(1);
  });

  it('opens to exactly the advertised gain at top speed', () => {
    expect(speedFovTarget(TOP, TOP)).toBeCloseTo(SPEED_FOV_GAIN, 6);
    expect(speedFovTarget(TOP * 3, TOP)).toBeCloseTo(SPEED_FOV_GAIN, 6);   // clamped, never a fisheye
  });

  it('starts from zero at the floor instead of stepping straight to a visible width', () => {
    const atFloor = speedFovTarget(TOP * SPEED_FOV_FLOOR01, TOP);
    const justOver = speedFovTarget(TOP * (SPEED_FOV_FLOOR01 + 0.01), TOP);
    expect(atFloor).toBe(1);
    expect(justOver - 1).toBeLessThan(0.01);
  });

  it('is monotonic across the whole range', () => {
    let prev = 0;
    for (let s = 0; s <= TOP; s += TOP / 40) {
      const v = speedFovTarget(s, TOP);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  // DECISION 1: normalised against the mode's OWN top speed.
  it('gives a skater at flat out the same kick as a kart at flat out', () => {
    expect(speedFovTarget(11, 11)).toBeCloseTo(speedFovTarget(40, 40), 6);
    // and half-throttle reads the same in both disciplines
    expect(speedFovTarget(5.5, 11)).toBeCloseTo(speedFovTarget(20, 40), 6);
  });

  it('refuses a nonsense top speed rather than dividing by it', () => {
    expect(speedFovTarget(10, 0)).toBe(1);
    expect(speedFovTarget(10, -5)).toBe(1);
    expect(speedFovTarget(NaN, TOP)).toBe(1);
  });
});

describe('SpeedFov — the smoothing', () => {
  // THE POINT OF THE MODULE.
  it('settles to the same fov in the same wall-clock time at 30, 60 and 144 fps', () => {
    for (const sec of [0.1, 0.22, 0.5]) {
      const a = settle(30, sec, TOP), b = settle(60, sec, TOP), c = settle(144, sec, TOP);
      expect(Math.abs(a - b)).toBeLessThan(0.004);
      expect(Math.abs(b - c)).toBeLessThan(0.004);
    }
  });

  it('covers roughly 63% of the distance in one time constant', () => {
    const want = BASE * SPEED_FOV_GAIN;
    const after = settle(60, SPEED_FOV_TAU, TOP);
    expect((after - BASE) / (want - BASE)).toBeCloseTo(0.63, 1);
  });

  it('reaches the target exactly rather than humming just short of it', () => {
    expect(settle(60, 3, TOP)).toBe(BASE * SPEED_FOV_GAIN);
    expect(settle(60, 3, 0, BASE * SPEED_FOV_GAIN)).toBe(BASE);
  });

  it('comes back down when the speed does', () => {
    const wide = settle(60, 2, TOP);
    expect(wide).toBeGreaterThan(BASE);
    let fov = wide;
    for (let i = 0; i < 120; i++) fov = stepSpeedFov(fov, BASE, 0, TOP, 1 / 60);
    expect(fov).toBe(BASE);
  });

  it('never exceeds the gain even when handed a huge first frame', () => {
    const fov = stepSpeedFov(BASE, BASE, TOP, TOP, 5);
    expect(fov).toBeLessThanOrEqual(BASE * SPEED_FOV_GAIN + 1e-9);
  });

  it('a zero-length frame leaves the lens alone', () => {
    expect(stepSpeedFov(BASE, BASE, TOP, TOP, 0)).toBe(BASE);
    expect(stepSpeedFov(BASE, BASE, TOP, TOP, NaN)).toBe(BASE);
  });
});
