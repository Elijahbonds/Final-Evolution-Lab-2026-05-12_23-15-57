import { describe, expect, it } from 'vitest';
import { makeBigAirSession } from './big-air-skin';
import type { AirAttempt } from './air-session-core';

// HOTFIX (2026-09-24): AirTrick signs the rotation by the spin direction (d-pad left = backside = −1) and the landing
// points multiplied it straight in, so a stuck backside 360 paid (100 − 140) × 2 = −80 and the Big Air session score
// that ctx.end reports went DOWN for landing a harder trick. One real attempt through the Big Air skin, each way round.

const DT = 1 / 60;

/** Slope → kicker → spin started at take-off → planted on a whole turn → stick just before touchdown → the attempt. */
function oneAttempt(dir: 1 | -1): { attempt: AirAttempt; score: number } {
  const core = makeBigAirSession();
  let started = false, planted = false, stuck = false;
  for (let i = 0; i < 60 * 30 && core.state.attempts.length === 0; i++) {
    // test changed (IMPROVE 2026-10-06, Big Air item 8): the run-up strides (a good stride every ~260 ms) — coasted, the slope
    // now stops just short of the landing's speed window and the air knuckles (sketchy at best), which is not this pin
    if (core.state.phase === 'Run' && i % 16 === 0) core.runTap(i % 32 === 0 ? 'L' : 'R', 'good');
    core.step(DT);
    const s = core.state;
    if (s.phase !== 'Air') continue;
    if (!started) { core.setSpinDir(dir); core.trick(); started = true; continue; }
    if (!planted && Math.abs(core.airTrick.rotation) >= 0.99) { core.trick(); planted = true; }
    // ≤ ~100 ms out: inside the 220 ms window (test changed: measured over the landing slope's snow, not over y 0)
    if (planted && !stuck && s.vy < 0 && s.pos.y - core.surface.y(s.pos.z) <= -s.vy * 0.1) { core.stick(); stuck = true; }
  }
  expect(core.state.attempts).toHaveLength(1);
  return { attempt: core.state.attempts[0], score: core.state.score };
}

describe('Big Air landing points', () => {
  it('pays a stuck backside 360 the same as the mirrored frontside 360, and more than nothing', () => {
    const front = oneAttempt(1);
    const back = oneAttempt(-1);

    expect(front.attempt.grade).toBe('stuck');
    expect(back.attempt.grade).toBe('stuck');
    expect(back.attempt.rotations).toBeCloseTo(-front.attempt.rotations, 9);   // the log keeps the direction
    expect(back.attempt.rotations).toBeLessThan(-0.9);

    expect(back.attempt.pts).toBe(front.attempt.pts);
    expect(back.attempt.pts).toBeGreaterThan(0);
    expect(back.score).toBe(back.attempt.pts);
  });
});
