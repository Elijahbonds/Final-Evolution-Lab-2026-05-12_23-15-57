// Proof for the CharacterAnimator crossfade-orphan fix.
//
// crossFade() ramps the outgoing clip's weight down on onBeforeRenderObservable
// and only calls prev.stop() once the ramp reaches 1. If a NEW clip is requested
// before that ramp finishes, the old fade's observer was simply removed — so the
// clip it was ramping down never stopped, and stayed playing at partial weight
// forever, blending into every later pose.
//
// Any switch faster than fadeSec (0.15s default) triggers it: combo strings,
// rapid input, or a frame loop that stalls mid-fade.
//
// Runs on Babylon's NullEngine — real AnimationGroups, no GPU, deterministic.

import {
  NullEngine, Scene, TransformNode, Animation, AnimationGroup, Quaternion,
  FreeCamera, Vector3,
} from '@babylonjs/core';
import { CharacterAnimator } from '../lib/babylon/anim/CharacterAnimator';

let checks = 0;
const fail: string[] = [];
const ok = (cond: boolean, label: string): void => { checks++; if (!cond) fail.push(label); };

const engine = new NullEngine();
const scene = new Scene(engine);
// scene.render() refuses to run without an active camera, and the fade ramp is
// driven from onBeforeRenderObservable — so real frames are required here.
new FreeCamera('cam', new Vector3(0, 0, -5), scene);

/** One rotating joint per clip — enough for a real, playable AnimationGroup. */
function makeClip(name: string, node: TransformNode): AnimationGroup {
  const anim = new Animation(`${name}_rot`, 'rotationQuaternion', 60,
    Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
  anim.setKeys([
    { frame: 0, value: Quaternion.Identity() },
    { frame: 30, value: Quaternion.FromEulerAngles(0.5, 0, 0) },
  ]);
  const g = new AnimationGroup(name, scene);
  g.addTargetedAnimation(anim, node);
  return g;
}

const joint = new TransformNode('joint', scene);
joint.rotationQuaternion = Quaternion.Identity();
const groups = ['idle', 'walk', 'run'].map((n) => makeClip(n, joint));
const animator = new CharacterAnimator(scene, groups);

const playingNames = (): string[] => scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name);

// --- A. rapid switching must not strand clips -------------------------------
// Three clips requested back to back with NO frames rendered between them, so
// every crossfade is interrupted mid-ramp — the exact orphan condition.
animator.play('idle', { loop: true });
animator.play('walk', { loop: true });
animator.play('run', { loop: true });

const stranded = playingNames();
ok(stranded.includes('run'), 'A1 the requested clip is playing');
ok(!stranded.includes('idle'), `A2 interrupted clip 'idle' was stopped, not stranded (playing: ${stranded.join()})`);
ok(stranded.length <= 2, `A3 at most the outgoing + incoming clip remain (playing: ${stranded.join()})`);

async function main(): Promise<void> {
  // --- B. completing a fade retires the outgoing clip -----------------------
  // The ramp is driven by engine.getDeltaTime(), and that is only refreshed by
  // engine.beginFrame() — normally called by runRenderLoop, NOT by scene.render().
  // Calling render() alone leaves delta at 0 and the fade never advances.
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20; i++) {
    engine.beginFrame();
    scene.render();
    engine.endFrame();
    await sleep(16);
  }
  const settled = playingNames();
  ok(settled.length === 1, `B1 exactly one clip survives a completed fade (playing: ${settled.join()})`);
  ok(settled[0] === 'run', `B2 the surviving clip is the requested one (got ${settled.join()})`);

  // --- C. instant fade (fadeSec 0) leaves nothing behind --------------------
  animator.play('walk', { loop: true, fadeSec: 0 });
  const instant = playingNames();
  ok(instant.length === 1 && instant[0] === 'walk', `C1 fadeSec:0 swaps cleanly (playing: ${instant.join()})`);

  // --- D. re-requesting the current clip is not a switch --------------------
  animator.play('walk', { loop: true, fadeSec: 0 });
  ok(playingNames().length === 1, 'D1 replaying the current clip does not stack a duplicate');

  // -------------------------------------------------------------------------
  scene.dispose();
  engine.dispose();

  if (fail.length) {
    console.error(`crossfade-orphan-tests: ${fail.length} FAILED of ${checks}`);
    for (const f of fail) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`crossfade-orphan-tests: ${checks} checks green`);
}

void main();
