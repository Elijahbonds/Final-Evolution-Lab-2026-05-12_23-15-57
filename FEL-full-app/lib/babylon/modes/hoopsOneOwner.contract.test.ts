// HOOPS MOTION phase 3d — ONE OWNER PER BODY, the mode side (plan §3): 3PT's raw onEnd chains moved onto BeatOwner, and a left-stick
// crossover in 1v1 plays one beat from one source (S2). The animator side (the crossfade re-entrancy) is CharacterAnimator.reentry.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { BeatOwner } from '../anim/beatOwner';

const src = (f: string) => readFileSync(`lib/babylon/modes/${f}`, 'utf8');

describe('3PT: every clip the shooter and the sideline bodies play goes through a BeatOwner', () => {
  const mode = src('ThreePointMode.ts');
  it('no raw play / freeze / onEnd chain is left in the mode', () => {
    expect(mode).not.toMatch(/animator\.play\(/);
    expect(mode).not.toMatch(/animator\.freezeAtEnd\(/);
    expect(mode).not.toMatch(/onEnd:/);
    expect(mode).toMatch(/beats = new BeatOwner\(player\.animator\)/);
    expect(mode).toMatch(/owners\.push\(new BeatOwner\(b\.animator\)\)/);
  });
  it('the set holds, the shot holds, the follow-through chains to its absorb, the jog cuts a beat in flight', () => {
    expect(mode).toMatch(/beats\?\.beat\('bball_pullup_gather', \{ fadeSec: 0\.1, holdEnd: true \}\)/);
    expect(mode).toMatch(/beats\?\.beat\('jumpshot', \{ speedRatio: SHOT_CLIP_SPEED, fadeSec: 0\.08, holdEnd: true \}\)/);
    expect(mode).toMatch(/beats\?\.beat\(ftClip, \{ fadeSec: 0\.08, onSettle: \(\) => beats\?\.beat\('bball_land_absorb', \{ fadeSec: 0\.1 \}\) \}\)/);
    expect(mode).toMatch(/beats\?\.loop\(k < 1 \? 'run' : WATCH_IDLE\); beats\?\.settle\(\);/);
  });
});

/** The 3PT shooter's clips as the mode now plays them, on the real animator: never two clips at full weight. */
describe('3PT on the real animator: a make\'s celebrate, the next ball\'s set, the shot, the follow-through and its absorb', () => {
  it('plays the shootout\'s sequence with 0 frames of two clips at full weight (rE: 80 on one shot)', () => {
    const engine = new NullEngine();
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
    const scene = new Scene(engine); scene.useConstantAnimationDeltaTime = true;
    new FreeCamera('cam', new Vector3(0, 0, -5), scene);
    const node = new TransformNode('bone', scene);
    const clip = (name: string, sec: number) => {
      const a = new Animation(`${name}_x`, 'position.x', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
      const n = Math.round(sec * 60); a.setKeys([{ frame: 0, value: 0 }, { frame: n, value: 10 }]);
      const g = new AnimationGroup(name, scene); g.addTargetedAnimation(a, node); g.normalize(0, n); return g;
    };
    const groups = [clip('bball_idle_stand', 0.5), clip('run', 0.6), clip('bball_pullup_gather', 0.35), clip('jumpshot', 0.9), clip('bball_follow_through', 0.65), clip('bball_land_absorb', 0.4), clip('dunk_celebrate_big', 0.9)];
    const animator = new CharacterAnimator(scene, groups);
    const beats = new BeatOwner(animator);
    let stacked = 0, frames = 0;
    const run = (n: number) => { for (let i = 0; i < n; i++) { scene.render(); frames++; if (groups.filter((g) => g.isPlaying && CharacterAnimator.weightOf(g) >= 0.9).length >= 2) stacked++; } };
    const WATCH_IDLE = 'bball_idle_stand';
    // the jog to the rack (per frame), then the arrival
    for (let i = 0; i < 20; i++) { beats.loop('run'); beats.settle(); run(1); }
    beats.loop(WATCH_IDLE); beats.settle(); run(1);
    for (let shot = 0; shot < 3; shot++) {
      beats.beat('bball_pullup_gather', { fadeSec: 0.1, holdEnd: true }); beats.loop(WATCH_IDLE, { fadeSec: 0.2 });   // setFeet
      run(40);                                                                                                           // the bar sweeps: the set holds
      beats.beat('jumpshot', { speedRatio: 1.5, fadeSec: 0.08, holdEnd: true }); run(27);                                // fire → the release
      beats.beat('bball_follow_through', { fadeSec: 0.08, onSettle: () => beats.beat('bball_land_absorb', { fadeSec: 0.1 }) });
      run(20);
      beats.beat('dunk_celebrate_big', { fadeSec: 0.12 });                                                               // the make lands mid follow-through
      run(30);                                                                                                           // the next ball comes off the rack mid-celebrate
    }
    run(90);
    expect(frames).toBeGreaterThan(400);
    expect(stacked).toBe(0);
    expect(groups.filter((g) => g.isPlaying).map((g) => g.name)).toEqual([WATCH_IDLE]);   // settled into the loop
    scene.dispose(); engine.dispose();
  });
});

describe('1v1 (S2): a left-stick crossover plays ONE beat, from the move picker', () => {
  const mode = src('OneVOneMode.ts');
  it('the hero\'s tree never plays its own crossover state; the crossover block resolves the move and doMove plays it', () => {
    const tree = mode.slice(mode.indexOf('meAnimTree.update({'), mode.indexOf('meAnimTree.update({') + 1200);
    expect(tree).toMatch(/speed01: drib\.speed01, crossover: false, crossoverDir/);
    const block = mode.slice(mode.indexOf('if (drib.crossover && !finish && !posting) {'));
    expect(block.slice(0, 1600)).toMatch(/doMove\(ctx, moveFromContext\(\{/);
  });
  it('(3d review) the flick always has a body: the crossover block marks its doMove as a flick, and a flick\'s clip is flickClip (the crossover for off the head)', () => {
    const block = mode.slice(mode.indexOf('if (drib.crossover && !finish && !posting) {'));
    expect(block.slice(0, 1800)).toMatch(/inHisChest: foeLive && foeDist < OFF_THE_HEAD_RANGE,\s*\}, handle\), undefined, true\);/);
    const fn = mode.slice(mode.indexOf('function doMove('), mode.indexOf('function doMove(') + 2400);
    expect(fn).toMatch(/function doMove\(ctx: ModeContext, move: HandleMove, dirHint\?: 'left' \| 'right', flick = false\)/);
    expect(fn).toMatch(/const clip = flick \? flickClip\(move, moveDir\) : moveClip\(move, moveDir\);/);
    expect(fn).toMatch(/if \(clip\) meAnimTree\.beat\(clip,/);
    // every other doMove (the right-stick gestures, the hesi) keeps its own clip or none: only the crossover block is a flick
    const calls = mode.match(/doMove\(ctx, [^;]*;/g) ?? [];
    expect(calls.filter((c) => /, true\);$/.test(c))).toHaveLength(1);
  });
});
