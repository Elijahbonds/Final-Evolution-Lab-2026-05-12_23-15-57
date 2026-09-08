#!/usr/bin/env -S npx tsx
/**
 * scripts/creative-anim-tests.ts — ANIM-READABILITY (creative: carnival / dance / freerun, 2026-09-07), headless.
 *
 *   A. Every FreeRun tree state resolves against the live clip registry; the carnival / dance clips it names do too.
 *   B. FreeRun priorities: down > landing > wall run > air (tuck over the take-off over the hold) > slide > loco.
 *   C. ONE OWNER: the tree dedupes, carries its own onEnd on every one-shot, settles the take-off into the air hold and a
 *      landing under a held stick straight onto the run (no idle flash), ignores the callback of a clip it cut itself,
 *      re-fires a cleared beat, holds the floor after a bail and leaves it through the get-up.
 *   D. BeatOwner (carnival bodies, the dancer): a beat settles into the loop asked for LAST; a per-frame loop never cuts a
 *      beat; a cut beat's end callback is ignored; settle() cuts; a step-as-loop dedupes through the animator.
 *   E. Source guards: the three modes never call animator.play themselves; the trick gauntlet runs the TrickMachine in
 *      external mode; the dancer's steps are loops.
 *
 * Run: npx tsx scripts/creative-anim-tests.ts
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { chooseFreeRunClip, settleAfter, FreeRunAnimTree, FLOOR_FAMILY, type FreeRunAnimInput } from '../lib/babylon/anim/freeRunTree';
import { BeatOwner } from '../lib/babylon/anim/beatOwner';
import { isResolvable, SPORT_CLIP } from '../lib/babylon/anim/clipRegistry';
import { DANCE_CLIP_IDS, DANCE_ALIASES } from '../lib/babylon/anim/danceClips';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: FreeRunAnimInput = { speed01: 0, airborne: false, jumpBeat: false, tricking: false, wallrun: false, sliding: false, landing: 'none', down: false };
type Played = { clip: string; loop: boolean; onEnd?: () => void; restart?: boolean };
const mockAnimator = (log: Played[]) => ({ play: (clip: string, o: { loop?: boolean; onEnd?: () => void; restart?: boolean } = {}) => { log.push({ clip, loop: !!o.loop, onEnd: o.onEnd, restart: o.restart }); } }) as never;

console.log('\nA. all states resolve');
ok('every reachable FreeRun state -> resolvable clip', () => {
  const probes: FreeRunAnimInput[] = [
    { ...BASE }, { ...BASE, speed01: 0.3 }, { ...BASE, speed01: 0.9 },
    { ...BASE, airborne: true, jumpBeat: true }, { ...BASE, airborne: true }, { ...BASE, airborne: true, tricking: true },
    { ...BASE, wallrun: true }, { ...BASE, sliding: true },
    { ...BASE, landing: 'clean' }, { ...BASE, landing: 'sketchy' }, { ...BASE, down: true }, { ...BASE, celebrating: true },
  ];
  const seen = new Set<string>();
  for (const i of probes) { const c = chooseFreeRunClip(i); assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`); assert.ok(c.fadeSec > 0, `${c.state} hard-cut`); seen.add(c.state); }
  assert.equal(seen.size, 12, `all 12 choosable states, got ${seen.size}`);
  assert.ok(isResolvable(settleAfter('bail', BASE).clip), 'the floor resolves');
  for (const n of ['freerun_air_hold', 'freerun_tuck', 'freerun_slide', 'karate_windup_hold', 'karate_floor_hold', 'karate_get_up']) assert.ok(isResolvable(n), `${n} resolvable`);
});
ok('the carnival gestures and the dance aliases resolve', () => {
  for (const n of [SPORT_CLIP.karateWindup, SPORT_CLIP.karateStance, SPORT_CLIP.karateJab, SPORT_CLIP.karateHitReact, SPORT_CLIP.dunkChargeGather, SPORT_CLIP.dunkLaunchPower, SPORT_CLIP.penaltyStrike, SPORT_CLIP.scoreCelebrate]) assert.ok(isResolvable(n), `${n} resolvable`);
  assert.equal(DANCE_CLIP_IDS.length, 8);
  for (const id of DANCE_CLIP_IDS) assert.ok(isResolvable(DANCE_ALIASES[id]), `${id} alias "${DANCE_ALIASES[id]}" resolvable`);
});

console.log('\nB. priorities');
ok('down > landing > wall run > air > slide > loco; the air pose follows the trick then the take-off beat', () => {
  assert.equal(chooseFreeRunClip({ ...BASE, down: true, landing: 'clean', airborne: true }).state, 'bail');
  assert.equal(chooseFreeRunClip({ ...BASE, landing: 'clean', wallrun: true }).state, 'land_clean');
  assert.equal(chooseFreeRunClip({ ...BASE, landing: 'sketchy', airborne: true }).state, 'air', 'a landing beat means nothing while still airborne');
  assert.equal(chooseFreeRunClip({ ...BASE, wallrun: true, airborne: true }).state, 'wallrun');
  assert.equal(chooseFreeRunClip({ ...BASE, airborne: true, tricking: true, jumpBeat: true }).state, 'tuck');
  assert.equal(chooseFreeRunClip({ ...BASE, airborne: true, jumpBeat: true }).state, 'jump');
  assert.equal(chooseFreeRunClip({ ...BASE, airborne: true }).state, 'air');
  assert.equal(chooseFreeRunClip({ ...BASE, sliding: true, speed01: 0.9 }).state, 'slide');
  assert.equal(chooseFreeRunClip({ ...BASE, speed01: 0.9 }).state, 'run');
  assert.equal(chooseFreeRunClip({ ...BASE, speed01: 0.2 }).state, 'walk');
  assert.equal(chooseFreeRunClip({ ...BASE, sliding: true }).clip, 'freerun_slide');
  assert.equal(chooseFreeRunClip({ ...BASE, airborne: true, tricking: true }).clip, 'freerun_tuck');
});

console.log('\nC. one owner (FreeRun)');
ok('the tree dedupes and carries its own onEnd on one-shots only', () => {
  const log: Played[] = []; const tree = new FreeRunAnimTree(mockAnimator(log));
  tree.update(BASE); tree.update(BASE); assert.equal(log.length, 1); assert.equal(log[0].onEnd, undefined);
  tree.update({ ...BASE, airborne: true, jumpBeat: true }); assert.equal(log[1].clip, 'jump_up'); assert.equal(log[1].loop, false); assert.ok(log[1].onEnd);
});
ok('the take-off settles into the air hold and does not re-fire while the beat holds; a landing under a held stick lands on the run', () => {
  const log: Played[] = []; const tree = new FreeRunAnimTree(mockAnimator(log));
  const jump = { ...BASE, airborne: true, jumpBeat: true, speed01: 0.9 };
  tree.update(jump); log[0].onEnd!();                    // natural end mid-air
  assert.equal(log[1].clip, 'freerun_air_hold'); assert.equal(log[1].loop, true);
  tree.update(jump); tree.update(jump); assert.equal(log.length, 2, 'no second take-off while the beat holds');
  tree.update({ ...BASE, landing: 'clean', speed01: 0.9 }); assert.equal(log[2].clip, 'jump_land');
  log[2].onEnd!();                                       // the landing ran out under a held stick
  assert.equal(log[3].clip, 'run', 'settles on the run, not an idle flash'); assert.equal(log.length, 4);
  tree.update({ ...BASE, landing: 'clean', speed01: 0.9 }); assert.equal(log.length, 4, 'the spent landing does not re-fire');
  tree.update({ ...BASE, speed01: 0.9 }); assert.equal(log.length, 4);
  tree.clearBeat('land_clean'); tree.update({ ...BASE, landing: 'clean', speed01: 0.9 }); assert.equal(log[4].clip, 'jump_land', 'a NEW landing fires again');
});
ok('the end callback of a clip the tree itself cut is ignored', () => {
  const log: Played[] = []; const tree = new FreeRunAnimTree(mockAnimator(log));
  tree.update({ ...BASE, airborne: true, jumpBeat: true });
  tree.update({ ...BASE, airborne: true, tricking: true });   // the tree moved on (the tuck) — the animator will stop the take-off
  assert.equal(log.length, 2);
  log[0].onEnd!();                                          // Babylon raises the end observable from stop()
  assert.equal(log.length, 2, 'no settle play from a cut clip'); assert.equal(tree.state, 'tuck');
});
ok('a bail holds the floor and leaves it through the get-up; the get-up finishes before any standing state', () => {
  const log: Played[] = []; const tree = new FreeRunAnimTree(mockAnimator(log));
  tree.update({ ...BASE, down: true }); assert.equal(log[0].clip, 'football_tackled_fall');
  log[0].onEnd!(); assert.equal(log[1].clip, 'karate_floor_hold'); assert.equal(log[1].loop, true);
  tree.update({ ...BASE, down: true }); assert.equal(log.length, 2, 'the floor holds');
  tree.update({ ...BASE, speed01: 0.9 }); assert.equal(log[2].clip, 'karate_get_up', 'the floor is left through the get-up');
  tree.update({ ...BASE, speed01: 0.9 }); assert.equal(log.length, 3, 'the run waits for the get-up');
  log[2].onEnd!(); assert.equal(log[3].clip, 'run');
  for (const s of ['bail', 'floor', 'get_up'] as const) assert.ok(FLOOR_FAMILY.has(s));
});

console.log('\nD. BeatOwner');
ok('a beat settles into the loop asked for LAST; a per-frame loop never cuts a beat in flight', () => {
  const log: Played[] = []; const o = new BeatOwner(mockAnimator(log));
  o.loop('guard'); o.loop('guard'); o.loop('guard'); assert.equal(log.length, 3, 'loops pass through (the animator dedupes a same-clip loop)');
  o.beat('jab'); assert.equal(log[3].clip, 'jab'); assert.equal(log[3].loop, false); assert.ok(log[3].onEnd); assert.ok(o.busy);
  o.loop('karate_guard_step'); assert.equal(log.length, 4, 'the loop request is held while the beat plays');
  log[3].onEnd!(); assert.equal(log[4].clip, 'karate_guard_step'); assert.equal(log[4].loop, true); assert.ok(!o.busy);
});
ok('a cut beat is ignored; a mashed beat restarts; settle() cuts back to the loop', () => {
  const log: Played[] = []; const o = new BeatOwner(mockAnimator(log));
  o.loop('guard'); o.beat('karate_hit_react'); o.beat('karate_hit_react');
  assert.equal(log.length, 3); assert.equal(log[2].restart, true);
  log[1].onEnd!(); assert.equal(log.length, 3, 'the first (cut) beat settles nothing');
  let settled = 0; o.beat('jab', { onSettle: () => settled++ }); o.settle(); assert.equal(log[log.length - 1].clip, 'guard'); assert.equal(settled, 0);
  log[3].onEnd!(); assert.equal(settled, 0, 'a beat cut by settle() never reports a settle');
});

console.log('\nE. source guards');
ok('the modes never play a clip themselves; the gauntlet is external; the dancer\'s steps are loops', () => {
  const src = (f: string) => readFileSync(new URL(`../lib/babylon/modes/${f}`, import.meta.url), 'utf8');
  for (const f of ['FreeRunMode.ts', 'DanceMode.ts', 'carnivalEvents.ts', 'CourtCarnivalMode.ts']) assert.ok(!src(f).includes('animator.play('), `${f} plays no clip directly`);
  assert.ok(src('carnivalEvents.ts').includes("anim: 'external'"), 'trick gauntlet: TrickMachine external');
  assert.ok(src('DanceMode.ts').includes('body?.loop(currentClip'), 'a dance step is a loop the next step crossfades over');
  assert.ok(src('FreeRunMode.ts').includes('feedTree(S)'), 'FreeRun feeds the tree per frame');
});

console.log(`\ncreative-anim-tests: ${pass} checks green`);
