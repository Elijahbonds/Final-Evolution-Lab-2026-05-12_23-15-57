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
// DRIVEN OFF SKATE_GOALS, NOT OFF A COPY OF IT (2026-09-18). This used to complete four goals by hand and then assert
// `allDone`. BOARD-10PHASE P8 added the plaza's three signature gaps — the hubba, the bar over the gap, the wallride
// lip — and the check went red claiming the tracker was broken, when what it actually caught was its own hardcoded
// list falling four short of the table. A goal the proof does not know how to drive is a goal nobody proved, so the
// driver is per-KIND and the table supplies the rest: add a goal, and it is covered the day it lands.
const driveTo = (t: GoalTracker, g: (typeof SKATE_GOALS)[number], idPrefix: string): void => {
  switch (g.kind) {
    case 'score': t.report({ type: 'bank', value: g.target + 200 }); break;
    case 'combo': t.report({ type: 'comboLanded', value: g.target + 100 }); break;
    case 'gap': t.report({ type: 'gap', gapId: g.gapId }); break;
    case 'collect': for (let i = 0; i < g.target; i++) t.report({ type: 'collect', collectibleId: `${idPrefix}${i}` }); break;
  }
};

ok('every goal in the table completes through its own event path', () => {
  const kinds = new Set(SKATE_GOALS.map((g) => g.kind));
  assert.ok(kinds.size >= 4, `the table should exercise every goal kind (saw ${[...kinds].join(', ')})`);
  for (const g of SKATE_GOALS) {
    const t = new GoalTracker(SKATE_GOALS);
    assert.equal(t.doneCount, 0);
    driveTo(t, g, `${g.id}_`);
    const got = t.goals.find((x) => x.id === g.id)!;
    assert.ok(got.done, `goal "${g.id}" (${g.kind}) did not complete on its own event`);
  }
});

ok('every gap goal names a DISTINCT feature — no two goals on one rail', () => {
  const gapIds = SKATE_GOALS.filter((g) => g.kind === 'gap').map((g) => g.gapId);
  assert.ok(gapIds.every((id) => !!id), 'a gap goal with no gapId can never be completed');
  assert.equal(new Set(gapIds).size, gapIds.length, `duplicate gapIds: ${gapIds.join(', ')}`);
});

ok('the whole card can be cleared in one run', () => {
  const t = new GoalTracker(SKATE_GOALS);
  SKATE_GOALS.forEach((g, i) => driveTo(t, g, `c${i}_`));
  assert.ok(t.allDone, `cleared ${t.doneCount} of ${SKATE_GOALS.length}`);
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
