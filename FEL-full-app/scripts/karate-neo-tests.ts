#!/usr/bin/env -S npx tsx
/**
 * scripts/karate-neo-tests.ts — KARATE-NEO-COOP proof (headless, 2026-09-07).
 *
 *   A. PlayerVitals: the fighter is NOT one-tap DOWN — 5+ clean hits at wave 1; a guard chips and never drops you;
 *      post-hit i-frames swallow a horde's chain; revive restores the ratio with a grace window; damage creeps, capped.
 *   B. SlowMoLatch: latches once, holds its length, refuses a second latch inside a beat or its cooldown, the
 *      player-triggered chi burst always fires, time scale is the Matrix scale only while active.
 *   C. EnemyBrain: pursue → wind-up (a readable telegraph ≥ 0.28 s on every wave) → strike (the hit lands on the
 *      contact beat, once) → recover → resume; an interrupt cancels; attacker cap grows with the wave and stays sane.
 *   D. ComboTracker: three lights inside the window make the third the finisher; a gap or another verb breaks it.
 *   E. DropDirector: shards most KOs, a chi orb every fourth, a health orb when hurt with a pity floor, none when healthy.
 *   F. Perks: every perk changes the run (a number moves), buy gates on shards / ownership, the HUD line carries the
 *      cursor, the built state stacks.
 *   G. separate(): neighbours inside the radius are pushed apart, symmetric; far bodies untouched.
 *
 * Run: npx tsx scripts/karate-neo-tests.ts
 */

import assert from 'node:assert';
import {
  PlayerVitals, VITALS, enemyHitDamage,
  SlowMoLatch, SLOWMO,
  EnemyBrain, ENEMY_ATTACK, windupSecFor, maxAttackers,
  ComboTracker, COMBO, isFinisher,
  DropDirector, DROPS,
  PerkShop, NEO_PERKS, BASE_PERKS, applyPerk,
  separate,
} from '../lib/babylon/core/NeoCombatCore';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nA. player vitals');
ok('five clean hits at wave 1 before DOWN (no one-tap); damage creeps and caps', () => {
  const v = new PlayerVitals();
  let hits = 0;
  while (!v.downed) { const r = v.takeHit(enemyHitDamage(1)); if (r === 'hit' || r === 'down') hits++; v.tick(VITALS.hurtIframeSec + 0.01); assert.ok(hits < 50); }
  assert.ok(hits >= 5, `took ${hits} hits to go down`);
  assert.ok(enemyHitDamage(9) > enemyHitDamage(1));
  assert.equal(enemyHitDamage(40), VITALS.hitDmgCap);
});
ok('a guard chips and can never drop you; a dodge or post-hit i-frames swallow the hit', () => {
  const v = new PlayerVitals(); v.hp = 3;
  assert.equal(v.takeHit(30, { blocking: true }), 'blocked'); assert.equal(v.hp, 1);
  assert.equal(v.takeHit(30, { blocking: true }), 'blocked'); assert.equal(v.hp, 1, 'a guard floors at 1');
  const w = new PlayerVitals();
  assert.equal(w.takeHit(20, { dodging: true }), 'iframe'); assert.equal(w.hp, 100);
  assert.equal(w.takeHit(20), 'hit'); assert.equal(w.hp, 80);
  assert.equal(w.takeHit(20), 'iframe', 'the post-hit window swallows the chain');
  w.tick(VITALS.hurtIframeSec);
  assert.equal(w.takeHit(20), 'hit'); assert.equal(w.hp, 60);
});
ok('revive restores the ratio with a grace window; heal and max-HP clamp', () => {
  const v = new PlayerVitals(); v.hp = 0;
  assert.equal(v.takeHit(10), 'down');
  v.revive(); assert.equal(v.hp, 40); assert.ok(v.iframeSec >= 1);
  v.heal(200); assert.equal(v.hp, 100);
  v.setMax(140, true); assert.equal(v.hp, 140); v.setMax(100); assert.equal(v.hp, 100);
});

console.log('\nB. slow-mo latch');
ok('latches once, holds, refuses inside the beat and its cooldown, fires again after', () => {
  const s = new SlowMoLatch();
  assert.ok(s.fire('perfectDodge')); assert.ok(s.active); assert.equal(s.scale, SLOWMO.scale); assert.equal(s.kind, 'perfectDodge');
  assert.ok(!s.fire('heavyKo'), 'no second latch inside a beat');
  s.tick(SLOWMO.perfectDodge + 0.01); assert.ok(!s.active); assert.equal(s.scale, 1); assert.equal(s.kind, null);
  assert.ok(!s.fire('heavyKo'), 'the cooldown holds');
  s.tick(SLOWMO.cooldownSec); assert.ok(s.fire('heavyKo')); assert.equal(s.episodes, 2);
});
ok('the chi burst (player-triggered) always fires and extends a running beat', () => {
  const s = new SlowMoLatch();
  s.fire('waveClear'); assert.ok(s.fire('chiBurst')); assert.equal(s.sec, SLOWMO.chiBurst); assert.equal(s.kind, 'chiBurst');
  s.tick(SLOWMO.chiBurst + 0.01); assert.ok(!s.fire('finisher')); assert.ok(s.fire('chiBurst'));
});

console.log('\nC. enemy brain');
ok('pursue → wind-up → strike (lands once on the contact beat) → recover → resume', () => {
  const b = new EnemyBrain(1);
  assert.equal(b.step(0.1), null); assert.equal(b.engage(), 'windup'); assert.equal(b.engage(), null); assert.ok(b.attacking);
  const ev: string[] = [];
  for (let i = 0; i < 400; i++) { const e = b.step(1 / 60); if (e) ev.push(`${e}@${(i / 60).toFixed(2)}`); if (e === 'resume') break; }
  assert.equal(ev.length, 3, ev.join(' '));
  assert.ok(ev[0].startsWith('strike@'), 'the strike after the wind-up');
  assert.ok(ev[1].startsWith('land@'), 'the hit lands');
  assert.ok(ev[2].startsWith('resume@'));
  const tStrike = Number(ev[0].split('@')[1]), tLand = Number(ev[1].split('@')[1]);
  assert.ok(tStrike >= windupSecFor(1) - 0.02, `telegraph ${tStrike}`);
  assert.ok(tLand - tStrike >= ENEMY_ATTACK.landAt - 0.02, 'the land waits for the contact beat');
  assert.equal(b.phase, 'pursue'); assert.ok(!b.attacking);
});
ok('the telegraph never drops below the floor; an interrupt cancels the attack; the attacker cap grows and stays sane', () => {
  assert.ok(windupSecFor(1) > windupSecFor(9)); assert.equal(windupSecFor(99), ENEMY_ATTACK.windupMinSec);
  const b = new EnemyBrain(3); b.engage(); b.step(0.1); b.interrupt(); assert.equal(b.phase, 'pursue'); assert.equal(b.engage(), 'windup');
  assert.equal(maxAttackers(1), 2); assert.ok(maxAttackers(7) > maxAttackers(1)); assert.ok(maxAttackers(50) <= 5);
});

ok('the kick variant (wave 3+): longer clip, later contact beat, harder hit; the jab is the default', () => {
  const b = new EnemyBrain(3); assert.equal(b.engage('kick'), 'windup'); assert.equal(b.strike, 'kick');
  assert.ok(b.strikeSec > ENEMY_ATTACK.strikeSec && b.landAt > ENEMY_ATTACK.landAt);
  const ev: string[] = []; for (let i = 0; i < 400; i++) { const e = b.step(1 / 60); if (e) ev.push(`${e}@${(i / 60).toFixed(2)}`); if (e === 'resume') break; }
  const tStrike = Number(ev[0].split('@')[1]), tLand = Number(ev[1].split('@')[1]);
  assert.ok(tLand - tStrike >= ENEMY_ATTACK.kick.landAt - 0.02, 'the kick lands on its own contact beat');
  assert.ok(enemyHitDamage(3, 'kick') > enemyHitDamage(3), 'the kick hits harder'); assert.equal(enemyHitDamage(3), enemyHitDamage(3, 'jab'));
  const j = new EnemyBrain(1); j.engage(); assert.equal(j.strike, 'jab');
});

console.log('\nD. combo');
ok('three lights inside the window: the third is the finisher; a gap or a reset breaks the chain', () => {
  const c = new ComboTracker();
  assert.equal(c.light(0), 1); assert.equal(c.light(0.5), 2); const third = c.light(1.0); assert.ok(isFinisher(third));
  assert.equal(c.light(1.4), 1, 'wraps after the finisher');
  assert.equal(c.light(1.4 + COMBO.windowSec + 0.1), 1, 'a gap restarts');
  c.light(5); c.reset(); assert.equal(c.light(5.1), 1);
});

console.log('\nE. drops');
ok('shards most KOs, a chi orb every fourth, no health while healthy', () => {
  const d = new DropDirector(() => 0.1);   // always under the shard chance
  const kinds: (string | null)[] = []; for (let i = 0; i < 8; i++) kinds.push(d.onKo(1));
  assert.equal(kinds.filter((k) => k === 'chi').length, 2); assert.equal(kinds[3], 'chi'); assert.equal(kinds[7], 'chi');
  assert.ok(kinds.every((k) => k === 'chi' || k === 'shard')); assert.ok(!kinds.includes('health'));
  const n = new DropDirector(() => 0.99); assert.equal(n.onKo(1), null, 'a miss drops nothing');
});
ok('a health orb when hurt — by chance, and by pity when the streak is cold', () => {
  const lucky = new DropDirector(() => 0.05); assert.equal(lucky.onKo(0.3), 'health');
  const cold = new DropDirector(() => 0.95);
  const seen: (string | null)[] = []; for (let i = 0; i < DROPS.healthPity; i++) seen.push(cold.onKo(0.3));
  assert.equal(seen[DROPS.healthPity - 1], 'health', `pity at KO ${DROPS.healthPity}`); assert.ok(!seen.slice(0, -1).includes('health'));
});

console.log('\nF. perks');
ok('every perk moves a number; the state stacks', () => {
  for (const p of NEO_PERKS) assert.notDeepEqual(applyPerk(BASE_PERKS, p.id), BASE_PERKS, p.id);
  assert.deepEqual(applyPerk(BASE_PERKS, 'nope'), BASE_PERKS);
  const s = new PerkShop(); s.owned.add('iron'); s.owned.add('quick');
  const st = s.state(); assert.equal(st.maxHp, 140); assert.ok(st.speedMult > 1 && st.dodgeMult > 1); assert.equal(st.reach, 1);
});
ok('buy gates on shards and ownership; the cursor wraps; the HUD line carries it', () => {
  const s = new PerkShop();
  assert.equal(s.selected.id, 'iron'); s.move(-1); assert.equal(s.selected.id, 'quick'); s.move(1); assert.equal(s.selected.id, 'iron');
  const poor = s.buy(2); assert.ok(!poor.ok && /NEED 4/.test(poor.reason ?? ''));
  const r = s.buy(6); assert.ok(r.ok && r.cost === 6 && r.id === 'iron'); assert.ok(s.owned.has('iron'));
  assert.equal(s.buy(99).reason, 'OWNED');
  assert.ok(s.hudLine().startsWith('▶ ✓ IRON BODY 6◆')); assert.equal(s.hudLine().split(' · ').length, NEO_PERKS.length);
  for (const p of NEO_PERKS) s.owned.add(p.id); assert.ok(s.allOwned);
});

console.log('\nG. separation');
ok('neighbours inside the radius are pushed apart symmetrically; far bodies untouched', () => {
  const off = separate([{ x: 0, z: 0 }, { x: 0.4, z: 0 }, { x: 5, z: 5 }], 1.0);
  assert.ok(off[0].x < 0 && off[1].x > 0); assert.ok(Math.abs(off[0].x + off[1].x) < 1e-9);
  assert.equal(off[2].x, 0); assert.equal(off[2].z, 0);
  const same = separate([{ x: 1, z: 1 }, { x: 1, z: 1 }], 1.0); assert.ok(Math.hypot(same[0].x, same[0].z) > 0, 'coincident bodies still split');
});

console.log(`\n${pass} checks green`);
