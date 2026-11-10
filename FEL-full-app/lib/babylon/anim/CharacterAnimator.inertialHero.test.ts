// SWITCH-ON (2026-11-10): the inertial blend (anim.inertial) on the REAL hero, headless at 60 fps, against the linear crossfade it
// would replace. The rig found AF-1 as shipped WORSE than linear on the fighters (docs/SWITCH-ON.md §6); frame by frame, the knee
// jumped 32–62° on the switch frame of guard → guard step / run: the 'guard' capture keys 7 bones and not the legs, so the legs had
// no history and got no offset. Fixed behind anim.inertialAllBones (with the legs a clip stops keying eased onto their rest, where a
// linear fade-out leaves them, instead of freezing mid-stride). This holds the fixed blend to linear on the same switches.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';

afterEach(() => knob.v.clear());
const B = ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
let scene: Scene, sk: Skeleton, groups: AnimationGroup[];
beforeAll(async () => {
  const engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; groups = r.animationGroups;
  sanitizeImportedGroups(r.animationGroups);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  scene.useConstantAnimationDeltaTime = true;
}, 120_000);
const pose = () => B.map((b) => (boneNode(sk, b)?.rotationQuaternion ?? Quaternion.Identity()).clone());
const AF1 = () => { knob.v.set('anim.inertialAllBones', 0); knob.v.set('anim.inertialMatchVel', 0); knob.v.set('anim.inertialMinHalfLifeSec', 0); };
let first: CharacterAnimator | null = null;
/** One body's animator (the first one built in this file captured the bind pose; later ones reuse its rest by the same nodes). */
function body(mode: 'linear' | 'inertial'): CharacterAnimator {
  // every body starts from the bind pose, as a spawned one does (the nodes' pose before the first body of the file moved them)
  for (const [n, q] of (first as unknown as { inertialRest?: Map<{ rotationQuaternion: Quaternion }, number[]> } | null)?.inertialRest ?? []) n.rotationQuaternion?.set(q[0], q[1], q[2], q[3]);
  const an = new CharacterAnimator(scene, groups); registerAuthoredClips(an, scene, sk); an.setBlendMode(mode);
  first ??= an;
  return an;
}
/** The largest one-frame turn of the legs and arms over the 25 frames after a → b, at 5 stride phases. */
function worst(mode: 'linear' | 'inertial', a: string, b: string, fade: number): number {
  let w = 0;
  for (let ph = 0; ph < 30; ph += 6) {
    const an = body(mode);
    an.play(a, { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 20 + ph; i++) scene.render();
    let prev = pose(); an.play(b, { loop: true, fadeSec: fade });
    for (let i = 0; i < 25; i++) { scene.render(); const now = pose(); now.forEach((q, k) => { w = Math.max(w, ang(q, prev[k])); }); prev = now; }
    an.setBlendMode('linear');
  }
  return w;
}

describe('the inertial blend on the hero', () => {
  it('a clip that stops keying the legs: they ease onto where a linear fade-out leaves them (within 6°), not frozen mid-stride', () => {
    const end = (mode: 'linear' | 'inertial') => {
      const an = body(mode);
      an.play('karate_idle_stance', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 10; i++) scene.render();
      an.play('run_forward', { loop: true, fadeSec: 0.15 }); for (let i = 0; i < 37; i++) scene.render();
      an.play('karate_idle_stance', { loop: true, fadeSec: 0.15 }); for (let i = 0; i < 40; i++) scene.render();
      an.setBlendMode('linear');
      return pose();
    };
    const ine = end('inertial'), lin = end('linear');
    for (let k = 0; k < B.length; k++) expect(ang(ine[k], lin[k]), B[k]).toBeLessThan(6);
    AF1();
    const af1 = end('inertial');
    expect(Math.max(...B.map((_, k) => ang(af1[k], lin[k])))).toBeGreaterThan(25);   // AF-1: the knee stayed bent (54.8° off, measured)
  }, 170_000);

  it('guard → guard step / shuffle / run / jab: the fixed blend stays within 3° of linear and far under a pop (25° a frame)', () => {
    const cases: [string, string, number][] = [['karate_idle_stance', 'karate_guard_step', 0.16], ['karate_idle_stance', 'karate_shuffle_right', 0.14], ['karate_idle_stance', 'run_forward', 0.18], ['karate_idle_stance', 'karate_punch_light', 0.06]];
    knob.v.set('anim.inertialMinHalfLifeSec', 0.045);
    for (const [a, b, f] of cases) {
      const ine = worst('inertial', a, b, f), lin = worst('linear', a, b, f);
      expect(ine, `${a} → ${b}`).toBeLessThanOrEqual(lin + 3);   // measured 2.8 vs 2.2, 2.4 vs 2.4, 5.0 vs 6.7, 3.5 vs 5.2
      expect(ine, `${a} → ${b}`).toBeLessThan(12);
    }
    // (the knee's jump itself depends on the pose the legs were left in; its deterministic control is inertialMatch.test's
    // anim.inertialAllBones case: 90° on the switch frame with the knob at 0, none with it at 1)
  }, 170_000);
});
