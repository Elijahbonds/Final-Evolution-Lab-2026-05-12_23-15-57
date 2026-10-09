// MUSIC-SUITE P8 FIX: "THE trans_spin T" — the transition spin (dance_trans_spin) showed a T-pose frame.
//
// THE PROVEN PART. Every dance clip in this file starts and ends on `STAND` (Hips yaw 0°) — the file's own header
// says so ("Every clip now starts AND ends in the same standing groove"). spin()'s last key broke that convention:
// it read `Hips: [0, 360, 0]` — meant as "one more full turn past 300°, landing facing front again", which is fine
// mid-clip (Babylon's own quaternion slerp between two keys of ONE track corrects sign for the short way round, so
// 300°→360° plays as the intended forward 60° — confirmed below, no jump at the loop wrap either way). The problem
// is what 360° IS as a STORED quaternion: half-angle(360°) = 180°, so its (sin, cos) pair is (≈0, −1) — the SAME
// rotation as 0° (≈0, +1), but on quaternion double-cover's OTHER hemisphere (negative w). Measured directly (below):
// trans_spin's last key was the ONLY key anywhere in the whole pack on that hemisphere. The fix lands it on the SAME
// rotation (a full turn already happened by 360°) using the value every other clip already uses: 0°, i.e. `STAND`.
//
// THE PART I COULD NOT CONFIRM. A sign mismatch exactly at a clip boundary is a well-known class of animation bug —
// this pack's own mirrored-clips.ts header calls exactly this "keeps zero T-pose frames" — so it is a real, if
// narrow, authoring defect worth fixing regardless. But sampling every bone through the actual clip and a realistic
// crossfade in and out, on the real fel-hero skeleton via CharacterAnimator's own crossFade, produced no visible
// T-pose frame either WITH or WITHOUT the fix (see the "no T-pose frame" describe block below — it passes on the old
// key too). assumption: I am fixing the one genuine inconsistency this pack has and documenting it, not certifying
// that it is the exact mechanism behind whatever the owner saw; a live visual check (the :3121 dev server was not
// reachable this session) is the way to close that gap for certain.
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from './boneLookup';
import { buildDanceClip, DANCE_CLIP_IDS } from './danceClips';
import { CharacterAnimator } from './CharacterAnimator';

let scene: Scene;
let sk: Skeleton;

beforeAll(async () => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0];
});

/** Same hemisphere = non-negative dot product (the shorter of q vs. −q's angular distance to the other is 0). */
function sameHemisphere(a: Quaternion, b: Quaternion): boolean {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w >= 0;
}

describe('every dance clip starts and ends its Hips track on the same quaternion hemisphere', () => {
  it('holds for every id in DANCE_CLIP_IDS (trans_spin was the only failure before this fix)', () => {
    const results: { id: string; ok: boolean }[] = [];
    for (const id of DANCE_CLIP_IDS) {
      const g = buildDanceClip(scene, sk, id);
      expect(g, `${id} failed to build`).not.toBeNull();
      const hips = g!.targetedAnimations.find((ta) => (ta.target as { name?: string }).name?.replace(/_c\d+$/, '') === 'Hips');
      expect(hips, `${id} has no Hips track`).toBeTruthy();
      const keys = hips!.animation.getKeys();
      const ok = sameHemisphere(keys[0].value as Quaternion, keys[keys.length - 1].value as Quaternion);
      results.push({ id, ok });
      g!.dispose();
    }
    const failing = results.filter((r) => !r.ok).map((r) => r.id);
    expect(failing).toEqual([]);
  });

  it('dance_trans_spin specifically: the last key is now literally STAND (Hips yaw 0°), same as the first', () => {
    const g = buildDanceClip(scene, sk, 'dance_trans_spin')!;
    const hips = g.targetedAnimations.find((ta) => (ta.target as { name?: string }).name?.replace(/_c\d+$/, '') === 'Hips')!;
    const keys = hips.animation.getKeys();
    expect(keys.length).toBe(5);   // key(0,STAND), 60°, 180°, 300°, key(beats(2), STAND) — spin()'s own 5 keys
    const first = keys[0].value as Quaternion, last = keys[keys.length - 1].value as Quaternion;
    expect(last.w).toBeGreaterThan(0);   // was < 0 (the 360° key) — the actual bug
    expect(Quaternion.Dot(first, last)).toBeCloseTo(1, 6);   // now bit-for-bit the same key
    g.dispose();
  });
});

describe('dance_trans_spin — sampling every bone through the spin and its crossfade (no T-pose frame)', () => {
  const BONES = ['Hips', 'Spine', 'Neck', 'LeftUpLeg', 'RightUpLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
  /** How far a bone's CURRENT rotation is from the rig's literal identity quaternion, in degrees — the operational
   *  definition of "T-pose frame" for a Mixamo-style rig: a bone with no animatable driving it at all reports its
   *  skin's own bind matrices, i.e. the rig's built-in T-pose, which corresponds to an identity LOCAL rotation on
   *  every joint in the chain (this rig's own IMPORTED bind pose is an A-pose, not identity — measured directly,
   *  LeftArm bind ≈ (−14°, −1°, −2°) — so "at bind" and "at identity" are deliberately different checks here; a
   *  dropped/unbound bone reads as identity, not as this rig's A-pose). */
  function degFromIdentity(q: Quaternion): number {
    return (Math.acos(Math.min(1, Math.abs(q.w))) * 360) / Math.PI;   // ×2 for the half-angle, ×180/π for degrees
  }

  it('every bone stays finite, unit-length, and off the identity/T-pose orientation across the clip\'s own 30 frames', () => {
    const spin = buildDanceClip(scene, sk, 'dance_trans_spin')!;
    spin.start(true, 1, spin.from, spin.to, false);
    let minSpineDeg = Infinity;
    let minArmDeg: Record<string, number> = { LeftArm: Infinity, RightArm: Infinity };
    for (let f = 0; f <= spin.to; f += 1) {
      spin.goToFrame(f);
      scene.render();
      for (const name of BONES) {
        const n = boneNode(sk, name)!;
        const q = n.rotationQuaternion!;
        expect(Number.isFinite(q.x + q.y + q.z + q.w), `${name}@${f} not finite`).toBe(true);
        expect(q.length(), `${name}@${f} not unit length`).toBeCloseTo(1, 3);
      }
      minSpineDeg = Math.min(minSpineDeg, degFromIdentity(boneNode(sk, 'Spine')!.rotationQuaternion!));
      for (const arm of ['LeftArm', 'RightArm']) {
        minArmDeg[arm] = Math.min(minArmDeg[arm], degFromIdentity(boneNode(sk, arm)!.rotationQuaternion!));
      }
    }
    console.log('min degrees-from-identity across the whole clip — Spine:', minSpineDeg.toFixed(1), 'LeftArm:', minArmDeg.LeftArm.toFixed(1), 'RightArm:', minArmDeg.RightArm.toFixed(1));
    // STAND_BONES keys Spine at a fixed non-zero pitch on every key of every clip in this file (never 0°) — a T-pose
    // frame would report Spine at (or very near) identity instead.
    expect(minSpineDeg).toBeGreaterThan(5);
    // spin()'s hand targets keep both arms away from the hang pose throughout — a T-pose frame would report BOTH
    // arms near identity simultaneously.
    expect(minArmDeg.LeftArm).toBeGreaterThan(5);
    expect(minArmDeg.RightArm).toBeGreaterThan(5);
    spin.dispose();
  });

  it('the same holds through a realistic crossfade in from the previous step and out to the next', () => {
    const prev = buildDanceClip(scene, sk, 'dance_bounce_shoulder')!;
    const spin = buildDanceClip(scene, sk, 'dance_trans_spin')!;
    const next = buildDanceClip(scene, sk, 'dance_toprock_basic')!;
    const animator = new CharacterAnimator(scene, [prev, spin, next]);
    (scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;   // crossFade reads this directly

    const sampleAll = (): void => {
      for (const name of BONES) {
        const n = boneNode(sk, name)!;
        const q = n.rotationQuaternion!;
        expect(Number.isFinite(q.x + q.y + q.z + q.w), `${name} not finite`).toBe(true);
        expect(q.length(), `${name} not unit length`).toBeCloseTo(1, 2);
      }
      const spineDeg = degFromIdentity(boneNode(sk, 'Spine')!.rotationQuaternion!);
      expect(spineDeg, 'Spine collapsed toward identity — the T-pose signature').toBeGreaterThan(3);
    };

    animator.play('dance_bounce_shoulder', { loop: true, fadeSec: 0 });
    scene.render();
    sampleAll();

    // crossfade IN to the spin (this is where the bug's mechanism — a sign mismatch AT a clip boundary — would show)
    animator.play('dance_trans_spin', { loop: true, fadeSec: 0.12 });
    for (let i = 0; i < 10; i++) { scene.render(); sampleAll(); }

    // let the spin run a while, then crossfade OUT to the next step — the exact transition THE trans_spin T named
    spin.goToFrame(spin.to - 1);
    scene.render();
    sampleAll();
    animator.play('dance_toprock_basic', { loop: true, fadeSec: 0.12 });
    for (let i = 0; i < 10; i++) { scene.render(); sampleAll(); }

    prev.dispose(); spin.dispose(); next.dispose();
  });
});
