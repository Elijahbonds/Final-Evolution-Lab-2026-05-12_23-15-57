// HOOPS MOTION phase 3d (final review): A ONE-SHOT CUT BY A PLAY FROM OUTSIDE THE COMBAT TREE. The animator drops a cut clip's end callback
// (CharacterAnimator.retire / detachEnd), so the tree never heard that its one-shot was over, and its get-up latch held the fighter in
// `get_up` — no strike, walk or guard animated — until he was hit. Two ENABLED modes play on a tree-owned fighter directly: Showdown's
// ultimate (karate_counter_throw every frame of the 'ultimate' phase, the trees not updated) and Duel's endRound (the loser's knockdown;
// on TIME and RING OUT the trees do not run that frame, and startRound does not reset them). The tree now sees the body's clip is not the
// one it played, settles that one-shot and re-enters from the context. The real CombatAnimTree and CharacterAnimator on a NullEngine.
import { describe, expect, it } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { CharacterAnimator } from './CharacterAnimator';
import { neverBindPose } from './importSanitizer';
import { CombatAnimTree, type CombatAnimInput, type CombatAnimState } from './combatTree';

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  scene.useConstantAnimationDeltaTime = true;
  new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const node = new TransformNode('bone', scene);
  const clip = (name: string, sec: number) => {
    const a = new Animation(`${name}_x`, 'position.x', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
    a.setKeys([{ frame: 0, value: 0 }, { frame: Math.round(sec * 60), value: 10 }]);
    const g = new AnimationGroup(name, scene); g.addTargetedAnimation(a, node); g.normalize(0, Math.round(sec * 60));
    return g;
  };
  const groups = [clip('karate_idle_stance', 0.5), clip('karate_knockdown', 0.5), clip('karate_floor_hold', 0.5), clip('karate_get_up', 1.0),
    clip('karate_counter_throw', 1.0), clip('karate_punch_light', 0.4), clip('karate_guard_step', 0.5), clip('karate_hit_react', 0.4)];
  const animator = new CharacterAnimator(scene, groups);
  neverBindPose(animator, 'karate_idle_stance');   // every spawned body has it (CharacterLibrary.spawn)
  const tree = new CombatAnimTree(animator);
  const settled: CombatAnimState[] = [];
  tree.onSettle = (st) => settled.push(st);
  /** the clips drawn at more than half weight this frame */
  const playing = () => groups.filter((g) => g.isPlaying && CharacterAnimator.weightOf(g) > 0.5).map((g) => g.name);
  const frames = (n: number) => { for (let i = 0; i < n; i++) scene.render(); };
  const step = (i: CombatAnimInput, n: number) => { for (let k = 0; k < n; k++) { tree.update(i); frames(1); } };
  return { animator, tree, settled, playing, frames, step, dispose: () => { scene.dispose(); engine.dispose(); } };
}

const IN: CombatAnimInput = { speed01: 0, dashing: false, hasWeapon: false, striking: null, blocking: false, parryFlash: false, guardImpactFlash: false, hitBy: null, down: false, out: false, ulting: false };

/** a guard break: knocked down, the floor, then the mode lets him rise — the get-up is running */
function rising(r: ReturnType<typeof rig>): void {
  r.step(IN, 10);
  r.step({ ...IN, down: true }, 40);
  r.step(IN, 5);
  expect(r.tree.state).toBe('get_up');
  expect(r.settled).toEqual(['knockdown']);   // the knockdown ran out on its own
  r.settled.length = 0;
}

describe('CombatAnimTree — a one-shot cut by a play from outside the tree', () => {
  it('Showdown: the ultimate cuts the get-up; back in the fight the stance, a jab and a walk all animate', () => {
    const r = rig();
    rising(r);
    for (let k = 0; k < 70; k++) { r.animator.play('karate_counter_throw', {}); r.frames(1); }   // the 'ultimate' phase: the trees not updated
    r.step(IN, 30);
    expect(r.tree.state).toBe('idle');                        // aa4e9f5d: 'get_up' for good
    expect(r.playing()).toEqual(['karate_idle_stance']);      // aa4e9f5d: the counter throw's last frame
    expect(r.settled).toEqual(['get_up']);                    // settled once, as a get-up that had run out
    r.step({ ...IN, striking: 'light' }, 5);
    expect(r.tree.state).toBe('strike_light');
    expect(r.playing()).toEqual(['karate_punch_light']);
    r.step({ ...IN, speed01: 0.6 }, 20);
    expect(r.tree.state).toBe('walk');
    expect(r.playing()).toEqual(['karate_guard_step']);
    r.dispose();
  });

  it('Duel: a TIME round end during the get-up (the loser\'s knockdown, 2 s without a tree update); the next round\'s jab animates', () => {
    const r = rig();
    rising(r);
    r.animator.play('karate_knockdown', {});   // DuelMode.endRound
    r.frames(120);                             // roundOver
    r.step(IN, 10);                            // startRound → fighting
    expect(r.tree.state).toBe('idle');
    expect(r.playing()).toEqual(['karate_idle_stance']);
    r.step({ ...IN, striking: 'light' }, 5);
    expect(r.tree.state).toBe('strike_light');
    expect(r.playing()).toEqual(['karate_punch_light']);
    r.dispose();
  });

  it('the tree\'s OWN cuts are not outside cuts: a jab cut by a hit settles nothing but the react that runs out', () => {
    const r = rig();
    r.step(IN, 10);
    r.step({ ...IN, striking: 'light' }, 3);
    r.step({ ...IN, hitBy: 'light' }, 40);     // the tree cuts its strike for the react, which runs out on its own under the flash
    r.step(IN, 10);
    expect(r.settled).toEqual(['react_light']);
    expect(r.tree.state).toBe('idle');
    expect(r.playing()).toEqual(['karate_idle_stance']);
    r.dispose();
  });

  it('a one-shot trigger still held when an outside play cut it does not swing again until it drops (settled, as if it had run out)', () => {
    const r = rig();
    r.step(IN, 10);
    r.step({ ...IN, striking: 'light' }, 3);
    r.animator.play('karate_counter_throw', {}); r.frames(1);   // an outside play mid-swing
    r.step({ ...IN, striking: 'light' }, 10);                   // the mode still reports the swing
    expect(r.settled).toEqual(['strike_light']);
    expect(r.tree.state).toBe('idle');
    r.step({ ...IN, striking: 'light' }, 1);
    expect(r.tree.state).toBe('idle');                          // not replayed while the old trigger holds
    r.dispose();
  });

  it('an animator stub that returns a clip but cannot say which is on the body never reads as a cut', () => {
    const plays: string[] = [];
    const stub = { play: (clip: string) => { plays.push(clip); return {}; }, setPlaybackScale: () => {} };
    const tree = new CombatAnimTree(stub as never);
    const settled: CombatAnimState[] = [];
    tree.onSettle = (st) => settled.push(st);
    for (let k = 0; k < 5; k++) tree.update({ ...IN, striking: 'light' });
    expect(tree.state).toBe('strike_light');
    expect(plays).toEqual(['karate_punch_light']);
    expect(settled).toEqual([]);
  });

  it('a LOOP cut from outside is left alone: an owner playing every frame keeps the body while the tree updates too', () => {
    const r = rig();
    r.step(IN, 20);
    expect(r.tree.state).toBe('idle');
    for (let k = 0; k < 30; k++) { r.animator.play('karate_counter_throw', {}); r.tree.update(IN); r.frames(1); }
    expect(r.playing()).toEqual(['karate_counter_throw']);    // never re-entered: no fight, no restart every frame
    expect(r.settled).toEqual([]);
    r.dispose();
  });
});
