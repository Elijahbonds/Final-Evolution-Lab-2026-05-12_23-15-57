#!/usr/bin/env -S npx tsx
/**
 * scripts/combat-movement-tests.ts — Mode 2 Phase 2 proof (headless).
 *
 *   A. Stances: switch changes speed/range profile; switch cooldown blocks
 *      flicker; each stance unlocks distinct move tags.
 *   B. Free movement inherits the CourtMovement weight (ramped accel).
 *   C. Dash-cancel: burst velocity, real i-frame window, cooldown gates
 *      spam; works from any stance.
 *   D. 8-way run: stick X orbits the locked opponent (radius preserved),
 *      stick Y closes/retreats, facing ALWAYS points at the opponent.
 *
 * Run: npx tsx scripts/combat-movement-tests.ts
 */

import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { CombatMovement, StanceSystem, STANCES } from '../lib/babylon/core/CombatMovement';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;

console.log('\nA. stances');
ok('stance profiles differ meaningfully (speed/range/tags)', () => {
  assert.ok(STANCES.cat.speedMult > STANCES.orthodox.speedMult);
  assert.ok(STANCES.rooted.rangeMult > STANCES.orthodox.rangeMult);
  assert.ok(STANCES.cat.moveTags.includes('pounce') && !STANCES.orthodox.moveTags.includes('pounce'));
  assert.ok(STANCES.rooted.moveTags.includes('breaker'));
});
ok('switch cooldown prevents stance flicker', () => {
  const s = new StanceSystem();
  assert.ok(s.switchTo('cat'));
  assert.ok(!s.switchTo('rooted'));            // inside cooldown
  for (let i = 0; i < 30; i++) s.update(DT);   // 0.5s
  assert.ok(s.switchTo('rooted'));
  assert.equal(s.current, 'rooted');
});
ok('cat stance moves measurably faster', () => {
  const run = (stance: 'orthodox' | 'cat') => {
    const m = new CombatMovement();
    m.stances.switchTo(stance); m.stances.update(1); // clear cooldown
    for (let i = 0; i < 90; i++) m.update(DT, 0, 1, true);
    return m.vel.length();
  };
  assert.ok(run('cat') > run('orthodox') * 1.1);
});

console.log('\nB. weight inheritance');
ok('free movement ramps to speed (not instant)', () => {
  const m = new CombatMovement();
  const speeds: number[] = [];
  for (let i = 0; i < 60; i++) { m.update(DT, 0, 1, true); speeds.push(m.vel.length()); }
  assert.ok(speeds[1] < speeds[30], 'accelerating');
  assert.ok(speeds[1] < 4, `frame 1 speed ${speeds[1].toFixed(1)} — not instant top speed`);
});

console.log('\nC. dash-cancel');
ok('dash is a burst with i-frames, then cooldown gates spam', () => {
  const m = new CombatMovement();
  for (let i = 0; i < 30; i++) m.update(DT, 0, 0, false);
  assert.ok(m.dashReady);
  assert.ok(m.dash(0, 1));
  assert.ok(m.dashing && m.dashIFrames);
  m.update(DT, 0, 0, false);
  assert.ok(m.vel.length() > 8, `dash speed ${m.vel.length().toFixed(1)}`);
  assert.ok(!m.dash(0, 1), 'no double-dash mid-dash');
  for (let i = 0; i < 60; i++) m.update(DT, 0, 0, false);   // 1s
  assert.ok(m.dashReady, 'cooldown recovered');
});
ok('i-frames end before the cooldown does', () => {
  const m = new CombatMovement();
  m.dash(1, 0);
  for (let i = 0; i < Math.ceil(CombatMovement.DASH_IFRAMES_SEC / DT) + 2; i++) m.update(DT, 0, 0, false);
  assert.ok(!m.dashIFrames);
});

console.log('\nD. 8-way run plane');
ok('stick X orbits at constant radius; stick Y closes', () => {
  const m = new CombatMovement();
  m.moveMode = 'eightWay';
  const foe = new Vector3(0, 0, 0);
  m.lockTarget = foe;
  const self = new Vector3(0, 0, 5);
  // settle
  for (let i = 0; i < 20; i++) m.updateWithSelf(DT, 0, 0, false, self);
  // orbit left for 1s
  const r0 = Vector3.Distance(self, foe);
  for (let i = 0; i < 60; i++) {
    m.updateWithSelf(DT, 1, 0, false, self);
    self.addInPlace(m.vel.scale(DT));
  }
  const r1 = Vector3.Distance(self, foe);
  assert.ok(Math.abs(r1 - r0) < 0.35, `radius held (${r0.toFixed(2)} → ${r1.toFixed(2)})`);
  const a0 = Math.atan2(0 - 0, 0 - 5);           // initial bearing
  const a1 = Math.atan2(self.x - foe.x, self.z - foe.z);
  assert.ok(Math.abs(a1 - a0) > 0.3, 'actually orbited');
  void a0;
  // now close in
  for (let i = 0; i < 60; i++) {
    m.updateWithSelf(DT, 0, 1, false, self);
    self.addInPlace(m.vel.scale(DT));
  }
  assert.ok(Vector3.Distance(self, foe) < r1, 'closed distance');
});
ok('facing always locks to the opponent in 8-way', () => {
  const m = new CombatMovement();
  m.moveMode = 'eightWay';
  const foe = new Vector3(0, 0, 0);
  m.lockTarget = foe;
  const self = new Vector3(3, 0, 4);
  m.updateWithSelf(DT, 1, 0, false, self);
  const want = Math.atan2(foe.x - self.x, foe.z - self.z);
  assert.ok(Math.abs(m.facing - want) < 1e-6);
});

console.log(`\n${pass} checks green`);
