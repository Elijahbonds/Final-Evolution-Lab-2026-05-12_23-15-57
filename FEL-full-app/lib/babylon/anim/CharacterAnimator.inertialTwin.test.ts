// GAMEPLAY-CLEAN-7 — anim.inertialTwinLinear. A hoops body changes the dribble hand by switching between a loop and its left-hand
// twin (hoopsHand.leftDribbleTwins: the same loop mirrored across the body). Inertial, that switch starts an offset of 120–180° on each
// arm (the twin swaps the arms' roles), still ~45 % of it 8 frames on, under the carry's arm solve: in 3v3 with `anim.inertial` 1 both
// upper arms flipped 127–131° in ONE frame 7–8 frames after every hand change (the rig; GAMEPLAY-CLEAN-AUDIT §4i). Knob 1: that switch
// is a linear crossfade even on an inertial body — the pose frame for frame what a linear body shows. Knob 0: the inertial switch.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { installOpponentMotion, HERO_CAPTURE } from './opponentMotion';
import { sanitizeImportedGroups } from './importSanitizer';
import { leftDribbleTwins, rightHandHoops } from './hoopsHand';
import { boneNode } from './boneLookup';
import { ANIM_INERTIAL_TWIN_LINEAR_ON } from './inertialize';

afterEach(() => knob.v.clear());
const ARMS = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
let scene: Scene, sk: Skeleton, A: CharacterAnimator;
beforeAll(async () => {
  const engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; sanitizeImportedGroups(r.animationGroups);
  A = new CharacterAnimator(scene, r.animationGroups); registerAuthoredClips(A, scene, sk, null); installOpponentMotion(A, scene, sk, undefined, HERO_CAPTURE);
  rightHandHoops(A, sk); leftDribbleTwins(A, sk);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
}, 120_000);

const pose = () => ARMS.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
const weighted = () => scene.animationGroups.filter((g) => g.isPlaying && (g.animatables[0]?.weight ?? 1) > 0.02).length;
/** The right-hand dribble, then the hand change onto its left twin: the arms' pose on each of the 14 frames after, and how many frames
 *  had two clips weighted (a crossfade). */
function handChange(mode: 'linear' | 'inertial'): { poses: Quaternion[][]; blended: number } {
  A.setBlendMode('linear'); A.setBlendMode(mode);
  A.play('bball_dribble_idle', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 30; i++) scene.render();
  A.play('bball_dribble_idle_left', { loop: true, fadeSec: 0.2 });
  const poses: Quaternion[][] = []; let blended = 0;
  for (let f = 0; f < 14; f++) { scene.render(); poses.push(pose()); if (weighted() >= 2) blended++; }
  A.setBlendMode('linear');
  return { poses, blended };
}

describe('anim.inertialTwinLinear: the dribble hand change on an inertial body', () => {
  it('the twin is there, marked, and the knob defaults on', () => {
    expect(ANIM_INERTIAL_TWIN_LINEAR_ON).toBe(1);
    expect(A.clipNames.has('bball_dribble_idle_left')).toBe(true);
  });
  it('on: a linear crossfade, pose for pose what a linear body shows; 0: the inertial switch (no frame blends two clips)', () => {
    const lin = handChange('linear');
    const on = handChange('inertial');
    knob.v.set('anim.inertialTwinLinear', 0);
    const off = handChange('inertial');
    expect(lin.blended).toBeGreaterThan(8);
    expect(on.blended).toBe(lin.blended);
    let worst = 0;
    on.poses.forEach((p, f) => p.forEach((q, k) => { worst = Math.max(worst, ang(q, lin.poses[f][k])); }));
    expect(worst, 'the inertial body against the linear one, any arm, any frame').toBeLessThan(0.5);
    expect(off.blended).toBe(0);
  }, 120_000);
});
