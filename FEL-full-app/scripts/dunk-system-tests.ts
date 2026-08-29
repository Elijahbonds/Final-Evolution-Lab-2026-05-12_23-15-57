#!/usr/bin/env -S npx tsx
/**
 * scripts/dunk-system-tests.ts — Mode 1 Phase 6 proof (headless).
 *
 *   A. GestureRecognizer: THPS2-style d-pad-direction-held + face-button-tap
 *      combos resolve to the right trick; releasing the direction or
 *      pressing with no direction held recognizes nothing.
 *   B. DunkFlight: launch budgets airtime by approach+style; tricks spend
 *      window; combo detection; finish outcomes by accuracy; slam window.
 *   C. Every trick clip resolves against the live registry.
 *   D. MomentumBus: tiers, multiplier bounds, decay, tier-change events.
 *
 * Run: npx tsx scripts/dunk-system-tests.ts
 */

import assert from 'node:assert';
import {
  GestureRecognizer, DunkFlight, DUNK_TRICKS, COMBO_CHAIN_BONUS,
} from '../lib/babylon/core/DunkSystem';
import { MomentumBus } from '../lib/babylon/core/MomentumBus';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';
import type { FelInput } from '../lib/babylon/core/InputBus';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const dpad = (dir: 'up' | 'down' | 'left' | 'right', pressed: boolean): FelInput => ({ t: 'dpad', dir, pressed });
const btn = (b: 'A' | 'B' | 'X' | 'Y', pressed: boolean): FelInput => ({ t: 'button', btn: b, pressed });

console.log('\nA. trick input recognition');
ok('windmill: hold UP, tap A', () => {
  const g = new GestureRecognizer();
  g.feed(dpad('up', true));
  assert.equal(g.feed(btn('A', true))?.id, 'windmill');
});
ok('360: hold RIGHT, tap B', () => {
  const g = new GestureRecognizer();
  g.feed(dpad('right', true));
  assert.equal(g.feed(btn('B', true))?.id, 'spin360');
});
ok('eastbay vs tomahawk: same direction, different button disambiguates', () => {
  const g = new GestureRecognizer();
  g.feed(dpad('down', true));
  assert.equal(g.feed(btn('Y', true))?.id, 'eastbay');
  const h = new GestureRecognizer();
  h.feed(dpad('up', true));
  assert.equal(h.feed(btn('Y', true))?.id, 'tomahawk');
});
ok('between the legs: hold DOWN, tap B', () => {
  const g = new GestureRecognizer();
  g.feed(dpad('down', true));
  assert.equal(g.feed(btn('B', true))?.id, 'betweenlegs');
});
ok('no direction held — bare button press recognizes nothing', () => {
  const g = new GestureRecognizer();
  assert.equal(g.feed(btn('A', true)), null);
});
ok('direction released before the button press — no trick', () => {
  const g = new GestureRecognizer();
  g.feed(dpad('up', true));
  g.feed(dpad('up', false));
  assert.equal(g.feed(btn('A', true)), null);
});
ok('X is reserved (inert) — no combo uses it', () => {
  const g = new GestureRecognizer();
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    g.reset();
    g.feed(dpad(dir, true));
    assert.equal(g.feed(btn('X', true)), null);
  }
});

console.log('\nB. dunk flight');
ok('launch budgets airtime; slam window opens late', () => {
  const f = new DunkFlight();
  f.launch(1, 8);                                     // max approach + sig style
  assert.equal(f.phase, 'airborne');
  for (let i = 0; i < 40; i++) f.update(1 / 60);      // 0.66s
  assert.ok(f.airRemaining01 < 0.7 && f.airRemaining01 > 0);
  while (f.phase === 'airborne') f.update(1 / 60);
  assert.equal(f.phase, 'slamWindow');
});
ok('tricks spend the window and build difficulty; two = combo', () => {
  const f = new DunkFlight();
  f.launch(0.8, 3);
  const before = f.airRemaining01;
  f.feedInput(dpad('up', true));
  const t1 = f.feedInput(btn('A', true));
  assert.equal(t1?.id, 'windmill');
  f.update(1 / 60);
  const after1 = f.airRemaining01;
  assert.ok(after1 < before, 'trick spent air window');
  f.feedInput(dpad('up', false));
  f.feedInput(dpad('right', true));
  const t2 = f.feedInput(btn('B', true));
  assert.equal(t2?.id, 'spin360');
  assert.equal(f.attempt.isCombo, true);
  const raw = 3 + 2.4 + 2.8;
  assert.ok(Math.abs(f.attempt.difficulty - raw * COMBO_CHAIN_BONUS) < 1e-6);
  assert.ok(f.slamWindowScale < 1, 'slam window tightened');
});
ok('finish outcomes by accuracy', () => {
  const f = new DunkFlight();
  f.launch(0.5, 3);
  assert.equal(f.finish(0.95), 'flush');
  const g = new DunkFlight(); g.launch(0.5, 3);
  assert.equal(g.finish(0.4), 'clank');
  const h = new DunkFlight(); h.launch(0.5, 3);
  assert.equal(h.finish(0.05), 'blown');
});

console.log('\nC. every trick clip resolves');
ok('all DUNK_TRICKS clips are resolvable registry names', () => {
  for (const t of DUNK_TRICKS) assert.ok(isResolvable(t.clip), `${t.id} -> "${t.clip}" NOT resolvable`);
});

console.log('\nD. MomentumBus');
ok('events move the tier; multiplier stays in fair bounds', () => {
  const m = new MomentumBus();
  assert.equal(m.tier, 'cold');
  m.report({ kind: 'posterize' }); m.report({ kind: 'block' }); m.report({ kind: 'highlight_dunk' });
  assert.ok(m.tier === 'hot' || m.tier === 'on_fire');
  assert.ok(m.multiplier() <= 1.10 && m.multiplier() >= 0.94);
  const cold = new MomentumBus();
  assert.ok(cold.multiplier() >= 0.94);
});
ok('momentum decays; tier changes notify exactly once', () => {
  const m = new MomentumBus();
  const seen: string[] = [];
  m.onTierChange((t) => seen.push(t));
  m.report({ kind: 'contest_50' }); m.report({ kind: 'contest_50' }); m.report({ kind: 'contest_50' });
  assert.equal(m.tier, 'on_fire');
  for (let i = 0; i < 60 * 45; i++) m.update(1 / 60); // 45s of nothing
  assert.equal(m.tier, 'cold');
  assert.deepEqual(seen, ['warming', 'hot', 'on_fire', 'hot', 'warming', 'cold']);
});

console.log(`\n${pass} checks green`);
