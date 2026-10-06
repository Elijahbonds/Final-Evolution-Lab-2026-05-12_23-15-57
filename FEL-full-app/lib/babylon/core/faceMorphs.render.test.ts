// The data-driven face on the REAL kit body (fel-kit-male.glb in a NullEngine) — IMPROVE (2026-10-06), CREATOR-PLAN
// phase 4c. The slider list is read off the body's own morph targets, and a morph the forge did not bake today (phase 5's)
// is driven by name through the identity pipe the moment it is in the mesh — while the Creator's own bulk target is never
// touched by a face value.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { MorphTarget, NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import type { AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyFaceMorphs, morphNamesOf, resolveFaceWeightMap, FACE_MORPH_NAMES } from './faceMorphs';
import { applyIdentity, type PlayerIdentity } from './playerIdentity';
import type { SpawnedCharacter } from './CharacterLibrary';
import { defaultFace } from '../../closet/wearable-catalog';
import { faceMorphList } from '../../creator/look/faceMorphList';
import { sanitizeCreatorDoc } from '../../creator/look/sanitize';
import { SHAPE_TARGET, syncShape } from '../creator/shape/renderShape';

let scene: Scene; let kit: AssetContainer;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  kit = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
}, 60_000);

let n = 0;
function body(): SpawnedCharacter {
  const inst = kit.instantiateModelsToScene((x) => `${x}_f${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `f${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const ID = (o: Partial<PlayerIdentity> = {}): PlayerIdentity => ({
  proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null, wardrobe: {}, custom: true, body: 'kit-male', ...o,
});
const skin = (s: SpawnedCharacter) => s.meshes.find((m) => m.morphTargetManager && m.morphTargetManager.numTargets > 0) as Mesh;
const target = (m: Mesh, name: string) => { const g = m.morphTargetManager!; for (let i = 0; i < g.numTargets; i++) if (g.getTarget(i).name === name) return g.getTarget(i); return null; };

describe('the face sliders come from the body', () => {
  it('the kit body lists exactly the forge\'s seven, in order, with the Closet\'s labels', () => {
    const s = body();
    expect(morphNamesOf(s.meshes)).toEqual([...FACE_MORPH_NAMES]);
    expect(faceMorphList(morphNamesOf(s.meshes)).map((x) => x.label)).toEqual(['Length', 'Roundness', 'Jaw', 'Heart', 'Cheekbones', 'Jaw open', 'Brow']);
    s.root.dispose();
  });

  it('a morph baked later (phase 5) shows up as a slider and is driven by name through applyIdentity', () => {
    const s = body();
    const m = skin(s);
    const nose = new MorphTarget('noseWidth', 0, scene);
    nose.setPositions(m.getVerticesData('position')!);
    m.morphTargetManager!.addTarget(nose);
    expect(morphNamesOf(s.meshes)).toEqual([...FACE_MORPH_NAMES, 'noseWidth']);
    applyIdentity(s, ID({ face: { ...defaultFace(), faceShape: 'Round', sliders: { noseWidth: 0.6, jawOpen: 0.25 } } }));
    expect(nose.influence).toBeCloseTo(0.6);
    expect(target(m, 'jawOpen')!.influence).toBeCloseTo(0.25);
    expect(target(m, 'faceRound')!.influence).toBeCloseTo(0.85);
    // the doc's value wins, per morph, for the new one too
    applyIdentity(s, ID({ face: { ...defaultFace(), sliders: { noseWidth: 0.6 } }, creator: sanitizeCreatorDoc({ v: 1, shape: { face: { noseWidth: 0.1 }, body: {} } }) }));
    expect(nose.influence).toBeCloseTo(0.1);
    // nothing sets it: back to 0
    applyIdentity(s, ID());
    expect(nose.influence).toBe(0);
    s.root.dispose();
  });

  it('the Creator\'s own bulk target (felShape) is never touched by a face value', () => {
    const s = body();
    syncShape(s, sanitizeCreatorDoc({ v: 1, shape: { face: {}, body: {}, girth: { chest: 1.4 } } }));
    const m = skin(s);
    const bulk = target(m, SHAPE_TARGET)!;
    expect(bulk.influence).toBe(1);
    applyFaceMorphs(s.meshes, { ...resolveFaceWeightMap({}), felShape: 0 });
    expect(bulk.influence).toBe(1);
    s.root.dispose();
  });
});
