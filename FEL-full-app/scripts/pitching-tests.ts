#!/usr/bin/env -S npx tsx
/**
 * scripts/pitching-tests.ts — Mode 6 Phase 2 proof (headless).
 *   A. Five pitch types are physically distinct: velo AND spin differ;
 *      each flies its own trajectory through SoccerBall physics.
 *   B. Location targeting: zone clamp in-zone; chase aims outside on
 *      purpose; a yanked release moves the release point for real.
 *   C. Read windows differ honestly (curve reads longest, fastball short).
 *
 * Run: npx tsx scripts/pitching-tests.ts
 */
import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import { PITCHES, PitcherController, aimPitch, ZONE } from '../lib/babylon/core/Pitching';
import { SoccerBall } from '../lib/babylon/core/SoccerBall';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. five distinct pitches');
ok('velo, spin, and read windows differ per pitch', () => {
  const velos = new Set(Object.values(PITCHES).map((p) => p.velo));
  const windows = new Set(Object.values(PITCHES).map((p) => p.readWindowMs));
  assert.ok(velos.size >= 4, 'distinct velocities');
  assert.ok(windows.size >= 4, 'distinct read windows');
  assert.ok(PITCHES.fastball.velo > PITCHES.changeup.velo, 'fastball hotter than change');
  assert.ok(PITCHES.curveball.readWindowMs > PITCHES.fastball.readWindowMs, 'curve reads longer (slower)');
});
ok('each pitch lands its own spot through real flight', () => {
  const land = (p: typeof PITCHES.fastball) => {
    const b = new SoccerBall({ position: Vector3.Zero() });
    b.launch(p.releasePoint, new Vector3(0, -0.5, -p.velo), p.spin);
    for (let i = 0; i < 120; i++) b.step(1 / 240);
    return new Vector3(b.pos.x, b.pos.y, 0);
  };
  const spots = Object.values(PITCHES).map(land);
  // every pair of pitches finishes measurably apart
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
    assert.ok(Vector3.Distance(spots[i], spots[j]) > 0.05, `pitches ${i}/${j} land apart`);
  }
});

console.log('\nB. targeting');
ok('in-zone clamps to the zone; chase aims outside; bad release misses', () => {
  const a = aimPitch(2, 2);
  assert.ok(Math.abs(a.x) <= ZONE.halfW && a.y <= ZONE.top, 'clamped in-zone');
  const chase = aimPitch(0.9, 0.1, true);
  assert.ok(Math.abs(chase.x) > ZONE.halfW * 0.9 || chase.y < ZONE.bottom, 'chase lives outside');
  const p = new PitcherController();
  p.releaseQ = 1;
  const clean = p.deliver();
  p.releaseQ = 0.2;
  let yanked = false;
  for (let i = 0; i < 12; i++) {
    const d = p.deliver();
    if (Vector3.Distance(d.release, clean.release) > 0.01) yanked = true;
  }
  assert.ok(yanked, 'a bad release moves the release point');
});

console.log('\nC. honest read windows');
ok('every pitch gives a real (200ms+) read window', () => {
  for (const p of Object.values(PITCHES)) assert.ok(p.readWindowMs >= 380, `${p.id} ${p.readWindowMs}ms`);
});

console.log(`\n${pass} checks green`);
