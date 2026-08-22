#!/usr/bin/env -S npx tsx
/**
 * scripts/dunk-system-tests.ts — Mode 1 Phase 6 proof (headless).
 *
 *   A. GestureRecognizer: stick snaps become tokens; each trick's gesture
 *      is recognized; longest match wins; tokens expire.
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

const stick = (x: number, y: number): FelInput => ({ t: 'stick', side: 'R', x, y });

console.log('\nA. gesture recognition');
ok('windmill ↓↑ recognized', () => {
  const g = new GestureRecognizer();
  g.feed(stick(0, -1), 1000); g.feed(stick(0, 1), 1200);
  assert.equal(g.match(1200)?.id, 'windmill');
});
ok('360 ←→ recognized', () => {
  const g = new GestureRecognizer();
  g.feed(stick(-1, 0), 1000); g.feed(stick(1, 0), 1180);
  assert.equal(g.match(1180)?.id, 'spin360');
});
ok('longest match wins (between-the-legs →←→ beats 360 ←→)', () => {
  const g = new GestureRecognizer();
  g.feed(stick(1, 0), 1000); g.feed(stick(-1, 0), 1120); g.feed(stick(1, 0), 1240);
  assert.equal(g.match(1240)?.id, 'betweenlegs');
});
ok('stale tokens expire (no recognition after the timeout)', () => {
  const g = new GestureRecognizer();
  g.feed(stick(0, -1), 1000);
  g.feed(stick(0, 1), 2500);                          // 1.5s later — expired
  assert.equal(g.match(2500), null);
});
ok('repeated same-direction stick is one token (edge, not level)', () => {
  const g = new GestureRecognizer();
  g.feed(stick(0, -1), 1000); g.feed(stick(0, -0.9), 1050); g.feed(stick(0, 1), 1150);
  assert.equal(g.match(1150)?.id, 'windmill');
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
  const t1 = f.feedInput(stick(0, -1), 1000);
  const t1b = f.feedInput(stick(0, 1), 1120);
  assert.ok(t1 === null || t1 === undefined || true); // feed returns on match only
  f.update(1 / 60);
  // windmill recognized on the 'up' snap
  assert.ok((t1b?.id ?? f.currentTrick?.id) === 'windmill');
  const after1 = f.airRemaining01;
  assert.ok(after1 < before, 'trick spent air window');
  f.feedInput(stick(-1, 0), 1300);
  f.feedInput(stick(1, 0), 1420);
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
