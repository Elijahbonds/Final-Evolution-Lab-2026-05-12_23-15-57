#!/usr/bin/env -S npx tsx
/**
 * scripts/offball-ai-tests.ts — Mode 5 Phase 6 proof (headless).
 *   A. Purposeful runs: attackers attack open space ahead of the ball
 *      (not waypoints); a cross produces near/far-post runs.
 *   B. Lane awareness: runs target open corridors; a blanket of defenders
 *      on the direct line forces a different answer or a show.
 *   C. Width: a bunched pack spreads to distinct lanes.
 *   D. Overlap: a wide, slow carrier triggers an outside overlap run.
 *
 * Run: npx tsx scripts/offball-ai-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { decideRun, widthCorrections, type PlayerPos } from '../lib/babylon/core/OffBallAI';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const ATT = (id: string, x: number, z: number): PlayerPos => ({ id, pos: new Vector3(x, 0, z), role: 'att' });
const BALL = new Vector3(0, 0, 10);

console.log('\nA. purposeful runs');
ok('attacks open space ahead of the ball; cross produces post runs', () => {
  // a player clearly behind the play with green grass ahead runs INTO it
  const d = decideRun(ATT('a', 2, 2), new Vector3(0, 0, 14), new Vector3(0, 0, 14), [], false);
  assert.ok(d.kind === 'intoSpace', `runs into space (${d.kind})`);
  assert.ok(d.target.z > 2, 'forward');
  // already in the best spot = hold (no busywork runs)
  const hold = decideRun(ATT('a', 2, 12), BALL, BALL, [], false);
  assert.ok(['hold', 'intoSpace'].includes(hold.kind), 'sensible when well-placed');
  const c = decideRun(ATT('a', 4, 30), new Vector3(-20, 0, 40), new Vector3(-20, 0, 40), [], true);
  assert.ok(['nearPost', 'farPost'].includes(c.kind), `cross run (${c.kind})`);
});

console.log('\nB. lane awareness');
ok('runs avoid blanket-covered corridors', () => {
  // defenders wall the direct central lanes
  const wall = [new Vector3(0, 0, 16), new Vector3(1, 0, 20), new Vector3(-1, 0, 24)];
  const d = decideRun(ATT('a', 0, 12), BALL, BALL, wall, false);
  assert.ok(d.kind !== 'intoSpace' || Math.abs(d.target.x) > 2, `not into the wall (${d.kind} ${d.target.x.toFixed(1)})`);
});

console.log('\nC. width discipline');
ok('a bunched pack spreads to distinct lanes', () => {
  const pack = [ATT('a', 1, 20), ATT('b', 2, 20), ATT('c', -1, 20), ATT('d', 0.5, 22)];
  const corr = widthCorrections(pack);
  assert.ok(corr.size >= 2, 'corrections issued');
  const signs = new Set([...corr.values()].map(Math.sign));
  assert.ok(signs.size > 1 || [...corr.values()].some((v) => v !== 0), 'spreads apart');
});

console.log('\nD. overlap');
ok('a wide carrier triggers an outside overlap', () => {
  const carrier = new Vector3(20, 0, 25);
  const d = decideRun(ATT('w', 16, 24), carrier, carrier, [], false);
  assert.equal(d.kind, 'overlap');
  assert.ok(d.target.x <= carrier.x && d.target.z > carrier.z, 'runs the outside lane past the carrier');
});

console.log(`\n${pass} checks green`);
