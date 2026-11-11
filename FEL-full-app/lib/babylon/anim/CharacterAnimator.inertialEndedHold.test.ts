// GAMEPLAY-CLEAN-7 — anim.inertialEndedHold. With the inertial blend's anim.inertialAllBones on, a bone the new clip does not key was
// eased onto its BIND pose at every switch. After a hit react or a knockdown that ran to its end (neverBindPose plays `idle_stand`,
// which keys 7 bones, from the end callback) that swung the hero's thighs 170–178° back to the bind pose at up to 25° a frame for ~10
// frames, where the linear crossfade leaves them still (Babylon has stopped the ended clip). Knob 1: they hold, as linear does. Knob 0:
// the clean-6 ease, exactly. Measured with scripts/probes/gameplay-clean/legHold.ts (GAMEPLAY-CLEAN-AUDIT §4i).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { installOpponentMotion } from './opponentMotion';
import { neverBindPose, sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';
import { ANIM_INERTIAL_ENDED_HOLD_ON } from './inertialize';

afterEach(() => knob.v.clear());
const THIGHS = ['LeftUpLeg', 'RightUpLeg'];
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

const pose = () => THIGHS.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
const cur = () => (A as unknown as { currentName: string }).currentName;
/** The guard step, then `clip` run to its end into the idle: the thighs' largest one-frame turn over the 40 frames from the settle. */
function thighs(clip: string, fade: number, frames: number, mode: 'linear' | 'inertial'): number {
  A.setBlendMode('linear'); A.setBlendMode(mode); A.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 20; i++) scene.render();
  A.play('karate_guard_step', { loop: true, fadeSec: 0.16 }); for (let i = 0; i < 30; i++) scene.render();
  A.play(clip, { fadeSec: fade });
  let prev = pose(), prevClip = cur(), at = -1, w = 0;
  for (let f = 0; f < frames; f++) {
    scene.render(); const now = pose(), c = cur();
    if (at < 0 && c === 'idle_stand' && prevClip !== 'idle_stand') at = f;
    if (at >= 0 && f - at < 40) now.forEach((q, k) => { w = Math.max(w, ang(q, prev[k])); });
    prev = now; prevClip = c;
  }
  A.setBlendMode('linear');
  expect(at, `${clip} settled into the idle`).toBeGreaterThanOrEqual(0);
  return w;
}

describe('anim.inertialEndedHold: the legs after a move that ran to its end', () => {
  it('defaults on', () => expect(ANIM_INERTIAL_ENDED_HOLD_ON).toBe(1));
  for (const [clip, fade, frames] of [['karate_hit_react', 0.05, 90], ['karate_knockdown', 0.08, 150]] as const) {
    it(`${clip} → idle: on, the thighs hold as with linear (under 6° a frame; 25° before); 0 restores the ease to the bind pose`, () => {
      const lin = thighs(clip, fade, frames, 'linear');
      const on = thighs(clip, fade, frames, 'inertial');
      knob.v.set('anim.inertialEndedHold', 0);
      const off = thighs(clip, fade, frames, 'inertial');
      expect(on, `on ${on.toFixed(1)}°, linear ${lin.toFixed(1)}°`).toBeLessThan(6);
      expect(Math.abs(on - lin), `on ${on.toFixed(1)}°, linear ${lin.toFixed(1)}°`).toBeLessThan(1);
      expect(off, `off ${off.toFixed(1)}° (the clean-6 ease: 24.5–25.1° measured)`).toBeGreaterThan(18);
    }, 90_000);
  }
});
