#!/usr/bin/env -S npx tsx
/**
 * scripts/park-goals-tests.ts — Mode 3 Phase 11 proof (headless).
 *   A. Three+ distinct goal kinds complete via their own event paths.
 *   B. Goals don't double-complete.
 *   C. The moving rail patrols (its grind line moves) and oscillates.
 *
 * Run: npx tsx scripts/park-goals-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { GoalTracker, MovingRail, SKATE_GOALS } from '../lib/babylon/core/ParkGoals';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. goal kinds');
ok('score / combo / gap / collect all complete through their own paths', () => {
  const t = new GoalTracker(SKATE_GOALS);
  assert.equal(t.doneCount, 0);
  t.report({ type: 'bank', value: 5200 });
  assert.ok(t.goals.find((g) => g.id === 'score5k')!.done);
  t.report({ type: 'comboLanded', value: 900 });
  assert.ok(t.goals.find((g) => g.id === 'combo800')!.done);
  t.report({ type: 'gap', gapId: 'moving_rail' });
  assert.ok(t.goals.find((g) => g.id === 'gap_moving')!.done);
  for (let i = 0; i < 10; i++) t.report({ type: 'collect', collectibleId: `c${i}` });
  assert.ok(t.goals.find((g) => g.id === 'coins10')!.done);
  assert.ok(t.allDone);
});

console.log('\nB. no double-complete');
ok('a completed goal never re-fires', () => {
  const t = new GoalTracker(SKATE_GOALS);
  t.report({ type: 'bank', value: 6000 });
  const again = t.report({ type: 'bank', value: 9999 });
  assert.equal(again.length, 0);
});

console.log('\nC. the moving rail gimmick');
ok('the rail patrols (grind line moves) and oscillates', () => {
  const r = new MovingRail(new Vector3(-2, 0.5, 0), new Vector3(2, 0.5, 0), new Vector3(0, 0, -8), new Vector3(0, 0, 8), 0.5);
  const z0 = r.line.a.z;
  for (let i = 0; i < 60; i++) r.update(1 / 60);
  const z1 = r.line.a.z;
  assert.ok(Math.abs(z1 - z0) > 0.2, `rail moved (${z0.toFixed(1)} → ${z1.toFixed(1)})`);
  for (let i = 0; i < 600; i++) r.update(1 / 60);   // 10s — must bounce, not run off
  assert.ok(r.line.a.z >= -8.01 && r.line.a.z <= 8.01, 'patrol stays on its track');
});

console.log(`\n${pass} checks green`);
