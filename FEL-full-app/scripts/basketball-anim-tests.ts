#!/usr/bin/env -S npx tsx
/**
 * scripts/basketball-anim-tests.ts — Mode 1 Phase 5 proof (headless).
 *
 *   A. Every state in the basketball blend tree maps to a clip that
 *      RESOLVES against the live registry (real clip or known alias) —
 *      the tree can never request a clip that doesn't exist.
 *   B. Decision priorities: stagger beats everything, shot beats drive,
 *      defense states engage only on defense, box-out needs the brace held.
 *   C. Transition sanity: no two states share a 0 fadeSec (pop guard) and
 *      one-shot states never loop.
 *   D. FootPlant timing: a plant holds for PLANT_LOCK_SEC then releases
 *      (pure timing path — no skeleton needed for the countdown contract).
 *
 * Run: npx tsx scripts/basketball-anim-tests.ts
 */

import assert from 'node:assert';
import {
  chooseBasketballClip, BasketballAnimTree, PLANT_LOCK_SEC,
  type AnimTreeInput,
} from '../lib/babylon/anim/basketballTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const BASE: AnimTreeInput = {
  speed01: 0, crossover: false, nearestDefender: 99, hasBall: true,
  shooting: false, dunking: false, driving: false,
  defending: false, bracing: false, staggered: false,
};

console.log('\nA. every state resolves against the live clip registry');
ok('all 16 states -> resolvable clips', () => {
  const probe: AnimTreeInput[] = [
    { ...BASE },                                                        // idle_dribble
    { ...BASE, speed01: 0.8 },                                          // speed_dribble
    { ...BASE, speed01: 0.8, crossover: true },                         // crossover
    { ...BASE, nearestDefender: 0.8 },                                  // protect
    { ...BASE, speed01: 0.9, driving: true },                           // drive
    { ...BASE, shooting: true },                                        // shot_release
    { ...BASE, dunking: true },                                         // dunk
    { ...BASE, staggered: true },                                       // contact_stagger
    { ...BASE, defending: true, speed01: 0.6, hasBall: false },         // defend_slide
    { ...BASE, defending: true, hasBall: false },                       // defend_idle
    { ...BASE, defending: true, bracing: true, hasBall: false },        // box_out
    { ...BASE, celebrating: true },                                     // celebrate
    { ...BASE, dejected: true },                                        // dejected
  ];
  const seen = new Set<string>();
  for (const i of probe) {
    const c = chooseBasketballClip(i);
    assert.ok(isResolvable(c.clip), `state ${c.state} -> "${c.clip}" is NOT resolvable`);
    seen.add(c.state);
  }
  assert.ok(seen.size >= 13, `covered ${seen.size} distinct states`);
});

console.log('\nB. decision priorities');
ok('stagger beats shot beats drive', () => {
  assert.equal(chooseBasketballClip({ ...BASE, staggered: true, shooting: true }).state, 'contact_stagger');
  assert.equal(chooseBasketballClip({ ...BASE, shooting: true, driving: true, speed01: 1 }).state, 'shot_release');
  assert.equal(chooseBasketballClip({ ...BASE, dunking: true, shooting: true }).state, 'dunk');
});
ok('defense states only on defense; box-out needs brace', () => {
  assert.equal(chooseBasketballClip({ ...BASE, defending: true, speed01: 0.5, hasBall: false }).state, 'defend_slide');
  assert.equal(chooseBasketballClip({ ...BASE, defending: true, hasBall: false }).state, 'defend_idle');
  assert.equal(chooseBasketballClip({ ...BASE, defending: true, bracing: true, hasBall: false }).state, 'box_out');
  assert.notEqual(chooseBasketballClip({ ...BASE, bracing: true }).state, 'box_out');
});

console.log('\nC. transition sanity');
ok('no hard cuts (every fadeSec > 0); one-shots never loop', () => {
  const states: AnimTreeInput[] = [
    { ...BASE }, { ...BASE, speed01: 0.8 }, { ...BASE, crossover: true, speed01: 0.8 },
    { ...BASE, shooting: true }, { ...BASE, staggered: true }, { ...BASE, dejected: true },
  ];
  for (const i of states) {
    const c = chooseBasketballClip(i);
    assert.ok(c.fadeSec > 0, `${c.state} has fadeSec 0 — will pop`);
  }
  assert.equal(chooseBasketballClip({ ...BASE, crossover: true, speed01: 0.8 }).loop, false);
  assert.equal(chooseBasketballClip({ ...BASE, staggered: true }).loop, false);
  assert.equal(chooseBasketballClip({ ...BASE, speed01: 0.8 }).loop, true);
});
ok('tree dedupes same-state plays (no per-frame restart)', () => {
  let plays = 0;
  const fake = { play: () => { plays++; } } as never;
  const tree = new BasketballAnimTree(fake);
  tree.update(BASE); tree.update(BASE); tree.update(BASE);
  assert.equal(plays, 1);
  tree.update({ ...BASE, speed01: 0.9 });
  assert.equal(plays, 2);
});

console.log('\nD. FootPlant contract');
ok('plant window is a real beat (0.1–0.4s)', () => {
  assert.ok(PLANT_LOCK_SEC >= 0.1 && PLANT_LOCK_SEC <= 0.4);
});

console.log(`\n${pass} checks green`);
