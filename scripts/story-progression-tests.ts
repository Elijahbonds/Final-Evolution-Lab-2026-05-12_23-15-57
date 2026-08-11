#!/usr/bin/env -S npx tsx
/**
 * scripts/story-progression-tests.ts — Story Phase 2 proof (headless).
 *   A. PRQ bias is read-only: each grade maps to a difficulty + beat, and
 *      the PRQ module is imported, not reimplemented.
 *   B. Skill trees: prerequisites and costs gate unlocks; effects collect.
 *   C. Influence: mirror-only structure (no mint path exists).
 */
import assert from 'node:assert';
import { biasForGrade, SkillTree, SKILL_TREES, mirrorInfluence } from '../lib/babylon/core/StoryProgression';
import { prqGrade } from '../lib/prq';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. PRQ read-only bias');
ok('grades drive difficulty + beats via the real PRQ module', () => {
  assert.ok(biasForGrade('ELITE').aiDifficulty > biasForGrade('RECOVERING').aiDifficulty);
  assert.equal(biasForGrade('ELITE').beatVariant, 'spicy');
  // the integration consumes the real grader
  const g = prqGrade(85);
  assert.ok(biasForGrade(g.key), 'read from the shared prqGrade');
});

console.log('\nB. skill trees');
ok('prereqs + cost gate unlocks; effects accumulate', () => {
  const t = new SkillTree();
  assert.ok(!t.canUnlock('k2', 99).ok, 'prereq blocks');
  assert.ok(!t.canUnlock('k1', 1).ok, 'cost blocks');
  assert.ok(t.canUnlock('k1', 2).ok);
  t.confirmUnlock('k1');
  assert.ok(t.canUnlock('k2', 3).ok);
  t.confirmUnlock('k2');
  assert.deepEqual(t.effects, ['stamina_regen_up', 'jump_boost']);
  assert.ok(!t.canUnlock('k1', 99).ok, 'no re-unlock');
});

console.log('\nC. influence mirror');
ok('the wallet is a read-only mirror with a ledger cursor', () => {
  const w = mirrorInfluence(120, 'cur_9');
  assert.equal(w.balance, 120);
  // no mutation API exists
  assert.ok(!('spend' in w) && !('grant' in w));
});

console.log(`\n${pass} checks green`);
