/**
 * scripts/facing-tests.ts
 * =======================
 * M13 game-feel verification for the shared character-facing system
 * (lib/anim/facing.ts).
 *
 * Proves the invariants the M13 facing spec calls out:
 *   1. faceYaw points a +Z-forward model along a direction (cardinal checks).
 *   2. shortestAngleDelta always takes the short way round the circle.
 *   3. slewToward never rotates faster than maxRate*dt, and converges.
 *   4. When ENGAGED, the character faces the target (dunk rim / karate foe).
 *   5. When MOVING and not engaged, the character faces its velocity
 *      (football runner faces down-field, not back-pedalling).
 *   6. Stationary + not engaged holds the last yaw (no snapping to 0).
 *   7. Turn-rate limit: reversing 180° takes ~ PI / rate seconds.
 *
 * Run: yarn tsx scripts/facing-tests.ts
 */

import assert from 'node:assert';
import {
  faceYaw, wrapAngle, shortestAngleDelta, slewToward,
  desiredFacingYaw, updateFacing, DEFAULT_TURN_RATE,
} from '../lib/anim/facing';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

check('faceYaw cardinal directions', () => {
  assert.ok(near(faceYaw(0, 1), 0), '+Z is yaw 0');
  assert.ok(near(faceYaw(1, 0), Math.PI / 2), '+X is yaw +PI/2');
  assert.ok(near(faceYaw(0, -1), Math.PI), '-Z is yaw PI');
  assert.ok(near(Math.abs(faceYaw(-1, 0)), Math.PI / 2), '-X is yaw -PI/2');
});

check('wrapAngle keeps values in (-PI, PI]', () => {
  assert.ok(near(wrapAngle(0), 0));
  assert.ok(near(wrapAngle(Math.PI), Math.PI));
  assert.ok(near(wrapAngle(-Math.PI), Math.PI));
  assert.ok(near(wrapAngle(3 * Math.PI), Math.PI));
  assert.ok(near(wrapAngle(1.5 * Math.PI), -0.5 * Math.PI));
});

check('shortestAngleDelta takes the short way round', () => {
  // from 170° to -170° should be +20° (crossing PI), not -340°
  const from = (170 * Math.PI) / 180;
  const to = (-170 * Math.PI) / 180;
  const d = shortestAngleDelta(from, to);
  assert.ok(near(Math.abs(d), (20 * Math.PI) / 180, 1e-6), `expected 20°, got ${(d * 180) / Math.PI}°`);
});

check('slewToward never exceeds maxRate*dt', () => {
  const dt = 1 / 60;
  const rate = DEFAULT_TURN_RATE;
  const maxStep = rate * dt;
  let cur = 0;
  const target = Math.PI; // demand a 180° turn
  for (let i = 0; i < 5; i++) {
    const next = slewToward(cur, target, rate, dt);
    const step = Math.abs(shortestAngleDelta(cur, next));
    assert.ok(step <= maxStep + 1e-9, `step ${step} exceeds max ${maxStep}`);
    cur = next;
  }
});

check('slewToward converges to target', () => {
  const dt = 1 / 60;
  let cur = 0;
  const target = 2.5;
  for (let i = 0; i < 600; i++) cur = slewToward(cur, target, DEFAULT_TURN_RATE, dt);
  assert.ok(near(cur, wrapAngle(target), 1e-3), `did not converge: ${cur}`);
});

check('ENGAGED faces the target (karate foe / dunk rim)', () => {
  // self at origin, target straight ahead on +X
  const y = desiredFacingYaw({
    current: 0, engaged: true,
    selfX: 0, selfZ: 0, targetX: 5, targetZ: 0, dt: 1 / 60,
  });
  assert.ok(y != null && near(y, Math.PI / 2), `expected +PI/2, got ${y}`);
});

check('MOVING (not engaged) faces velocity (football down-field)', () => {
  // running down-field toward -Z ⇒ yaw PI
  const y = desiredFacingYaw({ current: 0, velX: 0, velZ: -6, dt: 1 / 60 });
  assert.ok(y != null && near(Math.abs(y), Math.PI), `expected PI, got ${y}`);
});

check('ENGAGED overrides velocity', () => {
  // moving +Z but engaged with a target on +X ⇒ face target (+X)
  const y = desiredFacingYaw({
    current: 0, engaged: true, velX: 0, velZ: 8,
    selfX: 0, selfZ: 0, targetX: 4, targetZ: 0, dt: 1 / 60,
  });
  assert.ok(y != null && near(y, Math.PI / 2), `expected +PI/2, got ${y}`);
});

check('stationary + not engaged holds last yaw', () => {
  const y = desiredFacingYaw({ current: 1.234, velX: 0, velZ: 0, dt: 1 / 60 });
  assert.strictEqual(y, null);
  // updateFacing should then hold current
  const held = updateFacing({ current: 1.234, velX: 0, velZ: 0, dt: 1 / 60 });
  assert.ok(near(held, 1.234));
});

check('180° reversal respects turn-rate budget (~PI/rate seconds)', () => {
  const dt = 1 / 60;
  let cur = 0;
  const target = Math.PI;
  let t = 0;
  while (Math.abs(shortestAngleDelta(cur, target)) > 1e-3 && t < 2) {
    cur = slewToward(cur, target, DEFAULT_TURN_RATE, dt);
    t += dt;
  }
  const ideal = Math.PI / DEFAULT_TURN_RATE; // ~0.333s at 540°/s
  assert.ok(t >= ideal - 0.05 && t <= ideal + 0.05, `reversal took ${t.toFixed(3)}s, ideal ${ideal.toFixed(3)}s`);
});

console.log(`\n\u2705 facing-tests: ${passed} checks passed`);
