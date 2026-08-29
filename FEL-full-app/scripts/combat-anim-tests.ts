#!/usr/bin/env -S npx tsx
/**
 * scripts/combat-anim-tests.ts — Mode 2 Phase 5 proof (headless).
 *
 *   A. Every combat tree state resolves against the live clip registry.
 *   B. Priorities: KO beats everything, hit reactions beat striking,
 *      finisher reactions launch, block holds only when not mid-strike.
 *   C. Reaction weights are distinct states (light flinch vs launch).
 *   D. ResourceMeter: action gains, partial spend gating, full-bar
 *      ultimate, regen, no overspend.
 *
 * Run: npx tsx scripts/combat-anim-tests.ts
 */

import assert from 'node:assert';
import { chooseCombatClip, type CombatAnimInput } from '../lib/babylon/anim/combatTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';
import { ResourceMeter, CHI, CHAKRA } from '../lib/babylon/core/ResourceMeter';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const BASE: CombatAnimInput = {
  speed01: 0, dashing: false, hasWeapon: false, striking: null,
  blocking: false, parryFlash: false, guardImpactFlash: false,
  hitBy: null, down: false, out: false, ulting: false,
};

console.log('\nA. all states resolve');
ok('every reachable state -> resolvable clip', () => {
  const probes: CombatAnimInput[] = [
    { ...BASE }, { ...BASE, hasWeapon: true }, { ...BASE, speed01: 0.6 },
    { ...BASE, dashing: true },
    { ...BASE, striking: 'light' }, { ...BASE, striking: 'medium' },
    { ...BASE, striking: 'heavy' }, { ...BASE, striking: 'finisher' },
    { ...BASE, blocking: true }, { ...BASE, parryFlash: true },
    { ...BASE, guardImpactFlash: true },
    { ...BASE, hitBy: 'light' }, { ...BASE, hitBy: 'finisher' },
    { ...BASE, down: true }, { ...BASE, out: true }, { ...BASE, ulting: true },
    { ...BASE, celebrating: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseCombatClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0, `${c.state} hard-cut`);
    seen.add(c.state);
  }
  assert.equal(seen.size, 17, `all 17 states reachable, got ${seen.size}`);
});

console.log('\nB. priorities');
ok('KO > ultimate > hit-reaction > strike > dash > block > walk', () => {
  assert.equal(chooseCombatClip({ ...BASE, out: true, ulting: true, hitBy: 'heavy' }).state, 'ko');
  assert.equal(chooseCombatClip({ ...BASE, ulting: true, hitBy: 'heavy' }).state, 'ultimate');
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'light', striking: 'heavy' }).state, 'react_light');
  assert.equal(chooseCombatClip({ ...BASE, striking: 'light', dashing: true, blocking: true }).state, 'strike_light');
  assert.equal(chooseCombatClip({ ...BASE, dashing: true, blocking: true }).state, 'dash');
  assert.equal(chooseCombatClip({ ...BASE, blocking: true, speed01: 0.5 }).state, 'block_hold');
});

console.log('\nC. reaction weights');
ok('finisher launches, light flinches — different states', () => {
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'finisher' }).state, 'react_launch');
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'light' }).state, 'react_light');
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'heavy' }).state, 'react_heavy');
});

console.log('\nD. ResourceMeter');
ok('gains from actions; partial spends gate on balance', () => {
  const m = new ResourceMeter(CHI);
  m.gain('hitLanded');
  assert.equal(m.value, 10);
  assert.ok(!m.spend(25), 'cannot overspend');
  m.gain('guardImpact');
  assert.ok(m.spend(25), 'spends when funded');
  assert.equal(m.value, 3);
});
ok('ultimate requires a FULL bar and drains it', () => {
  const m = new ResourceMeter(CHAKRA);
  m.gain('hitLanded');
  assert.ok(!m.spendUltimate());
  for (let i = 0; i < 60 * 60; i++) m.update(1 / 60);   // regen to full
  assert.ok(m.full);
  assert.ok(m.spendUltimate());
  assert.equal(m.value, 0);
  assert.ok(!m.spendUltimate(), 'no double ultimate');
});

console.log(`\n${pass} checks green`);
