#!/usr/bin/env -S npx tsx
/**
 * scripts/defense-system-tests.ts — Mode 2 Phase 4 proof (headless).
 *
 *   A. The four defenses are DISTINCT: same attack, four different answers
 *      by timing/input, each with different state consequences.
 *   B. Guard impact no-sells a heavy (zero guard damage, long attacker
 *      stagger); a flick WITHOUT the timing fails; timing WITHOUT the
 *      flick is only a parry. Whiffed impact = self recovery.
 *   C. Substitution: chi cost, cooldown, teleport-behind geometry, and the
 *      vulnerability window (read-and-punish).
 *   D. Block chip → guard break path still works through the new layer.
 *
 * Run: npx tsx scripts/defense-system-tests.ts
 */

import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import {
  DefenseController, applyDefenseOutcome, GUARD_IMPACT_WINDOW_MS,
  GUARD_IMPACT_STAGGER_SEC, SUBSTITUTION_CHI_COST, SUBSTITUTION_COOLDOWN_SEC,
} from '../lib/babylon/core/DefenseSystem';
import { FighterState, KARATE_ATTACKS, PARRY_WINDOW_MS } from '../lib/babylon/core/FightCore';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const NOW = 10_000;

console.log('\nA. four distinct answers to the same heavy');
ok('none / block / parry / guard-impact are all different', () => {
  const atk = KARATE_ATTACKS.heavy;
  const fresh = () => ({ atk: new FighterState(), def: new FighterState(), dc: new DefenseController() });

  // 1. no defense
  let s = fresh();
  assert.equal(s.dc.resolve(atk, 1.5, false, NOW), 'none');
  assert.equal(applyDefenseOutcome('none', s.atk, s.def, atk), 'whiff');

  // 2. hold block (chips guard)
  s = fresh();
  s.def.pressBlock(NOW - 2000);                        // held long ago — no parry
  assert.equal(s.dc.resolve(atk, 1.5, true, NOW), 'blocked');
  assert.equal(applyDefenseOutcome('blocked', s.atk, s.def, atk), 'blocked');
  assert.ok(s.def.guard < 100, 'guard chipped');

  // 3. parry (timing-only tap)
  s = fresh();
  s.dc.pressBlock(NOW - PARRY_WINDOW_MS + 20, false);  // inside parry, no flick
  assert.equal(s.dc.resolve(atk, 1.5, true, NOW), 'parried');
  applyDefenseOutcome('parried', s.atk, s.def, atk);
  assert.ok(s.atk.staggerSec > 0.8 && s.atk.staggerSec < GUARD_IMPACT_STAGGER_SEC);

  // 4. guard impact (tighter window + flick toward foe)
  s = fresh();
  s.dc.pressBlock(NOW - GUARD_IMPACT_WINDOW_MS + 20, true);
  assert.equal(s.dc.resolve(atk, 1.5, true, NOW), 'guardImpacted');
  applyDefenseOutcome('guardImpacted', s.atk, s.def, atk);
  assert.equal(s.def.guard, 100, 'NO-SELL: zero guard damage');
  assert.ok(s.atk.staggerSec >= GUARD_IMPACT_STAGGER_SEC, 'long punish window');
});

console.log('\nB. guard impact precision');
ok('flick without timing is NOT an impact; timing without flick is a parry', () => {
  const atk = KARATE_ATTACKS.jab;
  const dc = new DefenseController();
  dc.pressBlock(NOW - PARRY_WINDOW_MS + 30, true);     // flick, but outside GI window
  assert.equal(dc.resolve(atk, 1.4, true, NOW), 'parried');
  const dc2 = new DefenseController();
  dc2.pressBlock(NOW - 40, false);                     // timing, no flick
  assert.equal(dc2.resolve(atk, 1.4, true, NOW), 'parried');
});
ok('whiffed impact leaves you open (self recovery)', () => {
  const dc = new DefenseController();
  dc.whiffImpact(NOW);
  assert.ok(dc.inImpactRecovery);
});

console.log('\nC. substitution');
ok('costs chi, respects cooldown, lands behind the attacker', () => {
  const dc = new DefenseController();
  assert.ok(!dc.canSubstitute(10, NOW), 'not enough chi');
  assert.ok(dc.canSubstitute(SUBSTITUTION_CHI_COST, NOW));
  dc.spendSubstitution(NOW);
  assert.ok(!dc.canSubstitute(100, NOW + 1000), 'cooldown');
  assert.ok(dc.canSubstitute(100, NOW + SUBSTITUTION_COOLDOWN_SEC * 1000 + 1));
  assert.ok(dc.vulnerableUntil > NOW, 'punishable window opened');
  const spot = DefenseController.substitutionSpot(new Vector3(0, 0, 0), 0);
  assert.ok(spot.z < -1, 'behind someone facing +Z');
});
ok('a read substitution eats COUNTER damage (applied by caller)', () => {
  // the vulnerability marker exists long enough to be punished
  const dc = new DefenseController();
  dc.spendSubstitution(NOW);
  const punishable = dc.vulnerableUntil - NOW;
  assert.ok(punishable >= 500 && punishable <= 800, `${punishable}ms punish window`);
});

console.log('\nD. block → guard break through the new layer');
ok('chips accumulate to a break + long stagger', () => {
  const atk = new FighterState(); const def = new FighterState();
  def.pressBlock(0);                                    // holding
  let out = '';
  for (let i = 0; i < 20 && out !== 'guardBreak'; i++) {
    out = applyDefenseOutcome('blocked', atk, def, KARATE_ATTACKS.heavy);
  }
  assert.equal(out, 'guardBreak');
  assert.ok(def.staggerSec > 1, 'long stagger on break');
});

console.log(`\n${pass} checks green`);
