// GAMEPLAY-CLEAN P5 — A ONE-SHOT THAT RUNS OUT INSIDE ITS OWN FADE-OUT IS HELD (CharacterAnimator, FADE_HOLD_ENDED_ON / feel
// `anim.fadeHoldEnded`). A strike or a hit react cut a few frames before its natural end reaches that end inside the crossfade; Babylon
// stops its group, the weight it still had is gone in one frame, and the gap is filled with the incoming clip's stale "original value"
// (the pose the bones held when that clip started). The rig read it in play as a whole-body one-frame pop (Showdown: hit react → guard,
// arms 21–30°, thighs 22–25°; Karate: jab → run, forearm 31–39°).
//   1. A toy rig (one node, a rising one-shot cut into a still loop): the knob at 0 gives the one-frame step, the default does not.
//   2. The real hero, the Showdown case: `karate_hit_react` (the capture) cut into `guard` over 0.2 s, 4 frames before its end.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Animation, AnimationGroup, FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { CharacterAnimator, FADE_HOLD_ENDED_ON } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { installOpponentMotion } from './opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';

afterEach(() => knob.v.clear());

// ── 1. the toy rig ──────────────────────────────────────────────────────────────────────────────────────────────────────
function toy(cutAtFrame: number, fadeSec: number, loopOut = false) {
  const engine = new NullEngine(); const scene = new Scene(engine);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 16;
  scene.useConstantAnimationDeltaTime = true;   // every render() is 16 ms of clip time
  const node = new TransformNode('bone', scene); new FreeCamera('cam', new Vector3(0, 0, -5), scene);
  const clip = (name: string, keys: { frame: number; value: number }[]) => {
    const a = new Animation(`${name}_x`, 'position.x', 60, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE); a.setKeys(keys);
    const g = new AnimationGroup(name, scene); g.addTargetedAnimation(a, node); return g;
  };
  // the strike: x rises 0 → 30 over 60 frames (1 s) — still moving 0.5 a frame at its end; the guard: x = 0, a loop
  const strike = clip('strike', [{ frame: 0, value: 0 }, { frame: 60, value: 30 }]);
  const guard = clip('guard', [{ frame: 0, value: 0 }, { frame: 60, value: 0 }]);
  const anim = new CharacterAnimator(scene, [strike, guard]);
  anim.play('strike', { loop: loopOut, fadeSec: 0 });
  for (let i = 0; i < cutAtFrame; i++) scene.render();
  anim.play('guard', { loop: true, fadeSec });
  let prev = node.position.x, maxStep = 0, heldFrames = 0;
  const xs: number[] = [];
  for (let i = 0; i < 60; i++) {
    scene.render();
    if (!loopOut && strike.isPlaying && strike.loopAnimation) heldFrames++;   // the frozen loop on the one-shot's last frame
    const x = node.position.x; maxStep = Math.max(maxStep, Math.abs(x - prev)); prev = x; xs.push(x);
  }
  const out = { maxStep, heldFrames, endX: node.position.x, strikePlayingAtEnd: strike.isPlaying, guardWeight: CharacterAnimator.weightOf(guard), xs };
  scene.dispose(); engine.dispose();
  return out;
}

describe('a one-shot that ends inside its fade-out (toy rig)', () => {
  it('the default is on', () => { expect(FADE_HOLD_ENDED_ON).toBe(1); });

  it('knob at 0 (the old animator): the body steps in one frame when the outgoing one-shot runs out', () => {
    knob.v.set('anim.fadeHoldEnded', 0);
    const r = toy(48, 0.4);           // cut 12 frames before the strike's end, a 0.4 s (25-frame) fade
    expect(r.maxStep).toBeGreaterThan(3);      // 4.4 measured: the smooth fade around it moves 0.7–0.9 a frame
    expect(r.heldFrames).toBe(0);
  });

  it('default: the same cut fades through the one-shot\'s end with no step, and ends on the incoming clip alone', () => {
    const r = toy(48, 0.4);
    expect(r.maxStep).toBeLessThan(1.6);
    expect(r.heldFrames).toBeGreaterThan(5);   // held (frozen on its last frame) for the rest of the fade…
    expect(r.strikePlayingAtEnd).toBe(false);  // …and retired when the fade ends
    expect(r.endX).toBeCloseTo(0, 6);
    expect(r.guardWeight).toBe(1);
  });

  it('a one-shot whose end falls after the fade is untouched, on or off (same frames, bit for bit)', () => {
    const a = toy(20, 0.2);
    knob.v.set('anim.fadeHoldEnded', 0);
    const b = toy(20, 0.2);
    expect(a.xs).toEqual(b.xs);
    expect(a.heldFrames).toBe(0);
  });

  it('an outgoing LOOP is untouched, on or off', () => {
    const a = toy(48, 0.4, true);
    knob.v.set('anim.fadeHoldEnded', 0);
    const b = toy(48, 0.4, true);
    expect(a.xs).toEqual(b.xs);
  });
});

// ── 2. the real hero: Showdown's hit react → guard ──────────────────────────────────────────────────────────────────────
const BONES = ['Spine', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
let scene: Scene, sk: Skeleton, animator: CharacterAnimator, engine: NullEngine;
beforeAll(async () => {
  engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  sanitizeImportedGroups(r.animationGroups);
  animator = new CharacterAnimator(scene, r.animationGroups);
  registerAuthoredClips(animator, scene, sk, null);
  neverBindPose(animator, 'idle_stand');
  installOpponentMotion(animator, scene, sk, null);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  scene.useConstantAnimationDeltaTime = true;
}, 120_000);

const pose = () => BONES.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
/** Play `shot` from its start, cut to `to` (a loop) `before` frames ahead of the shot's natural end; the largest one-frame turn of
 *  any of BONES on the frame the shot runs out and the two after it, and the largest over the fade's other frames. */
function cut(shot: string, to: string, fadeSec: number, before: number): { atEnd: number; elsewhere: number; ranOutInFade: boolean } {
  animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); scene.render();
  const g = animator.play(shot, { loop: false, fadeSec: 0, restart: true })!;
  let n = 0; while (g.isPlaying && n < 600) { scene.render(); n++; }
  expect(n).toBeGreaterThan(before + 4);           // the shot's length in frames
  animator.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); scene.render();
  const s = animator.play(shot, { loop: false, fadeSec: 0, restart: true })!;
  for (let i = 0; i < n - before; i++) scene.render();
  expect(s.isPlaying).toBe(true);
  animator.play(to, { loop: true, fadeSec });
  let prev = pose(), atEnd = 0, elsewhere = 0;
  const frames = Math.ceil(fadeSec * 60) + 4;
  for (let i = 0; i < frames; i++) {
    scene.render();
    const now = pose(); const step = Math.max(...now.map((q, k) => ang(q, prev[k]))); prev = now;
    if (i >= before - 2 && i <= before + 2) atEnd = Math.max(atEnd, step); else elsewhere = Math.max(elsewhere, step);
  }
  return { atEnd, elsewhere, ranOutInFade: before < frames - 4 };
}

describe('the real hero: a hit react cut into the guard 4 frames before its end (Showdown, 0.2 s)', () => {
  it('knob at 0: the frame the react runs out is the fade\'s worst by far; default: it is no worse than the fade around it', () => {
    knob.v.set('anim.fadeHoldEnded', 0);
    const old = cut('karate_hit_react', 'guard', 0.2, 4);
    knob.v.clear();
    const now = cut('karate_hit_react', 'guard', 0.2, 4);
    expect(old.ranOutInFade).toBe(true);
    console.log(`hit react → guard: old at-end ${old.atEnd.toFixed(1)}° (elsewhere ${old.elsewhere.toFixed(1)}°), now at-end ${now.atEnd.toFixed(1)}° (elsewhere ${now.elsewhere.toFixed(1)}°)`);
    expect(old.atEnd, `old ${JSON.stringify(old)} now ${JSON.stringify(now)}`).toBeGreaterThan(old.elsewhere * 1.5);
    expect(now.atEnd, `old ${JSON.stringify(old)} now ${JSON.stringify(now)}`).toBeLessThan(old.atEnd * 0.6);
    expect(now.atEnd).toBeLessThan(Math.max(now.elsewhere, old.elsewhere) * 1.25);
  }, 120_000);

  it('the jab cut into the run 4 frames before its end (Karate, 0.18 s): the same', () => {
    knob.v.set('anim.fadeHoldEnded', 0);
    const old = cut('karate_punch_light', 'run_forward', 0.18, 4);
    knob.v.clear();
    const now = cut('karate_punch_light', 'run_forward', 0.18, 4);
    console.log(`jab → run: old at-end ${old.atEnd.toFixed(1)}° (elsewhere ${old.elsewhere.toFixed(1)}°), now at-end ${now.atEnd.toFixed(1)}° (elsewhere ${now.elsewhere.toFixed(1)}°)`);
    expect(now.atEnd, `old ${JSON.stringify(old)} now ${JSON.stringify(now)}`).toBeLessThan(old.atEnd * 0.75);
  }, 120_000);
});
