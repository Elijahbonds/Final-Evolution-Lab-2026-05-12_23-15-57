#!/usr/bin/env -S npx tsx
/**
 * scripts/combat-anim-tests.ts — Mode 2 Phase 5 proof (headless).
 *
 *   A. Every combat tree state resolves against the live clip registry.
 *   B. Priorities: KO beats everything, hit reactions beat striking,
 *      finisher reactions launch, block holds only when not mid-strike.
 *   C. Reaction weights are distinct states (light flinch vs launch).
 *   D. ResourceMeter: action gains, partial spend gating, full-bar
 *      ultimate, regen, no overspend.
 *   E. ONE OWNER (ANIM-READABILITY combat, 2026-09-07): the tree dedupes, carries its own onEnd on every one-shot,
 *      settles a finished strike straight into what the context asks for (guard step under a held stick — no idle
 *      flash), ignores the end callback of a clip it cut itself, re-fires a cleared beat, plays the attack's own clip,
 *      holds the floor after a knockdown / KO / fall and leaves it through the get-up.
 *
 * Run: npx tsx scripts/combat-anim-tests.ts
 */

import assert from 'node:assert';
import { chooseCombatClip, settleAfter, CombatAnimTree, FLOOR_FAMILY, type CombatAnimInput, type CombatAnimState } from '../lib/babylon/anim/combatTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';
import { ResourceMeter, CHI, CHAKRA } from '../lib/babylon/core/ResourceMeter';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const BASE: CombatAnimInput = {
  speed01: 0, dashing: false, hasWeapon: false, striking: null,
  blocking: false, parryFlash: false, guardImpactFlash: false,
  hitBy: null, down: false, out: false, ulting: false,
};

console.log('\nA. all states resolve');
ok('every reachable state -> resolvable clip', () => {
  const probes: CombatAnimInput[] = [
    { ...BASE }, { ...BASE, hasWeapon: true }, { ...BASE, speed01: 0.6 },
    { ...BASE, dashing: true },
    { ...BASE, striking: 'light' }, { ...BASE, striking: 'medium' },
    { ...BASE, striking: 'heavy' }, { ...BASE, striking: 'finisher' },
    { ...BASE, blocking: true }, { ...BASE, parryFlash: true },
    { ...BASE, guardImpactFlash: true },
    { ...BASE, hitBy: 'light' }, { ...BASE, hitBy: 'finisher' },
    { ...BASE, down: true }, { ...BASE, out: true }, { ...BASE, ulting: true },
    { ...BASE, celebrating: true }, { ...BASE, falling: true }, { ...BASE, dodging: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseCombatClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0, `${c.state} hard-cut`);
    seen.add(c.state);
  }
  assert.equal(seen.size, 19, `all 19 choosable states reachable, got ${seen.size}`);
  for (const st of ['floor', 'get_up'] as const) assert.ok(isResolvable(settleAfter('knockdown', BASE).clip) && st, `${st} resolvable`);
  assert.ok(isResolvable('karate_floor_hold') && isResolvable('karate_get_up') && isResolvable('karate_block') && isResolvable('karate_parry') && isResolvable('karate_guard_impact'));
});

console.log('\nB. priorities');
ok('KO > ultimate > hit-reaction > strike > dash > block > walk', () => {
  assert.equal(chooseCombatClip({ ...BASE, out: true, ulting: true, hitBy: 'heavy' }).state, 'ko');
  assert.equal(chooseCombatClip({ ...BASE, ulting: true, hitBy: 'heavy' }).state, 'ultimate');
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'light', striking: 'heavy' }).state, 'react_light');
  assert.equal(chooseCombatClip({ ...BASE, striking: 'light', dashing: true, blocking: true }).state, 'strike_light');
  assert.equal(chooseCombatClip({ ...BASE, dashing: true, blocking: true }).state, 'dash');
  assert.equal(chooseCombatClip({ ...BASE, blocking: true, speed01: 0.5 }).state, 'block_hold');
});

console.log('\nC. reaction weights');
ok('finisher launches, light flinches — different states', () => {
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'finisher' }).state, 'react_launch');
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'light' }).state, 'react_light');
  assert.equal(chooseCombatClip({ ...BASE, hitBy: 'heavy' }).state, 'react_heavy');
});

console.log('\nD. ResourceMeter');
ok('gains from actions; partial spends gate on balance', () => {
  const m = new ResourceMeter(CHI);
  m.gain('hitLanded');
  assert.equal(m.value, 10);
  assert.ok(!m.spend(25), 'cannot overspend');
  m.gain('guardImpact');
  assert.ok(m.spend(25), 'spends when funded');
  assert.equal(m.value, 3);
});
ok('ultimate requires a FULL bar and drains it', () => {
  const m = new ResourceMeter(CHAKRA);
  m.gain('hitLanded');
  assert.ok(!m.spendUltimate());
  for (let i = 0; i < 60 * 60; i++) m.update(1 / 60);   // regen to full
  assert.ok(m.full);
  assert.ok(m.spendUltimate());
  assert.equal(m.value, 0);
  assert.ok(!m.spendUltimate(), 'no double ultimate');
});

console.log('\nE. one owner');
type Played = { clip: string; loop: boolean; onEnd?: () => void };
const mockAnimator = (log: Played[]) => ({ play: (clip: string, o: { loop?: boolean; onEnd?: () => void } = {}) => { log.push({ clip, loop: !!o.loop, onEnd: o.onEnd }); } }) as never;
const HELD = { ...BASE, speed01: 0.8 };
ok('same state plays once; every one-shot carries the tree\'s onEnd, loops carry none', () => {
  const log: Played[] = []; const tree = new CombatAnimTree(mockAnimator(log));
  tree.update(BASE); tree.update(BASE); assert.equal(log.length, 1); assert.equal(log[0].onEnd, undefined);
  tree.update({ ...BASE, striking: 'light' }); assert.equal(log.length, 2); assert.ok(log[1].onEnd); assert.equal(log[1].loop, false);
  tree.update({ ...BASE, striking: 'light' }); assert.equal(log.length, 2);
});
ok('a strike plays the attack\'s own clip and settles straight into the guard step under a held stick', () => {
  const log: Played[] = []; const tree = new CombatAnimTree(mockAnimator(log)); const settled: CombatAnimState[] = [];
  tree.onSettle = (st) => settled.push(st);
  tree.update({ ...HELD, striking: 'medium', strikeClip: 'high_kick' });
  assert.equal(log[0].clip, 'high_kick');
  log[0].onEnd!();                                                    // natural end
  assert.deepEqual(settled, ['strike_medium']);
  assert.equal(log[1].clip, 'karate_guard_step', 'no idle flash between the strike and the step');
  assert.equal(tree.update({ ...HELD, striking: 'medium', strikeClip: 'high_kick' }), 'walk', 'the spent strike does not re-fire while the mode still holds it');
  assert.equal(log.length, 2);
  assert.equal(tree.update(HELD), 'walk');
  tree.update({ ...HELD, striking: 'medium', strikeClip: 'high_kick' });   // a NEW swing fires again
  assert.equal(log[2].clip, 'high_kick');
});
ok('the end callback of a clip the tree itself cut is ignored (a hit interrupts the swing)', () => {
  const log: Played[] = []; const tree = new CombatAnimTree(mockAnimator(log)); let settled = 0; tree.onSettle = () => settled++;
  tree.update({ ...BASE, striking: 'heavy' });
  tree.update({ ...BASE, striking: 'heavy', hitBy: 'light' });        // the react wins — the animator will stop the strike
  assert.equal(log[1].clip, 'karate_hit_react');
  log[0].onEnd!();                                                    // Babylon raises the end observable from stop()
  assert.equal(log.length, 2); assert.equal(settled, 0);
});
ok('a cleared beat re-fires: two hits inside one react window', () => {
  const log: Played[] = []; const tree = new CombatAnimTree(mockAnimator(log));
  tree.update({ ...BASE, hitBy: 'light' }); assert.equal(log.length, 1);
  tree.clearBeat('react_light'); tree.update({ ...BASE, hitBy: 'light' }); assert.equal(log.length, 2);
  log[1].onEnd!(); assert.equal(log[2].clip, 'karate_idle_stance');   // ran out → the stance
  tree.clearBeat('react_light'); tree.update({ ...BASE, hitBy: 'light' }); assert.equal(log[3].clip, 'karate_hit_react');   // the spent beat, cleared, fires again
});
ok('a knockdown holds the floor and leaves it through the get-up; a flinch on the floor stays down', () => {
  const log: Played[] = []; const tree = new CombatAnimTree(mockAnimator(log));
  assert.equal(tree.update({ ...BASE, down: true }), 'knockdown');
  log[0].onEnd!(); assert.equal(log[1].clip, 'karate_floor_hold'); assert.equal(log[1].loop, true);
  assert.equal(tree.update({ ...BASE, down: true }), 'floor');
  assert.equal(tree.update({ ...BASE, down: true, hitBy: 'light' }), 'floor');
  assert.equal(tree.update(HELD), 'get_up'); assert.equal(log[2].clip, 'karate_get_up');
  assert.equal(tree.update(HELD), 'get_up', 'a standing choice waits for the get-up');
  assert.equal(tree.update({ ...HELD, hitBy: 'heavy' }), 'react_heavy', 'a hit cuts the get-up');
  for (const st of ['knockdown', 'ko', 'fall', 'react_launch'] as const) assert.equal(settleAfter(st, HELD).state, 'floor');
  assert.ok(FLOOR_FAMILY.has('floor') && FLOOR_FAMILY.has('get_up'));
});
ok('the KO holds the floor through a reset; the ring-out fall is its own clip; the block is the authored high guard', () => {
  const log: Played[] = []; const tree = new CombatAnimTree(mockAnimator(log));
  tree.update({ ...BASE, out: true }); log[0].onEnd!(); assert.equal(log[1].clip, 'karate_floor_hold');
  tree.update({ ...BASE, out: true }); assert.equal(log.length, 2);
  tree.reset(); assert.equal(tree.update(BASE), 'idle');
  assert.equal(chooseCombatClip({ ...BASE, falling: true }).clip, 'football_tackled_fall');
  assert.equal(chooseCombatClip({ ...BASE, blocking: true }).clip, 'karate_block');
  assert.equal(chooseCombatClip({ ...BASE, blocking: true, guardImpactFlash: true }).clip, 'karate_guard_impact');
  assert.equal(chooseCombatClip({ ...BASE, parryFlash: true }).clip, 'karate_parry');
});

console.log(`\n${pass} checks green`);
