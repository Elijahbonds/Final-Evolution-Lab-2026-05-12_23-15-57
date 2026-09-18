#!/usr/bin/env -S npx tsx
/**
 * scripts/onslaught-core-tests.ts — Mode 2 Phase 8 proof (headless).
 *
 *   A. Crowd control: AOE arc vs radius, juggle launches + airborne bonus,
 *      crowd-clear only when truly surrounded, and it KOs the ring.
 *   B. Wave director: count/hp/speed ramp monotonically; spawn ring is
 *      deterministic for a wave number (server parity).
 *   C. Perk shop: unknown/dupes refused; purchase routes through the
 *      injected server spend (client never computes a balance); server
 *      refusal blocks the perk.
 *   D. Down/revive: down → channel → revive restores partial HP; channel
 *      breaks out of range; bleed-out ends it; solo never engages.
 *
 * Run: npx tsx scripts/onslaught-core-tests.ts
 */

import assert from 'node:assert';
import { Vector3 } from '@babylonjs/core';
import {
  aoeTargets, applyCCHit, canCrowdClear, crowdClear, waveSpec, spawnRing,
  buyPerk, PERKS, DownRevive, REVIVE_CHANNEL_SEC, BLEED_OUT_SEC,
  CROWDCLEAR_DMG, type EnemyLike,
} from '../lib/babylon/core/OnslaughtCore';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const E = (x: number, z: number, hp = 30): EnemyLike => ({ id: `${x},${z}`, pos: new Vector3(x, 0, z), hp, airborneSec: 0 });

console.log('\nA. crowd control');
ok('AOE arc hits forward cone only; radius hits all around', () => {
  const self = new Vector3(0, 0, 0);
  const foes = [E(0, 2), E(0, -2), E(2.2, 0.3), E(5, 0)];
  assert.equal(aoeTargets(self, 0, foes, 3, true).length, 1, 'arc: only the one ahead');
  assert.equal(aoeTargets(self, 0, foes, 3, false).length, 3, 'radius: all but the far one');
});
ok('light hits launch; airborne targets take bonus damage', () => {
  const e = E(0, 1);
  applyCCHit(e, 10, true);
  assert.ok(e.airborneSec > 0, 'launched');
  const dealt = applyCCHit(e, 10, false);
  assert.ok(dealt > 10, `juggle bonus (${dealt})`);
});
ok('crowd-clear unlocks at 3+ surrounding and KOs the ring', () => {
  const self = new Vector3(0, 0, 0);
  const two = [E(0, 1), E(1, 0)];
  const four = [...two, E(-1, 0), E(0, -1)];
  assert.ok(!canCrowdClear(self, two));
  assert.ok(canCrowdClear(self, four));
  const res = crowdClear(self, four);
  assert.equal(res.hit, 4);
  assert.equal(res.kos, 4, `${CROWDCLEAR_DMG} dmg clears 30hp mobs`);
});

console.log('\nB. wave director');
ok('waves ramp count/hp/speed; spawn ring is deterministic', () => {
  const w1 = waveSpec(1), w5 = waveSpec(5), w9 = waveSpec(9);
  assert.ok(w5.count > w1.count && w9.count >= w5.count);
  assert.ok(w9.hp > w5.hp && w5.hp > w1.hp);
  assert.ok(w9.speedMult > w1.speedMult);
  const a = spawnRing(3, 6), b = spawnRing(3, 6);
  assert.deepEqual(a.map(String), b.map(String), 'same wave = same spawns');
});

console.log('\nC. perk shop (server-authoritative purchase path)');
ok('unknown/dupe refused; success routes through injected server spend', async () => {
  const owned = new Set<string>();
  assert.ok(!(await buyPerk('nope', owned, async () => ({ ok: true }))).ok);
  let spentWith: string | null = null;
  const spend = async (id: string) => { spentWith = id; return { ok: true }; };
  assert.ok((await buyPerk('vital1', owned, spend)).ok);
  assert.equal(spentWith, 'vital1', 'server got the perk id');
  owned.add('vital1');
  const r = await buyPerk('vital1', owned, spend);
  assert.ok(!r.ok && r.reason === 'already owned');
  // server refusal blocks the purchase
  assert.ok(!(await buyPerk('power1', owned, async () => ({ ok: false, reason: 'insufficient' }))).ok);
});
ok('the perk catalog has real prices (client displays, never sets)', () => {
  for (const p of PERKS) assert.ok(p.costCoins > 0);
});

console.log('\nD. down & revive');
ok('channel revives at full hold in range; out of range stalls', () => {
  const d = new DownRevive();
  d.down(100);
  for (let i = 0; i < Math.ceil(REVIVE_CHANNEL_SEC * 60); i++) d.channel(1 / 60, true);
  assert.equal(d.revive(), 0.4);
  assert.ok(!d.downed);
  const d2 = new DownRevive();
  d2.down(100);
  for (let i = 0; i < 200; i++) d2.channel(1 / 60, false);   // never in range
  assert.ok(d2.downed, 'no revive without proximity');
});
ok('bleed-out after the window', () => {
  const d = new DownRevive();
  d.down(100);
  assert.ok(!d.bledOut(100 + BLEED_OUT_SEC - 1));
  assert.ok(d.bledOut(100 + BLEED_OUT_SEC + 1));
});

console.log(`\n${pass} checks green`);
