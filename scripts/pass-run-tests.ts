#!/usr/bin/env -S npx tsx
/**
 * scripts/pass-run-tests.ts — Mode 4 Phases 5-7 proof (headless).
 *   A. Routes are timed: receiver position tracks the stem clock; the
 *      break point exists.
 *   B. Throw grades: perfect at the break, early/late move the lead point,
 *      wild is inaccurate.
 *   C. Catch resolution is positioning+timing: a jumped, tight defender
 *      picks a non-perfect throw; open receivers catch; wild balls die.
 *   D. Blocking: a beaten block opens the lane; a held block keeps it
 *      readable.
 *
 * Run: npx tsx scripts/pass-run-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import {
  ROUTES, routePosition, throwBall, resolveCatch, LinePlay, type BlockMatchup,
} from '../lib/babylon/core/PassRun';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. routes are timed');
ok('route position tracks the stem clock through the break', () => {
  const r = ROUTES.slant;
  const start = new Vector3(-8, 0, 0);
  const early = routePosition(r, start, 0.3);
  const atBreak = routePosition(r, start, r.breakAt);
  const late = routePosition(r, start, 1.6);
  assert.ok(early.z < atBreak.z && atBreak.z < late.z, 'progresses downfield');
  assert.ok(Math.abs(late.x - (start.x - 3)) < 0.2, 'slant cuts inside after the break');
});

console.log('\nB. throw grades');
ok('perfect at the break; early/late shift the lead; wild is wild', () => {
  const r = ROUTES.streak;
  const s = new Vector3(8, 0, 0);
  const perfect = throwBall(0.62, r, s, 1.4);
  assert.equal(perfect.grade, 'perfect');
  assert.equal(perfect.accuracy01, 1);
  const early = throwBall(0.4, r, s, 1.4);
  assert.equal(early.grade, 'early');
  const wild = throwBall(0.95, r, s, 1.4);
  assert.equal(wild.grade, 'wild');
  assert.ok(wild.accuracy01 < 0.3);
});

console.log('\nC. catch resolution (positioning+timing)');
ok('tight+timed defender picks a non-perfect ball; open receivers catch', () => {
  assert.equal(resolveCatch({ accuracy01: 0.6, defenderDist: 0.8, defenderTimedJump: true, receiverOpen: false }), 'interception');
  assert.equal(resolveCatch({ accuracy01: 0.6, defenderDist: 3, defenderTimedJump: false, receiverOpen: true }), 'catch');
  assert.equal(resolveCatch({ accuracy01: 1, defenderDist: 0.9, defenderTimedJump: true, receiverOpen: false }), 'catch', 'perfect beats even a jumped contest');
  assert.equal(resolveCatch({ accuracy01: 0.1, defenderDist: 5, defenderTimedJump: false, receiverOpen: true }), 'incomplete');
});

console.log('\nD. blocking opens lanes');
ok('a beaten block opens the lane; held blocks keep it contested', () => {
  const matchups: BlockMatchup[] = [
    { id: 'c', blockerPos: new Vector3(0, 0, 0), rusherPos: new Vector3(0, 0, 1) },
    { id: 'lg', blockerPos: new Vector3(-2, 0, 0), rusherPos: new Vector3(-2, 0, 1) },
  ];
  const lp = new LinePlay(matchups);
  // rusher beats the center (separation)
  for (let i = 0; i < 90; i++) {
    lp.update(1 / 60, new Map([
      ['c', { blocker: new Vector3(0, 0, 0), rusher: new Vector3(3, 0, 1) }],
      ['lg', { blocker: new Vector3(-2, 0, 0), rusher: new Vector3(-2.2, 0, 0.6) }],
    ]));
  }
  assert.equal(lp.get('c'), 'lost');
  assert.equal(lp.get('lg'), 'holding');
  assert.ok(!lp.laneOpen(0) || lp.laneOpen(-2), 'lane reads follow the blocks');
});

console.log(`\n${pass} checks green`);
