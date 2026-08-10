#!/usr/bin/env -S npx tsx
/**
 * scripts/showdown-mode-tests.ts — Mode 2 Phase 6 proof (headless).
 *
 *   A. Mode contract: registered in the registry, right id/preset.
 *   B. The composed systems interlock correctly under a simulated fight
 *      (StrikeController × DefenseController × ResourceMeter ×
 *      CombatMovement at the same call sites the mode uses).
 *   C. Showdown economics: dash-cancel spends chi, substitution requires
 *      chi + an incoming strike, the ultimate requires a FULL bar.
 *
 * Run: npx tsx scripts/showdown-mode-tests.ts
 */

import assert from 'node:assert';
import { MODES } from '../lib/babylon/modes/registry';
import { StrikeController, karateMoveset } from '../lib/babylon/core/StrikeSystem';
import { DefenseController, SUBSTITUTION_CHI_COST } from '../lib/babylon/core/DefenseSystem';
import { ResourceMeter, CHAKRA } from '../lib/babylon/core/ResourceMeter';
import { CombatMovement } from '../lib/babylon/core/CombatMovement';
import { FighterState, KARATE_ATTACKS } from '../lib/babylon/core/FightCore';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

console.log('\nA. mode contract');
ok('showdown is registered with the fight preset', () => {
  const m = MODES.showdown;
  assert.ok(m, 'registered');
  assert.equal(m.modeId, 'showdown');
  assert.equal(m.camPreset, 'fight');
});

console.log('\nB. composed systems interlock');
ok('a full exchange: dash in → combo → rival parries → meter economy holds', () => {
  const me = new FighterState(100);
  const myStrikes = new StrikeController(karateMoveset(KARATE_ATTACKS));
  const myMove = new CombatMovement();
  const foeDef = new DefenseController();
  const chakra = new ResourceMeter(CHAKRA);

  for (let i = 0; i < 600; i++) chakra.update(DT);   // regen to full
  assert.ok(chakra.spend(12), 'dash-cancel affordable at full bar');
  assert.ok(myMove.dash(0, 1));
  assert.ok(myMove.dashing);

  while (myMove.dashing) myMove.update(DT, 0, 0, false);
  myStrikes.request('jab', 0);
  let t = 0;
  while (myStrikes.current && myStrikes.current.phase !== 'active') { myStrikes.update(DT, t); t += DT; }
  const outcome = foeDef.resolve(KARATE_ATTACKS.jab, 1.2, false, 10_000);
  assert.equal(outcome, 'none');
  chakra.gain('hitLanded');
  assert.ok(chakra.value > 0);

  const parryDef = new DefenseController();
  parryDef.pressBlock(10_000, false);
  assert.equal(parryDef.resolve(KARATE_ATTACKS.kick, 1.5, true, 10_000), 'parried');
});

console.log('\nC. showdown economics');
ok('substitution needs chi; ultimate needs a full bar', () => {
  const chakra = new ResourceMeter(CHAKRA);
  const def = new DefenseController();
  assert.ok(!def.canSubstitute(chakra.value, 0), 'no chi, no substitution');
  for (let i = 0; i < 600; i++) chakra.update(DT);
  assert.ok(chakra.value >= SUBSTITUTION_CHI_COST);
  assert.ok(def.canSubstitute(chakra.value, SUBSTITUTION_CHI_COST));
  chakra.spend(SUBSTITUTION_CHI_COST);
  def.spendSubstitution(SUBSTITUTION_CHI_COST);
  assert.ok(!def.canSubstitute(chakra.value, SUBSTITUTION_CHI_COST + 100), 'on cooldown');
  assert.ok(!chakra.spendUltimate(), 'ultimate refused below full bar');
  for (let i = 0; i < 6000; i++) chakra.update(DT);
  assert.ok(chakra.spendUltimate(), 'ultimate fires at full bar');
  assert.equal(chakra.value, 0);
});

console.log(`\n${pass} checks green`);
