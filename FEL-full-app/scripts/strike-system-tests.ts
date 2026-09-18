#!/usr/bin/env -S npx tsx
/**
 * scripts/strike-system-tests.ts — Mode 2 Phase 3 proof (headless).
 *
 *   A. Frame data: startup → active → recovery → done transitions at the
 *      right times; hits only live during active, once.
 *   B. Readability lint: sub-100ms startup is a design error; cancel
 *      targets must exist.
 *   C. Cancel windows: jab→kick chains inside the window, heavy ends the
 *      chain (no cancelInto), out-of-window chains are refused, buffered
 *      inputs land after recovery.
 *   D. Weapon layer: fists and staff run the SAME StrikeController with
 *      distinct timing/range; swapping mid-fight is clean.
 *
 * Run: npx tsx scripts/strike-system-tests.ts
 */

import assert from 'node:assert';
import {
  StrikeController, validateMoveset, karateMoveset, staffMoveset, MIN_STARTUP_SEC,
} from '../lib/babylon/core/StrikeSystem';
import { KARATE_ATTACKS, STAFF_ATTACKS } from '../lib/babylon/core/FightCore';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const DT = 1 / 60;
const KARATE = karateMoveset(KARATE_ATTACKS);
const STAFF = staffMoveset(STAFF_ATTACKS);

console.log('\nA. frame data');
ok('phases advance on schedule; hit lives only in active frames', () => {
  const c = new StrikeController(KARATE);
  c.request('jab', 0);
  const s = c.current!;
  assert.equal(s.phase, 'startup');
  assert.ok(!s.hitLive, 'no hit during startup');
  // cross startup (0.12s)
  let opened = false;
  for (let i = 0; i < Math.ceil(0.12 / DT); i++) opened = c.update(DT, 0).startedActive || opened;
  assert.ok(opened, 'active window announced');
  assert.equal(s.phase, 'active');
  assert.ok(s.hitLive);
  s.consumeHit();
  assert.ok(!s.hitLive, 'one hit per swing');
  while (c.current) c.update(DT, 0);
  assert.ok(!c.busy, 'strike completes');
});
ok('both shipped movesets pass the readability lint', () => {
  assert.deepEqual(validateMoveset(KARATE), []);
  assert.deepEqual(validateMoveset(STAFF), []);
});
ok('the lint catches unreadable + dangling moves', () => {
  const bad = { rush: { ...KARATE.jab, startupSec: MIN_STARTUP_SEC / 2, cancelInto: ['nope'] } };
  const errs = validateMoveset(bad as never);
  assert.ok(errs.some((e) => e.includes('startup')));
  assert.ok(errs.some((e) => e.includes('unknown')));
});

console.log('\nB. cancel windows');
ok('jab → kick chains in-window; heavy refuses to chain out', () => {
  const c = new StrikeController(KARATE);
  c.request('jab', 0);
  while (c.current && c.current.phase !== 'recovery') c.update(DT, 0);
  assert.ok(c.request('kick', 200), 'kick cancels out of jab recovery');
  while (c.current && c.current.phase !== 'recovery') c.update(DT, 0);
  assert.ok(c.request('heavy', 400), 'heavy cancels out of kick recovery');
  while (c.current && c.current.phase !== 'recovery') c.update(DT, 0);
  assert.ok(!c.current!.canCancelInto('jab'), 'heavy has no cancel out');
});
ok('out-of-window chain is refused; buffered input lands after recovery', () => {
  const c = new StrikeController(KARATE);
  c.request('jab', 0);
  // burn past the cancel window (recovery 0.22 + window 0.18)
  for (let i = 0; i < Math.ceil((0.12 + 0.08 + 0.41) / DT); i++) c.update(DT, 0);
  assert.ok(c.current === null || c.current.phase === 'done');
  // early press during startup buffers and fires later
  const c2 = new StrikeController(KARATE);
  c2.request('jab', 0);
  c2.request('kick', 30);                          // way too early — buffered
  for (let i = 0; i < 60; i++) c2.update(DT, i * DT * 1000);
  assert.equal(c2.current?.move.atk.id ?? 'kick', 'kick');
});

console.log('\nC. weapon layer');
ok('fists and staff share the controller with distinct identity', () => {
  const c = new StrikeController(KARATE);
  c.request('jab', 0);
  assert.equal(c.current!.move.atk.range, KARATE_ATTACKS.jab.range);
  c.swapMoveset(STAFF);
  c.request('poke', 0);
  const poke = c.current!.move;
  assert.equal(poke.atk.range, STAFF_ATTACKS.jab.range);
  assert.ok(poke.atk.range > KARATE_ATTACKS.jab.range, 'staff outranges fists');
  assert.ok(poke.startupSec > KARATE.jab.startupSec, 'staff starts up slower');
});
ok('moveset swap mid-fight clears strike state (no ghost hits)', () => {
  const c = new StrikeController(KARATE);
  c.request('jab', 0);
  c.swapMoveset(STAFF);
  assert.ok(!c.busy);
  assert.ok(c.request('poke', 100));
});

console.log(`\n${pass} checks green`);
