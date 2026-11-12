// Med-ball release speed from the wrist path: a wind-up, a throw that accelerates to a known speed, the hand stopping
// as the ball leaves (the separation cue). The wind-up's slower swing is not a release.
import { describe, expect, it } from 'vitest';
import { readThrows } from './medball';
import { rng } from './rng';
import type { Track } from './track';

/** A wrist path (m) at `fps`: rest, a wind-up back (2 m/s, gently slowing), then a throw to `speed` at `angle`, and a stop. */
function throwTrack(speed: number, angleDeg: number, fps: number, seed = 1, sdM = 0.004): Track {
  const R = rng(seed);
  const a = (angleDeg * Math.PI) / 180;
  const samples: Track['samples'] = [];
  let x = 0, y = 0;
  for (let t = 0; t < 3000; t += 1000 / fps) {
    let vx = 0, vy = 0;
    if (t >= 800 && t < 1200) { const s = 2 * Math.sin((Math.PI * (t - 800)) / 400); vx = -s * 0.8; vy = -s * 0.2; }       // wind-up, back and down
    if (t >= 1400 && t < 1700) { const s = speed * ((t - 1400) / 300) ** 1.5; vx = s * Math.cos(a); vy = s * Math.sin(a); }  // the throw
    if (t >= 1700 && t < 1760) { const s = speed * (1 - (t - 1700) / 60); vx = s * Math.cos(a); vy = s * Math.sin(a); }     // the hand stops
    x += (vx * 1000) / fps / 1000; y += (vy * 1000) / fps / 1000;
    samples.push({ t, x: x + R.n() * sdM, y: y + R.n() * sdM });
  }
  return { source: 'pose', ruler: { mPerUnit: 2, sd: 0.035, from: 'height' }, posSdM: sdM, samples };
}

describe('readThrows', () => {
  it.each([[60, 5], [120, 7], [240, 9]])('at %i fps: one throw at %i m/s, within its ±, at the right angle', (fps, speed) => {
    const { throws } = readThrows(throwTrack(speed, 30, fps));
    expect(throws).toHaveLength(1);
    const t = throws[0];
    expect(Math.abs(t.speed - speed)).toBeLessThan(speed * 0.12);
    expect(Math.abs(t.speed - speed)).toBeLessThanOrEqual(t.speedPm);
    expect(Math.abs(t.angleDeg - 30)).toBeLessThanOrEqual(8);
    expect(t.releaseT).toBeGreaterThan(1600);
    expect(t.releaseT).toBeLessThan(1760);
  });

  it('the wind-up (2 m/s, slowing gently) and a still wrist are not releases', () => {
    const tr = throwTrack(1.5, 30, 60);      // the "throw" itself under MB_MIN_SPEED
    expect(readThrows(tr).throws).toHaveLength(0);
  });
});
