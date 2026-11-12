// GAMEPLAY-CLEAN P6 — THE RUNWAY BOUNCE IS PUSHED (ballCarry, CARRY_PUSHED_BOUNCE_ON / feel `anim.carryPushedBounce`). The non-hoops carry
// (the dunk runway: DunkMode's `dribble`) bounced dribbleAt's ball, fastest at the palm and turning round there in one frame; the hand
// riding it turned with it — the ball arm 35–60° in ONE frame at every bounce's top (the rig's dunk run-up: 14 hard pops in 14 s).
// The real hero, its runway clip, the runway's own carry (side, params) and a 5 m/s run, headless at 60 fps.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Quaternion, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { installOpponentMotion, HERO_CAPTURE } from './opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';
import { mountBallCarry, CARRY_PUSHED_BOUNCE_ON } from './ballCarry';
import { DEFAULT_DRIBBLE, dribbleAt, dribbleAtPushed } from './Dribble';
import { attachBallToHand } from './ballRig';

afterEach(() => knob.v.clear());
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
let scene: Scene, sk: Skeleton, A: CharacterAnimator, root: TransformNode;
beforeAll(async () => {
  const engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as unknown as TransformNode; root.scaling.setAll(1); sanitizeImportedGroups(r.animationGroups);
  A = new CharacterAnimator(scene, r.animationGroups); registerAuthoredClips(A, scene, sk, null); neverBindPose(A, 'idle_stand'); installOpponentMotion(A, scene, sk, null, HERO_CAPTURE);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
}, 120_000);

/** The ball arm's largest one-frame turn over 3 s of the runway dribble, and the same arm with no carry (the clip's own). */
function runway(withCarry: boolean): number {
  root.position.setAll(0);
  A.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 10; i++) scene.render();
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene); (ball.metadata ??= {}).felPalmMirrorLeft = true;
  attachBallToHand(ball, sk, 'LeftHand');
  // DunkMode's runway carry: the rig's Left (hs('Right') on the right-handed dunker), DEFAULT_DRIBBLE at 1.8 / 2.8 Hz
  const carry = withCarry ? mountBallCarry({ scene, ball, root, skeleton: sk, side: 'Left', params: { ...DEFAULT_DRIBBLE, hzIdle: 1.8, hzFast: 2.8 } }) : null;
  A.play('bball_dribble_run', { loop: true, fadeSec: 0.12 });
  const arm = boneNode(sk, 'LeftArm')!;
  let prev = arm.rotationQuaternion!.clone(), worst = 0;
  for (let f = 0; f < 180; f++) {
    root.position.z += 5 / 60; carry?.update(1 / 60, 0.6, true); scene.render();
    const q = arm.rotationQuaternion!; if (f > 12) worst = Math.max(worst, ang(q, prev)); prev = q.clone();
  }
  carry?.dispose(); ball.dispose();
  return worst;
}

describe('the runway carry bounces the pushed shape', () => {
  it('the default is on; the two shapes share the palm (phase 0) and the floor depth', () => {
    expect(CARRY_PUSHED_BOUNCE_ON).toBe(1);
    const p = { ...DEFAULT_DRIBBLE, hzIdle: 1.8, hzFast: 2.8 };
    expect(dribbleAtPushed(0, p).hand.y).toBeCloseTo(dribbleAt(0, p).hand.y, 6);
    expect(dribbleAtPushed(0.999, p).hand.y).toBeCloseTo(dribbleAt(0, p).hand.y, 2);
  });
  it('knob at 0 (the runway as tuned): the ball arm turns over 40° in one frame at the bounce top; default: under 30°, at least 40 % less', () => {
    knob.v.set('anim.carryPushedBounce', 0);
    const old = runway(true);
    knob.v.clear();
    const now = runway(true);
    const clip = runway(false);
    console.log(`runway ball arm, worst one-frame turn: old ${old.toFixed(1)}°, pushed ${now.toFixed(1)}°, the clip alone ${clip.toFixed(1)}°`);
    expect(old).toBeGreaterThan(40);
    expect(now).toBeLessThan(30);
    expect(now).toBeLessThan(old * 0.6);
  }, 60_000);
});
