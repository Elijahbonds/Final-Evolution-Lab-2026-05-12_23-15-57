// GAMEPLAY-CLEAN P6 — two holes in the inertial blend (AF-1, `anim.inertial`), found measuring it against the linear crossfade on the
// hero. Both fail on the code before P6.
//   LATE SWITCH: a clip switched from INSIDE the animation pass (a one-shot's end callback: every tree's settle, neverBindPose's "back
//     to the base loop") shows, on that frame, a pose that is neither clip's; the switch was captured against it and the next frame
//     jumped (a hit react ending into the idle: the left forearm 55.3° in one frame). Now that frame holds the last shown pose and the
//     switch is captured a frame later, against the new clip's real pose.
//   PARTIAL CLIPS: a node the current clip does not key (the authored `guard` keys 7 bones) went unrecorded, so the next clip that
//     keys it found no fresh pose and applied no offset (jab → guard → guard step: the right leg 35.7° in one frame). Every tracked
//     node is recorded every frame now.
//   UNTRACKED NODES (clean-6): a node got a track only once a clip keying it was current, so a body that had only shown clips that
//     leave it alone (the authored idle and guard key 7 bones each) switched it with no offset (guard → the high kick: the right
//     knee 68.4° in one frame; linear 17.5°). The switch-on lane's anim.inertialAllBones (on) tracks every node any of the body's
//     clips keys from the first inertial frame; this test holds it.
// Linear (the shipped default) is untouched: nothing here runs unless a body is in inertial mode.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { installOpponentMotion } from './opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';

const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
let scene: Scene, sk: Skeleton, A: CharacterAnimator;
beforeAll(async () => {
  const engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; sanitizeImportedGroups(r.animationGroups);
  A = new CharacterAnimator(scene, r.animationGroups); registerAuthoredClips(A, scene, sk, null); neverBindPose(A, 'idle_stand'); installOpponentMotion(A, scene, sk, null);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
}, 120_000);

const pose = () => BONES.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
type Step = [string, { loop?: boolean; fadeSec: number }, number];
const cur = () => (A as unknown as { currentName: string }).currentName;
/**
 * Play the steps in `mode` after a warm-up on `idle_stand` (a mode sets the blend at spawn, so the blend has a pose history; it keys 7
 * rotations, like the guard). Returns the largest one-frame turn of each bone in the frames `window` picks (frame index, the clip now current).
 */
function turns(steps: Step[], mode: 'linear' | 'inertial', window: (f: number, clip: string, prevClip: string) => boolean): Record<string, number> {
  A.setBlendMode('linear'); A.setBlendMode(mode); A.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 20; i++) scene.render();
  let prev = pose(), f = 0, prevClip = cur(); const by: Record<string, number> = { all: 0 };
  for (const [clip, o, frames] of steps) {
    A.play(clip, o);
    for (let i = 0; i < frames; i++, f++) {
      scene.render(); const now = pose(); const c = cur();
      if (window(f, c, prevClip)) now.forEach((q, k) => { const a = ang(q, prev[k]); by[BONES[k]] = Math.max(by[BONES[k]] ?? 0, a); by.all = Math.max(by.all, a); });
      prev = now; prevClip = c;
    }
  }
  A.setBlendMode('linear');
  return by;
}
/** A window of `n` frames from the frame the body's clip became `clip` (the end callback's settle), and the 2 frames before it. */
function aroundSettle(clip: string, n = 10): (f: number, c: string, p: string) => boolean {
  let at = -1;
  return (f, c, p) => { if (at < 0 && c === clip && p !== clip) at = f; return at >= 0 ? f - at < n : false; };
}

describe('the inertial blend: a switch made inside the animation pass (LATE SWITCH)', () => {
  // the hit react and the knockdown are one-shots with no onEnd of their own: neverBindPose plays the idle FROM THEIR END CALLBACK
  it('a hit react running out into the idle: the frames around the switch stay under 20° (55.3° in one frame before P6)', () => {
    const r = turns([['karate_guard_step', { loop: true, fadeSec: 0.16 }, 30], ['karate_hit_react', { fadeSec: 0.05 }, 45]], 'inertial', aroundSettle('idle_stand'));
    expect(r.all, JSON.stringify(r)).toBeGreaterThan(0);   // the window was reached
    // the arms: the bones the late switch threw (the left forearm 55.3°). clean-6: the switch-on lane's anim.inertialAllBones (on)
    // eases the legs the idle does not key onto their rest here, the thighs 25° a frame — that is its own motion, measured in §4h.
    for (const b of ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']) expect(r[b], JSON.stringify(r)).toBeLessThan(20);
  }, 60_000);
  it('a knockdown running out the same way: under 20° (56.6° before P6)', () => {
    const r = turns([['karate_guard_step', { loop: true, fadeSec: 0.16 }, 20], ['karate_knockdown', { fadeSec: 0.08 }, 90]], 'inertial', aroundSettle('idle_stand'));
    expect(r.all, JSON.stringify(r)).toBeGreaterThan(0);
    for (const b of ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']) expect(r[b], JSON.stringify(r)).toBeLessThan(20);   // the right arm was 56.6°
  }, 60_000);
});

describe('the inertial blend: a clip that keys fewer bones in between (PARTIAL CLIPS)', () => {
  it('jab → guard (keys 7 bones) → guard step: on the guard step switch the right leg moves under 5° (35.7° before P6)', () => {
    const steps: Step[] = [['karate_punch_light', { fadeSec: 0.06 }, 18], ['karate_idle_stance', { loop: true, fadeSec: 0.2 }, 3], ['karate_guard_step', { loop: true, fadeSec: 0.16 }, 20]];
    const inert = turns(steps, 'inertial', (f) => f >= 21 && f <= 26);
    const lin = turns(steps, 'linear', (f) => f >= 21 && f <= 26);
    expect(inert.RightLeg, JSON.stringify(inert)).toBeLessThan(5);
    expect(inert.all, `inertial ${inert.all.toFixed(1)}°, linear ${lin.all.toFixed(1)}°`).toBeLessThan(lin.all);
  }, 60_000);
});

describe('the inertial blend: a node no clip shown so far has keyed (UNTRACKED NODES)', () => {
  it('idle → guard → the high kick: the right knee turns under 20° a frame on the switch (68.4° before clean-6; linear 17.5°)', () => {
    const steps: Step[] = [['guard', { loop: true, fadeSec: 0.2 }, 30], ['karate_mc_high_kick', { fadeSec: 0.06 }, 14]];
    const inert = turns(steps, 'inertial', (f) => f >= 29 && f <= 36);
    const lin = turns(steps, 'linear', (f) => f >= 29 && f <= 36);
    expect(lin.RightLeg, JSON.stringify(lin)).toBeGreaterThan(5);   // the window holds the kick's start
    expect(inert.RightLeg, JSON.stringify(inert)).toBeLessThan(20);
    // (with AF-1's offset alone it came in under linear, 13.4° against 17.5°; with the switch-on lane's minimum half-life and matched
    // velocity on, 17.7° against 17.3° — the same, so the bar is the old jump, not linear)
  }, 60_000);
});

describe('linear is untouched', () => {
  it('a body never put in inertial mode mounts no P6 observer', () => {
    const before = scene.onBeforeAnimationsObservable.observers.length;
    const B2 = new CharacterAnimator(scene, []);
    expect(scene.onBeforeAnimationsObservable.observers.length).toBe(before);
    B2.setBlendMode('inertial'); expect(scene.onBeforeAnimationsObservable.observers.length).toBe(before + 1);
    B2.setBlendMode('linear'); expect(scene.onBeforeAnimationsObservable.observers.length).toBe(before);
    B2.dispose();
  });
});
