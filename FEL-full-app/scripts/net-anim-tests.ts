#!/usr/bin/env -S npx tsx
/**
 * scripts/net-anim-tests.ts — ANIM-READABILITY (net / precision: tennis / volleyball / golf / derby / penalty, 2026-09-07), headless.
 *
 *   A. Every NetAnimTree state resolves against the live clip registry for both clip sets; the precision gestures the three
 *      modes play (address / swing / putt / finish, stance / swing / pitches, kicker idle / strike / feint, keeper set /
 *      dive / hold / rise) resolve too.
 *   B. Net priorities: swing > serve > block > shuffle > ready; the shuffle follows the sign of the body-frame intent.
 *   C. ONE OWNER (net): the tree dedupes, carries its own onEnd on beats only, settles a swing that ran out under a held
 *      stick straight onto the shuffle (no ready flash), ignores the callback of a beat it cut itself, re-fires a cleared
 *      beat, reports the settle.
 *   D. Precision contact beats: the golf clips name their contact key; a beat asked for BEFORE its settle loop lands on that
 *      loop (BeatOwner: a loop requested during a beat is where the beat lands — the golf swing → the held finish, the dive
 *      → the held stretch, the rise → the set).
 *   E. Source guards: NetSportMode never calls animator.play; the live golf / derby / penalty modes never call it (the dead
 *      precision TennisMode above them is not the game's tennis and is left alone); the net swing / serve / block are beats.
 *
 * Run: npx tsx scripts/net-anim-tests.ts
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { chooseNetClip, settleNetAfter, NetAnimTree, TENNIS_CLIPS, VOLLEYBALL_CLIPS, NET_CONTACT_SEC, type NetAnimInput } from '../lib/babylon/anim/netTree';
import { BeatOwner } from '../lib/babylon/anim/beatOwner';
import { isResolvable, SPORT_CLIP } from '../lib/babylon/anim/clipRegistry';
import { GOLF_CONTACT_SEC } from '../lib/babylon/anim/authored/golf';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };
const BASE: NetAnimInput = { move: 0, swing: false, serve: false, block: false };
type Played = { clip: string; loop: boolean; onEnd?: () => void; restart?: boolean };
const mockAnimator = (log: Played[]) => ({ play: (clip: string, o: { loop?: boolean; onEnd?: () => void; restart?: boolean } = {}) => { log.push({ clip, loop: !!o.loop, onEnd: o.onEnd, restart: o.restart }); } }) as never;

console.log('\nA. all states resolve');
ok('every NetAnimTree state resolves for tennis and volleyball, no hard cuts', () => {
  const probes: NetAnimInput[] = [{ ...BASE }, { ...BASE, move: -1 }, { ...BASE, move: 1 }, { ...BASE, swing: true }, { ...BASE, serve: true }, { ...BASE, block: true }];
  for (const set of [TENNIS_CLIPS, VOLLEYBALL_CLIPS]) {
    const seen = new Set<string>();
    for (const i of probes) { const c = chooseNetClip(i, set); assert.ok(isResolvable(c.clip), `${c.state} -> "${c.clip}" NOT resolvable`); assert.ok(c.fadeSec > 0, `${c.state} hard-cut`); seen.add(c.state); }
    assert.equal(seen.size, 6, `all 6 states, got ${seen.size}`);
  }
  assert.equal(TENNIS_CLIPS.serve, 'tennis_serve', 'the tennis serve is the serve, not the forehand');
  assert.equal(VOLLEYBALL_CLIPS.block, 'volleyball_block', 'the volleyball block is the block, not the spike');
  for (const n of [TENNIS_CLIPS.serve, TENNIS_CLIPS.swing, VOLLEYBALL_CLIPS.swing, VOLLEYBALL_CLIPS.block]) assert.ok(NET_CONTACT_SEC[n] > 0, `${n} names its contact beat`);
});
ok('the precision gestures resolve (address / swing / putt / finish, stance / swing / pitches, kicker / keeper / hold / rise)', () => {
  for (const n of [SPORT_CLIP.golfAddress, SPORT_CLIP.golfSwing, SPORT_CLIP.golfPutt, SPORT_CLIP.golfFinish,
    SPORT_CLIP.derbyStance, SPORT_CLIP.derbySwing, SPORT_CLIP.derbyPitch, SPORT_CLIP.derbyPitchSide,
    SPORT_CLIP.penaltyIdle, SPORT_CLIP.penaltyStrike, SPORT_CLIP.footballJukeLeft, SPORT_CLIP.moveLoop,
    SPORT_CLIP.keeperIdle, SPORT_CLIP.keeperDive, SPORT_CLIP.keeperDiveHold, SPORT_CLIP.keeperRise,
    SPORT_CLIP.tennisShuffleLeft, SPORT_CLIP.tennisShuffleRight, SPORT_CLIP.volleyShuffleLeft, SPORT_CLIP.volleyShuffleRight]) assert.ok(isResolvable(n), `${n} resolvable`);
  assert.ok(GOLF_CONTACT_SEC.golf_swing_full > 0.3 && GOLF_CONTACT_SEC.golf_swing_full < 0.9, 'the swing meets the ball inside the clip');
  assert.ok(GOLF_CONTACT_SEC.golf_putt > 0.2 && GOLF_CONTACT_SEC.golf_putt < 0.8, 'the putt meets the ball inside the clip');
});

console.log('\nB. priorities');
ok('swing > serve > block > shuffle > ready; the shuffle follows the body-frame sign', () => {
  assert.equal(chooseNetClip({ ...BASE, swing: true, serve: true, block: true, move: 1 }, TENNIS_CLIPS).state, 'swing');
  assert.equal(chooseNetClip({ ...BASE, serve: true, block: true, move: 1 }, TENNIS_CLIPS).state, 'serve');
  assert.equal(chooseNetClip({ ...BASE, block: true, move: 1 }, VOLLEYBALL_CLIPS).state, 'block');
  assert.equal(chooseNetClip({ ...BASE, move: -0.4 }, TENNIS_CLIPS).state, 'shuffle_left');
  assert.equal(chooseNetClip({ ...BASE, move: 0.4 }, TENNIS_CLIPS).state, 'shuffle_right');
  assert.equal(chooseNetClip(BASE, VOLLEYBALL_CLIPS).clip, 'volleyball_ready');
  assert.equal(chooseNetClip({ ...BASE, move: 1 }, VOLLEYBALL_CLIPS).clip, 'volleyball_shuffle_right');
  assert.equal(chooseNetClip({ ...BASE, swing: true }, TENNIS_CLIPS).loop, false);
  assert.equal(chooseNetClip({ ...BASE, move: 1 }, TENNIS_CLIPS).loop, true);
});

console.log('\nC. one owner (net)');
ok('the tree dedupes and carries its own onEnd on beats only', () => {
  const log: Played[] = []; const tree = new NetAnimTree(mockAnimator(log), TENNIS_CLIPS);
  tree.update(BASE); tree.update(BASE); assert.equal(log.length, 1); assert.equal(log[0].clip, 'tennis_ready'); assert.equal(log[0].onEnd, undefined);
  tree.update({ ...BASE, swing: true }); assert.equal(log[1].clip, 'tennis_swing'); assert.equal(log[1].loop, false); assert.ok(log[1].onEnd);
  tree.update({ ...BASE, swing: true }); assert.equal(log.length, 2, 'a held latch does not restart the swing');
});
ok('a swing that ran out under a held stick settles straight onto the shuffle (no ready flash), and reports the settle', () => {
  const log: Played[] = []; const tree = new NetAnimTree(mockAnimator(log), TENNIS_CLIPS);
  const settled: string[] = []; tree.onSettle = (s) => settled.push(s);
  tree.update({ ...BASE, move: 1 }); assert.equal(log[0].clip, 'tennis_shuffle_right');
  tree.update({ ...BASE, move: 1, swing: true }); assert.equal(log[1].clip, 'tennis_swing');
  log[1].onEnd!();                                        // natural end, the stick still held, the latch not yet cleared
  assert.equal(log[2].clip, 'tennis_shuffle_right', 'lands on the shuffle'); assert.equal(log.length, 3);
  assert.deepEqual(settled, ['swing']);
  tree.update({ ...BASE, move: 1, swing: true }); assert.equal(log.length, 3, 'the spent beat does not re-fire while its latch holds');
  tree.update({ ...BASE, move: 1 }); assert.equal(log.length, 3, 'the shuffle is already current');
  tree.update({ ...BASE, move: 1, swing: true }); assert.equal(log[3].clip, 'tennis_swing', 'a fresh latch after a drop re-fires');
});
ok('a beat the tree cut itself is ignored when its end callback fires; clearBeat re-arms a held latch', () => {
  const log: Played[] = []; const tree = new NetAnimTree(mockAnimator(log), VOLLEYBALL_CLIPS);
  tree.update({ ...BASE, block: true }); const blockEnd = log[0].onEnd!;
  tree.update({ ...BASE, swing: true }); assert.equal(log[1].clip, 'volleyball_spike');   // the spike cut the block
  blockEnd();                                                                              // Babylon raises the end from stop()
  assert.equal(log.length, 2, 'the cut block does not settle over the spike');
  log[1].onEnd!(); assert.equal(log[2].clip, 'volleyball_ready');
  tree.update({ ...BASE, swing: true }); assert.equal(log.length, 3, 'spent');
  tree.clearBeat('swing'); tree.update({ ...BASE, swing: true }); assert.equal(log[3].clip, 'volleyball_spike', 'a second touch re-fires the spike');
});
ok('settleNetAfter clears only its own trigger', () => {
  assert.equal(settleNetAfter('swing', { ...BASE, swing: true, serve: true }, TENNIS_CLIPS).state, 'serve');
  assert.equal(settleNetAfter('serve', { ...BASE, serve: true, move: -1 }, TENNIS_CLIPS).state, 'shuffle_left');
  assert.equal(settleNetAfter('block', { ...BASE, block: true }, VOLLEYBALL_CLIPS).state, 'ready');
});

console.log('\nD. precision beats (BeatOwner)');
ok('a beat asked for before its settle loop lands on that loop: swing → finish hold, dive → stretch hold, rise → set', () => {
  const log: Played[] = []; const o = new BeatOwner(mockAnimator(log));
  o.loop('golf_address_idle');
  o.beat('golf_swing_full'); o.loop('golf_finish_hold');
  assert.deepEqual(log.map((p) => p.clip), ['golf_address_idle', 'golf_swing_full'], 'the finish loop is recorded, not played over the swing');
  log[1].onEnd!(); assert.equal(log[2].clip, 'golf_finish_hold'); assert.equal(log[2].loop, true);
  o.loop('golf_address_idle'); assert.equal(log[3].clip, 'golf_address_idle', 'back to the address at the lie');
  const k: Played[] = []; const keeper = new BeatOwner(mockAnimator(k));
  keeper.loop('keeper_set'); keeper.beat('keeper_dive.M'); keeper.loop('keeper_dive_hold');
  k[1].onEnd!(); assert.equal(k[2].clip, 'keeper_dive_hold');
  keeper.beat('keeper_rise'); keeper.loop('keeper_set'); assert.equal(k[3].clip, 'keeper_rise');
  k[3].onEnd!(); assert.equal(k[4].clip, 'keeper_set'); assert.equal(k.length, 5);
});

console.log('\nE. source guards');
ok('NetSportMode never calls animator.play; the live golf / derby / penalty modes never call it', () => {
  const net = readFileSync('lib/babylon/modes/NetSportMode.ts', 'utf8');
  assert.ok(!/\.animator\.play\(/.test(net), 'NetSportMode plays through NetAnimTree only');
  assert.ok(/new NetAnimTree\(/.test(net) && /meTree\.update\(/.test(net) && /foeTree\.update\(/.test(net), 'both bodies ride the tree');
  const prec = readFileSync('lib/babylon/modes/precisionModes.ts', 'utf8');
  const live = prec.slice(prec.indexOf('══ GOLF ══'));
  assert.ok(live.length > 1000, 'the live section found');
  assert.ok(!/\.animator\.play\(/.test(live), 'golf / derby / penalty play through BeatOwner only');
  for (const n of ['meAnim', 'pitcherAnim', 'keeperAnim']) assert.ok(new RegExp(`${n} = new BeatOwner\\(`).test(live), `${n} owned`);
  assert.ok(/GOLF_CONTACT_SEC\[/.test(live) && /PITCH_RELEASE_SEC/.test(live) && /KICK_CONTACT_SEC/.test(live), 'the ball leaves on the contact keys');
  assert.ok(/registerMirroredClips\(keeper\.animator/.test(live), 'the left dive is the registered mirror');
});

console.log(`\nnet-anim-tests: ${pass} checks green`);
