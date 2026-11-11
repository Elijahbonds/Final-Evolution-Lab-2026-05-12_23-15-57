// GAMEPLAY-CLEAN-7 — anim.inertialHipsPos. AF-1 carries the Hips' position across an inertial switch, finding the Hips by name
// (/hips$/). Every body a mode spawns is a clone named `<bone>_c<n>` (CharacterLibrary; the rig's switch log read `Hips_c240`), so on
// no in-game body did the name match and the hip height switched at once. Knob 1: the clone's Hips is found; 0: as before.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const knob = vi.hoisted(() => ({ v: new Map<string, number>() }));
vi.mock('../../feel-panel/feel', () => ({ feel: (id: string, def: number) => knob.v.get(id) ?? def }));
import { CharacterAnimator } from './CharacterAnimator';
import { registerAuthoredClips } from './authored';
import { sanitizeImportedGroups } from './importSanitizer';
import { boneNode } from './boneLookup';
import { ANIM_INERTIAL_HIPS_POS_ON } from './inertialize';

afterEach(() => knob.v.clear());
let scene: Scene, sk: Skeleton, groups: AnimationGroup[], hips: TransformNode;
beforeAll(async () => {
  const engine = new NullEngine(); scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; groups = r.animationGroups; sanitizeImportedGroups(groups);
  hips = boneNode(sk, 'Hips') as TransformNode;
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
}, 120_000);

/** Down in the landing crouch, then up into the idle: the largest one-frame step of the Hips' local position (m) over the 12 frames
 *  after the switch. */
function hipStep(mode: 'linear' | 'inertial', name: string): number {
  const keep = hips.name; hips.name = name;
  const A = new CharacterAnimator(scene, groups); registerAuthoredClips(A, scene, sk); A.setBlendMode(mode);
  A.play('idle_stand', { loop: true, fadeSec: 0, restart: true }); for (let i = 0; i < 20; i++) scene.render();
  A.play('dunk_land_crouch', { fadeSec: 0.15 }); for (let i = 0; i < 14; i++) scene.render();
  let prev = hips.position.clone(), w = 0;
  A.play('idle_stand', { loop: true, fadeSec: 0.15 });
  for (let i = 0; i < 12; i++) { scene.render(); w = Math.max(w, Vector3.Distance(hips.position, prev)); prev = hips.position.clone(); }
  A.setBlendMode('linear'); A.dispose(); hips.name = keep;
  return w;
}

describe('anim.inertialHipsPos: the hips of a spawned (cloned) body', () => {
  it('defaults on; a clone\'s Hips (Hips_c240) eases its height like the source rig\'s Hips; 0 restores the one-frame step', () => {
    expect(ANIM_INERTIAL_HIPS_POS_ON).toBe(1);
    const named = hipStep('inertial', 'Hips');          // the name AF-1 matched: the reference
    const clone = hipStep('inertial', 'Hips_c240');
    knob.v.set('anim.inertialHipsPos', 0);
    const before = hipStep('inertial', 'Hips_c240');
    console.info(`hips step a frame: named ${named.toFixed(3)} m, clone on ${clone.toFixed(3)} m, clone knob 0 ${before.toFixed(3)} m, linear ${hipStep('linear', 'Hips_c240').toFixed(3)} m`);
    expect(before, `the clone, knob 0: ${before.toFixed(3)} m in one frame; the named Hips ${named.toFixed(3)} m`).toBeGreaterThan(2 * named);
    expect(Math.abs(clone - named), `clone ${clone.toFixed(3)} m, named ${named.toFixed(3)} m`).toBeLessThan(1e-3);
  }, 120_000);
});
