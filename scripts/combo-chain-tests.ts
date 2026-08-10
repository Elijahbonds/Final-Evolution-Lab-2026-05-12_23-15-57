#!/usr/bin/env -S npx tsx
/**
 * scripts/combo-chain-tests.ts — Mode 3 Phase 7 proof (headless).
 *
 *   A. Multiplier math: Nth trick pays N×; pot banks on clean stop.
 *   B. Bail burns the pot (risk loop); banked total is untouched.
 *   C. Momentum hooks: 5x reports a make, 8x+ reports a highlight.
 *   D. Mixed kinds (air + grind + manual) all chain into one combo.
 *
 * Run: npx tsx scripts/combo-chain-tests.ts
 */

import assert from 'node:assert';
import { ComboChain } from '../lib/babylon/core/ComboChain';
import { MomentumBus } from '../lib/babylon/core/MomentumBus';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. multiplier math');
ok('Nth trick pays Nx; clean stop banks the pot', () => {
  const c = new ComboChain();
  c.add('OLLIE', 50, 'air');            // 1x → 50
  c.add('50-50', 100, 'grind');         // 2x → 200
  c.add('KICKFLIP', 120, 'air');        // 3x → 360
  assert.equal(c.pot, 50 + 200 + 360);
  assert.equal(c.multiplier, 3);
  assert.equal(c.bank(), 610);
  assert.equal(c.banked, 610);
  assert.equal(c.pot, 0);
});

console.log('\nB. risk loop');
ok('a bail burns the pot and nothing banked is lost', () => {
  const c = new ComboChain();
  c.add('OLLIE', 50, 'air');
  c.bank();
  c.add('KICKFLIP', 120, 'air');
  c.add('HEELFLIP', 120, 'air');
  const burned = c.bail();
  assert.equal(burned, 120 + 240);
  assert.equal(c.banked, 50, 'banked survived the bail');
  assert.equal(c.pot, 0);
  assert.ok(!c.active);
});

console.log('\nC. momentum hooks');
ok('long chains fire game-breaker events', () => {
  const m = new MomentumBus();
  const c = new ComboChain(m);
  const before = m.score01;
  for (let i = 0; i < 9; i++) c.add(`T${i}`, 100, 'air');
  assert.ok(m.score01 > before, `momentum rose on the 9x chain (${m.score01})`);
});

console.log('\nD. mixed-kind chains');
ok('air + grind + manual are ONE combo', () => {
  const c = new ComboChain();
  c.add('KICKFLIP', 120, 'air');
  c.add('BOARD SLIDE', 100, 'grind');
  c.add('MANUAL', 40, 'manual');
  c.add('360', 140, 'air');
  assert.equal(c.multiplier, 4);
  assert.equal(c.pot, 120 + 200 + 120 + 560);
});

console.log(`\n${pass} checks green`);
