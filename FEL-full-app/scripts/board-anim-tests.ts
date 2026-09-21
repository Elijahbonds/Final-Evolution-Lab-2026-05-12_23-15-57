#!/usr/bin/env -S npx tsx
/**
 * scripts/board-anim-tests.ts — Mode 3 Phase 8 proof (headless).
 *   A. Every board-sport state resolves against the live clip registry.
 *   B. Priorities: bail > landing > grind > air (grab over flip over spin)
 *      > carve > cruise.
 *   C. Air pose selection reflects the trick in progress.
 *   D. Tree dedupes (no per-frame restarts).
 *   E. Grounded tuck (ANIM-READABILITY 2026-09-07): a carve rises out of it, air beats it.
 *   F. One-shots settle: a flip that runs out mid-air holds the tuck and does not re-fire while the trigger holds;
 *      the end callback of a clip the tree itself cut is ignored (the neverBindPose chain used to strand fades here).
 *
 * Run: npx tsx scripts/board-anim-tests.ts
 */
import assert from 'node:assert';
import { chooseBoardClip, BoardAnimTree, AFTER_ONESHOT, type BoardAnimInput } from '../lib/babylon/anim/boardTree';
import { isResolvable } from '../lib/babylon/anim/clipRegistry';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: BoardAnimInput = {
  speed01: 0, pushing: false, lean: 0, airborne: false, grabHeld: false,
  flipping: false, spinning: false, grinding: false, manual: false,
  landing: 'none', bailing: false,
};

console.log('\nA. all states resolve');
ok('every reachable state -> resolvable clip', () => {
  const probes: BoardAnimInput[] = [
    { ...BASE }, { ...BASE, speed01: 0.6 }, { ...BASE, pushing: true },
    { ...BASE, speed01: 0.6, lean: -0.8 }, { ...BASE, speed01: 0.6, lean: 0.8 },
    { ...BASE, airborne: true }, { ...BASE, airborne: true, grabHeld: true },
    { ...BASE, airborne: true, flipping: true }, { ...BASE, airborne: true, spinning: true },
    { ...BASE, grinding: true }, { ...BASE, manual: true },
    { ...BASE, landing: 'clean' }, { ...BASE, landing: 'sketchy' },
    { ...BASE, bailing: true }, { ...BASE, celebrating: true },
    { ...BASE, tucking: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) {
    const c = chooseBoardClip(i);
    assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`);
    assert.ok(c.fadeSec > 0, `${c.state} hard-cut`);
    seen.add(c.state);
  }
  assert.equal(seen.size, 16, `all 16 states, got ${seen.size}`);
});

console.log('\nB. priorities');
ok('bail > sketchy > grind > air > carve', () => {
  assert.equal(chooseBoardClip({ ...BASE, bailing: true, grinding: true }).state, 'bail');
  assert.equal(chooseBoardClip({ ...BASE, landing: 'sketchy', grinding: true }).state, 'land_sketchy');
  assert.equal(chooseBoardClip({ ...BASE, grinding: true, airborne: true }).state, 'grind');
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, lean: 0.9, speed01: 0.8 }).state, 'air_tuck');
  assert.equal(chooseBoardClip({ ...BASE, lean: 0.9, speed01: 0.8 }).state, 'carve_right');
});

console.log('\nC. air pose follows the trick');
ok('grab > flip > spin > tuck', () => {
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, grabHeld: true, flipping: true }).state, 'air_grab');
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, flipping: true, spinning: true }).state, 'air_flip');
  assert.equal(chooseBoardClip({ ...BASE, airborne: true, spinning: true }).state, 'air_spin');
});

console.log('\nD. dedupe');
ok('same state plays once', () => {
  let plays = 0;
  const tree = new BoardAnimTree({ play: () => { plays++; } } as never);
  tree.update(BASE); tree.update(BASE);
  assert.equal(plays, 1);
  tree.update({ ...BASE, speed01: 0.6 });
  assert.equal(plays, 2);
});

console.log('\nE. grounded tuck');
ok('tuck is a state; a carve rises out of it; air beats it', () => {
  assert.equal(chooseBoardClip({ ...BASE, tucking: true }).state, 'tuck');
  assert.equal(chooseBoardClip({ ...BASE, tucking: true }).clip, 'board_tuck');
  assert.equal(chooseBoardClip({ ...BASE, tucking: true, speed01: 0.6 }).state, 'tuck');
  assert.equal(chooseBoardClip({ ...BASE, tucking: true, speed01: 0.6, lean: -0.8 }).state, 'carve_left');
  assert.equal(chooseBoardClip({ ...BASE, tucking: true, airborne: true }).state, 'air_tuck');
  assert.equal(chooseBoardClip({ ...BASE, tucking: true, grinding: true }).state, 'grind');
});
ok('push is the authored board push, not the walk cycle', () => {
  assert.equal(chooseBoardClip({ ...BASE, pushing: true }).clip, 'board_push');
  assert.ok(isResolvable('board_push'));
});

console.log('\nE2. recognizable on sight (ANIM-READABILITY, 2026-09-21)');
ok('every state a player can tell apart by eye plays its own clip', () => {
  const clipOf = (i: Partial<typeof BASE>, prev: Parameters<typeof chooseBoardClip>[1] = null) => chooseBoardClip({ ...BASE, ...i }, prev).clip;
  const seen = {
    idle: clipOf({}), cruise: clipOf({ speed01: 0.6 }), carveL: clipOf({ speed01: 0.6, lean: -0.8 }), carveR: clipOf({ speed01: 0.6, lean: 0.8 }),
    tuck: clipOf({ tucking: true, speed01: 0.6 }), push: clipOf({ pushing: true }), ollie: clipOf({ popping: true, airborne: true }),
    air: clipOf({ airborne: true }), grab: clipOf({ airborne: true, grabHeld: true }), flip: clipOf({ airborne: true, flipping: true }),
    grind: clipOf({ grinding: true }), manual: clipOf({ manual: true }),
    landClean: clipOf({ landing: 'clean' }), landSketchy: clipOf({ landing: 'sketchy' }), bail: clipOf({ bailing: true }),
  };
  const names = Object.values(seen);
  assert.equal(new Set(names).size, names.length, 'two readable states share a clip: ' + JSON.stringify(seen));
  for (const n of names) assert.ok(isResolvable(n), n + ' resolves');
  assert.notEqual(seen.air, 'board_tuck', 'a plain air is not the grounded speed tuck');
});
ok('a creeping board does not stand up and crouch every frame', () => {
  assert.equal(chooseBoardClip({ ...BASE, speed01: 0.12 }, 'idle').state, 'idle');
  assert.equal(chooseBoardClip({ ...BASE, speed01: 0.12 }, 'cruise').state, 'cruise');
  assert.equal(chooseBoardClip({ ...BASE, speed01: 0.05 }, 'cruise').state, 'idle');
  assert.equal(chooseBoardClip({ ...BASE, speed01: 0.2 }, 'idle').state, 'cruise');
});

console.log('\nF. one-shots settle');
type Played = { clip: string; loop: boolean; onEnd?: () => void };
const mockAnimator = (log: Played[]) => ({ play: (clip: string, o: { loop?: boolean; onEnd?: () => void } = {}) => { log.push({ clip, loop: !!o.loop, onEnd: o.onEnd }); } }) as never;
ok('every one-shot state has a settle target and carries its own onEnd', () => {
  for (const st of ['push', 'air_flip', 'land_clean', 'land_sketchy', 'bail', 'celebrate'] as const) assert.ok(AFTER_ONESHOT[st], `${st} settles somewhere`);
  const log: Played[] = []; const tree = new BoardAnimTree(mockAnimator(log));
  tree.update({ ...BASE, airborne: true, flipping: true });
  assert.equal(log[0].clip, 'skate_kickflip'); assert.equal(log[0].loop, false); assert.ok(log[0].onEnd, 'one-shot has the tree\'s onEnd');
  tree.update({ ...BASE, airborne: true });          // loop states carry none (neverBindPose leaves loops alone)
  assert.equal(log[1].clip, 'board_air'); assert.equal(log[1].onEnd, undefined);   // ANIM-READABILITY: the plain air is the open air pose, not the speed tuck
});
ok('a flip that runs out mid-air holds the tuck and does not re-fire while the trigger holds', () => {
  const log: Played[] = []; const tree = new BoardAnimTree(mockAnimator(log));
  const flip = { ...BASE, airborne: true, flipping: true };
  tree.update(flip); assert.equal(log.length, 1);
  log[0].onEnd!();                                    // natural end
  assert.equal(log.length, 2); assert.equal(log[1].clip, 'board_air'); assert.equal(log[1].loop, true);
  tree.update(flip); tree.update(flip);               // still flipping: no kickflip loop
  assert.equal(log.length, 2);
  tree.update({ ...BASE, airborne: true });           // trigger dropped → tuck already current, nothing new
  assert.equal(log.length, 2);
  tree.update(BASE);                                  // landed → idle
  assert.equal(log[2].clip, 'board_stand_idle');
  tree.update(flip);                                  // a NEW flip fires again
  assert.equal(log[3].clip, 'skate_kickflip');
});
ok('the end callback of a clip the tree itself cut is ignored', () => {
  const log: Played[] = []; const tree = new BoardAnimTree(mockAnimator(log));
  tree.update({ ...BASE, airborne: true, flipping: true });
  tree.update({ ...BASE, airborne: true, grabHeld: true });   // the tree moved on (grab wins) — the animator will stop the flip
  assert.equal(log.length, 2);
  log[0].onEnd!();                                    // Babylon raises the end observable from stop()
  assert.equal(log.length, 2, 'no extra play from a cut one-shot');
});
ok('a mode beat (bail) plays once, settles into the idle, and the cleared beat re-chooses', () => {
  const log: Played[] = []; const tree = new BoardAnimTree(mockAnimator(log));
  const bail = { ...BASE, speed01: 0.6, bailing: true };
  tree.update(bail); assert.equal(log[0].clip, 'skate_bail');
  log[0].onEnd!(); assert.equal(log[1].clip, 'board_stand_idle');   // AFTER bail = idle (he gets UP)
  tree.update(bail); assert.equal(log.length, 2);
  tree.clearBeat('bail');
  assert.equal(tree.update({ ...BASE, speed01: 0.6 }), 'cruise');
});

console.log(`\n${pass} checks green`);
