#!/usr/bin/env -S npx tsx
/**
 * scripts/golf-course-tests.ts — Golf Phase 3 proof (headless).
 *   A. The schema validates: the test course is legal; a hole with the pin
 *      off the green or a par/length mismatch fails loudly.
 *   B. surfaceAt resolves zones correctly (innermost wins, default fairway).
 *   C. toPin gives sane distances for club selection.
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { TEST_COURSE, validateCourse, validateHole, surfaceAt, toPin, type HoleDef } from '../lib/babylon/core/GolfCourse';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. schema validation');
ok('the test course is legal end-to-end', () => {
  assert.deepEqual(validateCourse(TEST_COURSE), []);
});
ok('a bad hole fails loudly', () => {
  const bad: HoleDef = { id: 'x', label: 'x', par: 3, lengthM: 500, tee: { x: 0, z: 0 }, pin: { x: 0, z: 490 }, zones: [] };
  const errs = validateHole(bad);
  assert.ok(errs.some((e) => e.includes('green')), 'pin off green flagged');
  assert.ok(errs.some((e) => e.includes('par 3')), 'par/length mismatch flagged');
});

console.log('\nB. surface resolution');
ok('zones resolve innermost; default is fairway', () => {
  const h = TEST_COURSE.holes[0];
  assert.equal(surfaceAt(h, 4, 320), 'green');
  assert.equal(surfaceAt(h, -3, 300), 'sand');
  assert.equal(surfaceAt(h, 25, 200), 'water');
  assert.equal(surfaceAt(h, 0, 150), 'fairway');
  assert.equal(surfaceAt(h, -20, 100), 'rough');
});

console.log('\nC. club selection distance');
ok('toPin is real', () => {
  const h = TEST_COURSE.holes[0];
  assert.ok(Math.abs(toPin(h, new Vector3(0, 0, 0)) - 320.3) < 1);
});

console.log(`\n${pass} checks green`);
