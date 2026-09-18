#!/usr/bin/env -S npx tsx
/**
 * scripts/field-run-tests.ts — Mode 6 Phases 6+7 proof (headless).
 *   A. Fielding: routine under a can of corn; a gap shot forces a dive;
 *      a high drive is off the wall; nobody catches a moonshot.
 *   B. Throws: strong arm beats a slow one; off-balance costs time.
 *   C. Baserunning: a good jump into a slow arm steals safely; a poor jump
 *      into a strong arm is out; tag-up only pays when the throw loses.
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { resolveCatch, throwTimeSec, resolveSteal, shouldTagUp, resolvePlayAtBase, type FielderState } from '../lib/babylon/core/FieldRun';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const F = (x: number, z: number): FielderState => ({ pos: new Vector3(x, 0, z), range: 1, armStrength01: 0.7 });

console.log('\nA. fielding');
ok('routine / diving / off-wall / no-play all reachable by geometry', () => {
  assert.equal(resolveCatch(F(0, 20), new Vector3(0.5, 0, 20.5), Vector3.Zero(), 1.2), 'routine');
  assert.equal(resolveCatch(F(0, 20), new Vector3(4, 0, 22), new Vector3(2, 0, 3), 1.4), 'diving');
  assert.equal(resolveCatch(F(0, 20), new Vector3(3.5, 0, 26), new Vector3(0, 0, 3), 2.8), 'offWall');
  assert.equal(resolveCatch(F(0, 20), new Vector3(0, 0, 21), Vector3.Zero(), 4.2), 'noPlay');
});

console.log('\nB. throws');
ok('arm strength and balance set the throw time', () => {
  const strong = throwTimeSec({ pos: Vector3.Zero(), range: 1, armStrength01: 1, moving01: 0 }, new Vector3(0, 0, 0), new Vector3(0, 0, 27));
  const weak = throwTimeSec({ pos: Vector3.Zero(), range: 1, armStrength01: 0.1, moving01: 0 }, new Vector3(0, 0, 0), new Vector3(0, 0, 27));
  const offBalance = throwTimeSec({ pos: Vector3.Zero(), range: 1, armStrength01: 1, moving01: 1 }, new Vector3(0, 0, 0), new Vector3(0, 0, 27));
  assert.ok(strong < weak && strong < offBalance);
});

console.log('\nC. baserunning risk');
ok('steals resolve against the catcher; tag-ups against the throw', () => {
  const fast = { pos: Vector3.Zero(), speed: 8.5, lead01: 0.8 };
  const slow = { pos: Vector3.Zero(), speed: 6.5, lead01: 0.1 };
  assert.ok(resolveSteal(fast, 0.3, 33).safe, 'good jump, slow arm = safe');
  assert.ok(!resolveSteal(slow, 0.95, 42).safe, 'poor jump, strong arm = out');
  assert.ok(shouldTagUp(fast, 90, 0.2), 'deep fly, weak arm = go');
  assert.ok(!shouldTagUp(fast, 20, 0.95), 'shallow + cannon = hold');
  assert.equal(resolvePlayAtBase(1.2, 1.3), 'safe');
  assert.equal(resolvePlayAtBase(1.4, 1.3), 'out');
});

console.log(`\n${pass} checks green`);
