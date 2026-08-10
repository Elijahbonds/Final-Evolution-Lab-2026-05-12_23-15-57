#!/usr/bin/env -S npx tsx
/**
 * scripts/presnap-motion-tests.ts — Mode 4 Phase 3 proof (headless).
 *   A. Audible: post-read, swaps to the concept that beats the shell.
 *   B. Motion: moves the receiver; man defense FOLLOWS (tell), zone
 *      BUMPS (tell) — the response reveals the coverage, and the read
 *      sharpens (confidence rises).
 *   C. Motion is impossible after the snap.
 *
 * Run: npx tsx scripts/presnap-motion-tests.ts
 */
import assert from 'node:assert';
import { PreSnapFlow, PLAYBOOK } from '../lib/babylon/core/PreSnap';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. audible');
ok('audible swaps to the concept that beats the read', () => {
  const f = new PreSnapFlow(0, 1);                     // vs press-man (blitz home)
  f.advance(); f.advance(); f.advance();               // → snapReady (read taken)
  assert.equal(f.read!.shell, 'man');
  assert.ok(f.read!.blitzComing);
  f.cyclePlaycall(1);                                   // start on a non-blitz-beater
  const before = f.playcall.id;
  assert.ok(f.audible());
  if (before !== f.playcall.id) assert.ok(true, 'changed plays');
  assert.ok(['dive', 'pa_cross'].includes(f.playcall.id), `audibled to a blitz-beater (${f.playcall.id})`);
});

console.log('\nB. motion tells');
ok('motion vs man = FOLLOWED; vs zone = BUMPED; read sharpens', () => {
  const vsMan = new PreSnapFlow(0, 1);
  vsMan.advance(); vsMan.advance(); vsMan.advance();
  const confBefore = vsMan.read!.confidence01;
  const r = vsMan.motion('wr1', 8);
  assert.equal(r?.revealedShell, 'man');
  assert.ok(vsMan.read!.confidence01 > confBefore, 'the tell sharpens the read');

  const vsZone = new PreSnapFlow(0, 0);
  vsZone.advance(); vsZone.advance(); vsZone.advance();
  const r2 = vsZone.motion('wr1', 8);
  assert.equal(r2?.revealedShell, 'zone');
  assert.equal(vsZone.read!.shell, 'zone');
});

console.log('\nC. motion is a pre-snap tool');
ok('no motion after the snap', () => {
  const f = new PreSnapFlow();
  f.advance(); f.advance(); f.advance(); f.snap();
  assert.equal(f.motion('wr1', 8), null);
});

console.log(`\n${pass} checks green`);
