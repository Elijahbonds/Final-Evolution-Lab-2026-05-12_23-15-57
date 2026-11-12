// KIT-NO-HIGH-BOOTS (owner, 2026-10-24: "fix the sole band"): the low-cut kit shoe (0.15 m) gets its light sole band.
//
// The shoe fix splits the bottom SOLE_THICKNESS of the shown shoe into a light KitSole_* mesh, but only once the shoe is
// POSED, which it read as "taller than MIN_POSED_SHOE_HEIGHT". At 0.19 (the knee-boot era) every low shoe read as unposed
// for good: 'late:unposed', no sole, on all 28 kit/hero/rival bodies. These load the SHIPPED files, so they fail on the
// old threshold, and they keep the two ways a shoe really is unposed (no bone matrices yet; a shrunk spawn) deferred.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit } from './kit';
import { MIN_POSED_SHOE_HEIGHT } from './garmentFixes';
import { skinnedWorld } from './bodyMask';

const FILES = { male: 'public/models/candidates/fel-kit-male.glb', female: 'public/models/candidates/fel-kit-female.glb', rival: 'public/models/rivals/ace.glb' } as const;
type Body = keyof typeof FILES;
const SOLE_THICKNESS = 0.05;   // garmentFixes' (not exported): the sole is the bottom 5 cm of the shoe

let scene: Scene;
const containers = {} as Record<Body, AssetContainer>;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop' };
  for (const k of Object.keys(FILES) as Body[]) {
    containers[k] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(FILES[k]).toString('base64')}`, scene, undefined, '.glb');
  }
}, 120_000);

let n = 0;
function spawn(body: Body): { root: TransformNode; meshes: AbstractMesh[] } {
  const inst = containers[body].instantiateModelsToScene((x) => `${x}_c${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { root, meshes: root.getChildMeshes() };
}
const shoeOf = (meshes: AbstractMesh[]) => meshes.find((m) => /^Kit_shoes_shoes_evo_primitive0/.test(m.name) && m.isVisible) as Mesh;
const soleOf = (shoe: Mesh) => scene.meshes.find((m) => m.metadata?.felSoleOf === shoe.name) as Mesh | undefined;
const note = (shoe: Mesh) => String(shoe.metadata?.felGarmentFix ?? '');
function renderUntilSettled(shoe: Mesh, max = 200): void {
  for (let i = 0; i < max && /deferred/.test(note(shoe)) && !/late:/.test(note(shoe)); i++) scene.render();
}
/** World height span of a skinned mesh's drawn triangles (min y of the whole shoe is the floor of the sole). */
function ySpan(mesh: Mesh): { min: number; max: number } {
  const w = skinnedWorld(mesh)!.P; const ind = mesh.getIndices()!;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < ind.length; i++) { const y = w[ind[i] * 3 + 1]; if (y < min) min = y; if (y > max) max = y; }
  return { min, max };
}

describe('the low-cut kit shoe gets its light sole band (MIN_POSED_SHOE_HEIGHT)', () => {
  it.each(Object.keys(FILES) as Body[])('%s: the shipped low shoe is posed, and its sole splits off', (body) => {
    const s = spawn(body);
    applyKit(s.meshes, null, 'onevone');
    const shoe = shoeOf(s.meshes);
    expect(shoe).toBeTruthy();
    renderUntilSettled(shoe);
    const fix = note(shoe);
    expect(fix).not.toMatch(/unposed/);
    expect(fix).toMatch(/sole/);
    // the height it measured: a LOW shoe, under the old 0.19 floor and over the new one (so this fails at 0.19)
    const tall = Number(/shoe ([\d.]+) tall/.exec(fix)?.[1]);
    expect(tall).toBeGreaterThan(MIN_POSED_SHOE_HEIGHT);
    expect(tall).toBeLessThan(0.19);
    expect(fix).not.toMatch(/folded/);   // a low shoe is not a boot
    const sole = soleOf(shoe)!;
    expect(sole).toBeTruthy();
    expect(sole.isVisible).toBe(true);
    expect(sole.getTotalIndices() / 3).toBeGreaterThanOrEqual(4);
    expect(sole.material?.name).toBe('kitSole.evo');   // the light matte, no `shoe` in its name (the tint skips it)
    // the band is the bottom of the shoe: the sole's triangles sit at the floor, the upper keeps the rest
    const all = ySpan(shoe), band = ySpan(sole);
    expect(band.max).toBeLessThanOrEqual(band.min + SOLE_THICKNESS + 1e-4);
    expect(all.min).toBeGreaterThan(band.min - 1e-4);
    s.root.dispose();
  });

  it('a shoe with no bone matrices yet (unposed) still waits, and gets its sole once it is posed', () => {
    const s = spawn('male');
    // the shoe's OWN skeleton: these files carry one skin per mesh
    const skeleton = (s.meshes.find((m) => /^Kit_shoes_shoes_evo_primitive0/.test(m.name)) as Mesh).skeleton!;
    const real = skeleton.getTransformMatrices.bind(skeleton);
    skeleton.getTransformMatrices = (m) => new Float32Array(real(m).length);   // every bone matrix zero: the shoe measures 0 m
    applyKit(s.meshes, null, 'onevone');
    const shoe = shoeOf(s.meshes);
    expect(note(shoe)).toMatch(/deferred/);
    expect(soleOf(shoe)).toBeUndefined();
    skeleton.getTransformMatrices = real;
    renderUntilSettled(shoe);
    expect(note(shoe)).toMatch(/late:.*sole/);
    expect(soleOf(shoe)?.isVisible).toBe(true);
    s.root.dispose();
  });

  it('a shrunk spawn (root scale 0.001, the materialise tween) waits for its real size', () => {
    const s = spawn('rival');
    s.root.scaling.setAll(0.001);
    applyKit(s.meshes, null, 'onevone');
    const shoe = shoeOf(s.meshes);
    for (let i = 0; i < 5; i++) scene.render();
    expect(note(shoe)).toMatch(/deferred/);
    expect(note(shoe)).not.toMatch(/late:/);
    expect(soleOf(shoe)).toBeUndefined();
    s.root.scaling.setAll(1);
    renderUntilSettled(shoe);
    expect(note(shoe)).toMatch(/late:.*sole/);
    s.root.dispose();
  });
});
