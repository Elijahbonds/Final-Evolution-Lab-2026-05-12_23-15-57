#!/usr/bin/env -S npx tsx
/**
 * scripts/soccer-defense-tests.ts — Mode 5 Phase 7 proof (headless).
 *   A. Press triggers on a slow carrier / cornered ball / protecting the
 *      box; a composed carrier in space gets jockeyed; out-of-shape
 *      recovers home.
 *   B. Tackling: standing is safe in range; slide reaches further but a
 *      from-behind slide is a FOUL; a played-away ball is a miss.
 *   C. Offside: beyond the second-last defender in the attacking half at
 *      the pass moment = off; level with ball or own half = on.
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { decideDefense, resolveTackle, isOffside } from '../lib/babylon/core/SoccerDefense';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. press vs hold');
ok('slow carrier = press; composed in space = jockey; out of shape = recover', () => {
  const home = new Vector3(0, 0, 30);
  const ball = new Vector3(0, 0, 34);
  assert.equal(decideDefense(new Vector3(0, 0, 32), home, ball, 0.4, true, 45).action, 'press');
  assert.equal(decideDefense(new Vector3(2, 0, 26), home, new Vector3(0, 0, 29), 6, true, 45).action, "jockey");
  assert.equal(decideDefense(new Vector3(-8, 0, 20), home, ball, 5, true, 45).action, 'recover');
});

console.log('\nB. tackling');
ok('standing in range wins; slide reaches further; from-behind slide fouls', () => {
  assert.equal(resolveTackle({ kind: 'standing', distToBall: 0.7, fromBehind: false, ballMoved: false }), 'won');
  assert.equal(resolveTackle({ kind: 'standing', distToBall: 1.4, fromBehind: false, ballMoved: false }), 'missed');
  assert.equal(resolveTackle({ kind: 'slide', distToBall: 1.4, fromBehind: false, ballMoved: false }), 'won');
  assert.equal(resolveTackle({ kind: 'slide', distToBall: 1.0, fromBehind: true, ballMoved: false }), 'foul');
  assert.equal(resolveTackle({ kind: 'slide', distToBall: 1.2, fromBehind: false, ballMoved: true }), 'missed');
});

console.log('\nC. offside');
ok('past the second-last defender in the attacking half = off', () => {
  const defs = [new Vector3(0, 0, 40), new Vector3(2, 0, 36), new Vector3(-2, 0, 34)];
  assert.ok(isOffside(new Vector3(0, 0, 37), new Vector3(0, 0, 20), defs, 90), 'past second-last (z=36)');
  assert.ok(!isOffside(new Vector3(0, 0, 35), new Vector3(0, 0, 20), defs, 90), 'level = on');
  assert.ok(!isOffside(new Vector3(0, 0, 30), new Vector3(0, 0, 20), defs, 90), 'own half');
  assert.ok(!isOffside(new Vector3(0, 0, 44), new Vector3(0, 0, 44.5), defs, 90), 'level with the ball');
});

console.log(`\n${pass} checks green`);
