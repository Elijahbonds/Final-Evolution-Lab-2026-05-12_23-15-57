// MUSIC-SUITE P9 FIX PASS (2026-09-29): THE HELD FREEZE, ON THE REAL HERO RIG (the anim probe pattern: NullEngine +
// public/models/fel-hero.glb, the production clip builder and CharacterAnimator — not a re-implementation). The dance dev
// server (:3121) was down for this pass as for every phase before it, so this is the live-rig proof of DanceMode's pose
// hold: the baby freeze is a 2-beat loop (STAND → freeze at ½ → held to 1½ → STAND at 2), and a 3-beat press hold on it
// used to stand the dancer up and drop him again mid-HOLD. Played as the room plays it — a loop at the clip's speed —
// then slowed to HOLD_POSE_SPEED at the pose (floorPhase.holdPoseDue's moment) the body stays on the floor for as long as
// it is held, and runs on into its rise when released; the same loop left alone has stood up and gone round again.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../anim/boneLookup';
import { buildDanceClip } from '../anim/danceClips';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { FLOOR_PHASE, HOLD_POSE_LEAD_BEATS, HOLD_POSE_SPEED } from './floorPhase';

const SEC_PER_BEAT = 0.5;   // danceClips author at 120 BPM: speed 1 = a beat every half second
const FRAME_MS = 16;   // scene.useConstantAnimationDeltaTime: 16 ms of animation a frame, whatever the wall clock does
const BONES = ['Hips', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'Spine'];

let scene: Scene;
let sk: Skeleton;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
  (scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => FRAME_MS;
  scene.useConstantAnimationDeltaTime = true;
});

const pose = (): Quaternion[] => BONES.map((b) => boneNode(sk, b)!.rotationQuaternion!.clone());
/** The largest angle (deg) any bone moved between two poses. */
const moved = (a: Quaternion[], b: Quaternion[]): number => Math.max(...a.map((q, i) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(q, b[i])))) * 180) / Math.PI));
const frames = (sec: number): void => { for (let i = 0; i < Math.round((sec * 1000) / FRAME_MS); i++) scene.render(); };

describe('the baby freeze held on the hero rig', () => {
  it('slowed at its pose it stays on the floor through a 3-beat hold, then rises; left alone it stood up and went round', () => {
    const freeze = buildDanceClip(scene, sk, 'dance_freeze_baby')!;
    const standing = buildDanceClip(scene, sk, 'dance_toprock_basic')!;
    expect(freeze && standing).toBeTruthy();
    const animator = new CharacterAnimator(scene, [freeze, standing]);
    const f = FLOOR_PHASE.dance_freeze_baby;
    const poseAtSec = (f.rise - HOLD_POSE_LEAD_BEATS) * SEC_PER_BEAT;

    // the standing pose (frame 0 of the loop) for reference
    animator.play('dance_freeze_baby', { loop: true, fadeSec: 0 });
    scene.render();
    const stand = pose();

    // THE ROOM'S HOLD: run to the pose, stop there (HOLD_POSE_SPEED), hold 1.5 s
    frames(poseAtSec);
    const atPose = pose();
    expect(moved(atPose, stand), 'the freeze pose is far from standing').toBeGreaterThan(30);
    animator.setSpeed('dance_freeze_baby', HOLD_POSE_SPEED);
    frames(1.5);
    const held = pose();
    expect(moved(held, atPose), 'held: the body has not moved').toBeLessThan(0.5);
    // released: it runs on into its rise and is standing again by the clip's end (½ beat of rise + the lead)
    animator.setSpeed('dance_freeze_baby', 1);
    frames((2 - (f.rise - HOLD_POSE_LEAD_BEATS)) * SEC_PER_BEAT - FRAME_MS / 1000);
    expect(moved(pose(), stand), 'released: back up to standing at the clip\'s end').toBeLessThan(12);

    // THE OLD LOOP, the same 1.5 s left alone: it did not stay down
    animator.play('dance_toprock_basic', { loop: true, fadeSec: 0 }); scene.render();
    animator.play('dance_freeze_baby', { loop: true, fadeSec: 0, restart: true }); scene.render();
    frames(poseAtSec);
    const again = pose();
    frames(1.5);
    const unheld = moved(pose(), again);
    expect(unheld, 'unheld, the loop moved on (up and round again)').toBeGreaterThan(10);
    console.info(`[P9 FIX hold pose] pose vs standing ${moved(atPose, stand).toFixed(1)}°, held 1.5 s moved ${moved(held, atPose).toFixed(2)}°, unheld 1.5 s moved ${unheld.toFixed(1)}°`);
    freeze.dispose(); standing.dispose();
  });
});
