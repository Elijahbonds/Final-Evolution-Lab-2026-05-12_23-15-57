// bodyMerge (lane/hoops-perf): a body's parts drawn by a few meshes, and every part back the frame anything changes.
import { describe, expect, it } from 'vitest';
import {
  Bone, Color3, FreeCamera, HemisphericLight, Matrix, MeshBuilder, MorphTarget, MorphTargetManager, NullEngine, RenderingGroup, Scene,
  Skeleton, StandardMaterial, SubMesh, TransformNode, Vector3, VertexBuffer,
} from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { BODY_MERGE_ON, BODY_MERGE_SETTLE_FRAMES, MERGED_PREFIX, bodyAwarePainterCompare, groupKeyOf, meshesAfterMerge, mountBodyMerge, type PartFacts } from './bodyMerge';

function rig() {
  const engine = new NullEngine();
  // the null engine reports 16 vertex uniform vectors: too few for any skinned mesh to be "ready" (a GPU reports hundreds)
  (engine.getCaps() as { maxVertexUniformVectors: number }).maxVertexUniformVectors = 1024;
  const scene = new Scene(engine);
  const cam = new FreeCamera('cam', new Vector3(0, 1, -6), scene); cam.setTarget(new Vector3(0, 1, 0));
  new HemisphericLight('h', new Vector3(0, 1, 0), scene);
  const root = new TransformNode('__root___c1', scene);
  const skeleton = new Skeleton('sk', 'sk', scene);
  const hips = new Bone('Hips', skeleton, null, Matrix.Identity());
  new Bone('Spine', skeleton, hips, Matrix.Translation(0, 0.5, 0));
  const part = (name: string, y: number, color: Color3): Mesh => {
    const m = MeshBuilder.CreateBox(name, { size: 0.4 }, scene);
    m.bakeTransformIntoVertices(Matrix.Translation(0, y, 0));
    const n = m.getTotalVertices();
    m.setVerticesData(VertexBuffer.MatricesIndicesKind, new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? (y > 0.6 ? 1 : 0) : 0)), false, 4);
    m.setVerticesData(VertexBuffer.MatricesWeightsKind, new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), false, 4);
    m.skeleton = skeleton; m.parent = root;
    const mat = new StandardMaterial(`${name}_mat`, scene); mat.diffuseColor = color; m.material = mat;
    return m;
  };
  const body = part('Body', 0.4, new Color3(0.8, 0.6, 0.5));
  const top = part('Kit_tops_top_tee', 0.9, new Color3(0.1, 0.2, 0.9));
  const shorts = part('Kit_shorts_shorts_baggy', 0.2, new Color3(0.1, 0.1, 0.1));
  const eyes = part('eyes', 1.4, new Color3(1, 1, 1));
  eyes.receiveShadows = true;   // a per-mesh difference: the eyes cannot share the others' mesh
  // Babylon 9 announces a new mesh on the next macrotask (EmissiveGlow notes it): yield one between frames, as a browser does
  const frames = async (n: number) => { for (let i = 0; i < n; i++) { scene.render(); await new Promise((r) => setTimeout(r, 0)); } };
  return { engine, scene, root, skeleton, body, top, shorts, eyes, frames };
}
/** The merged meshes drawing now (a group a change took apart is kept built but hidden, layerMask 0, for a reuse). */
const merged = (scene: Scene) => scene.meshes.filter((m) => m.name.startsWith(MERGED_PREFIX) && !m.isDisposed() && m.layerMask !== 0) as Mesh[];

describe('bodyMerge: the grouping (pure)', () => {
  const f: PartFacts = { skeleton: 1, kinds: 'position:3', morph: '', casters: '1', lights: '1', layers: '', receiveShadows: false, renderingGroupId: 0,
    alphaIndex: 0, layerMask: 0x0fffffff, sideOrientation: 0, overrideSide: -1, hasVertexAlpha: false, useVertexColors: true, numBoneInfluencers: 4,
    bonesOnGpu: true, culling: 0, alwaysActive: false, applyFog: true, infiniteDistance: false, billboard: 0, visibility: 1, idx32: false };
  it('parts the renderer treats alike share a key; any per-mesh difference splits them', () => {
    expect(groupKeyOf(f)).toBe(groupKeyOf({ ...f }));
    for (const [k, v] of Object.entries({ casters: '0', lights: '1,2', kinds: 'position:3,uv:2', morph: 'felShape/', receiveShadows: true, skeleton: 2, visibility: 0.5 })) {
      expect(groupKeyOf({ ...f, [k]: v } as PartFacts)).not.toBe(groupKeyOf(f));
    }
  });
  it('a body becomes one mesh per key; off, one per part (as before)', () => {
    expect(meshesAfterMerge(['a', 'a', 'b', 'a', 'c'])).toBe(3);
    expect(meshesAfterMerge(['a', 'a', 'b', 'a', 'c'], 0)).toBe(5);
    expect(BODY_MERGE_ON).toBe(1);
  });
  it('the sort reads a merged sub-mesh as its part, and every other sub-mesh exactly as PainterSortCompare', async () => {
    const { scene, body, top, eyes } = rig();
    const subs = [top, body, eyes].map((m) => m.subMeshes[0]);
    for (const a of subs) for (const b of subs) expect(Math.sign(bodyAwarePainterCompare(a, b))).toBe(Math.sign(RenderingGroup.PainterSortCompare(a, b)));
    const fake = new SubMesh(0, 0, 4, 0, 6, eyes, eyes, false, false) as SubMesh & { _felPart?: unknown };
    fake._felPart = body;
    expect(Math.sign(bodyAwarePainterCompare(fake, top.subMeshes[0]))).toBe(Math.sign(RenderingGroup.PainterSortCompare(body.subMeshes[0], top.subMeshes[0])));
    // a tie on one material (the sole shares its shoe's): two unmerged meshes keep their order (0); a merged part goes by its own id
    eyes.material = top.material;
    expect(bodyAwarePainterCompare(top.subMeshes[0], eyes.subMeshes[0])).toBe(0);
    const tie = new SubMesh(0, 0, 4, 0, 6, eyes, eyes, false, false) as SubMesh & { _felPart?: unknown };
    tie._felPart = eyes;   // eyes was made after top
    expect(Math.sign(bodyAwarePainterCompare(tie, top.subMeshes[0]))).toBe(1);
    expect(Math.sign(bodyAwarePainterCompare(top.subMeshes[0], tie))).toBe(-1);
    scene.dispose();
  });
});

describe('bodyMerge: a body in a scene', () => {
  it('merges the parts that can share a mesh once the body holds still, and draws them instead of the parts', async () => {
    const { scene, root, skeleton, body, top, shorts, eyes, frames } = rig();
    mountBodyMerge(scene, root, skeleton, 1);
    await frames(3);
    const before = scene.getActiveMeshes().length;
    expect(merged(scene)).toHaveLength(0);   // not before it has settled
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    const [m] = merged(scene);
    expect(merged(scene)).toHaveLength(1);
    expect(m.getTotalVertices()).toBe(body.getTotalVertices() + top.getTotalVertices() + shorts.getTotalVertices());
    expect(m.subMeshes).toHaveLength(3);
    expect(m.subMeshes.map((s) => s.getMaterial())).toEqual([body.material, top.material, shorts.material]);
    expect(m.skeleton).toBe(skeleton);
    expect(m.layerMask).not.toBe(0);                    // swapped in
    for (const p of [body, top, shorts]) expect(p.layerMask).toBe(0);   // the parts it draws for are out of the camera pass
    expect(eyes.layerMask).not.toBe(0);                 // the eyes (receive shadows) keep their own mesh
    expect(scene.getActiveMeshes().length).toBe(before - 2);
    // the parts are untouched: same geometry, same material, still visible and enabled
    for (const p of [body, top, shorts]) { expect(p.isVisible).toBe(true); expect(p.isEnabled()).toBe(true); expect(p.isDisposed()).toBe(false); }
    scene.dispose();
  });

  it('a change to a part puts every part back THAT frame, and the body merges again once it holds still', async () => {
    const { scene, root, skeleton, body, top, shorts, frames } = rig();
    mountBodyMerge(scene, root, skeleton, 1);
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    expect(merged(scene)).toHaveLength(1);
    // a kit swap: the top's material changes
    const swapMat = new StandardMaterial('jersey_new', scene); swapMat.diffuseColor = new Color3(1, 0, 0);
    top.material = swapMat;
    await frames(1);
    expect(merged(scene)).toHaveLength(0);
    for (const p of [body, top, shorts]) expect(p.layerMask).toBe(0x0fffffff);
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    const [m] = merged(scene);
    expect(m.subMeshes.map((s) => s.getMaterial())).toContain(swapMat);
    // a part hidden (a garment taken off): back to the parts, then the rest merge without it
    shorts.isVisible = false;
    await frames(1);
    expect(merged(scene)).toHaveLength(0);
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    expect(merged(scene)[0].subMeshes).toHaveLength(2);
    expect(shorts.layerMask).toBe(0x0fffffff);
    scene.dispose();
  });

  it('a part hidden and shown again: the body takes its merged mesh back up instead of building another', async () => {
    const { scene, root, skeleton, shorts, frames } = rig();
    mountBodyMerge(scene, root, skeleton, 1);
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    const [m] = merged(scene);
    const stats = () => (scene as unknown as { __felBodyMerge: { stats(): { builds: number; reused: number } } }).__felBodyMerge.stats();
    const built = stats().builds;
    shorts.isVisible = false; await frames(1);
    expect(merged(scene)).toHaveLength(0);
    shorts.isVisible = true; await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    expect(merged(scene)[0]).toBe(m);
    expect(stats().builds).toBe(built);
    expect(stats().reused).toBe(1);
    scene.dispose();
  });

  it('a mesh cloned from a hidden part (the sole cut from a shoe) gets the default layer mask back', async () => {
    const { scene, root, skeleton, top, frames } = rig();
    mountBodyMerge(scene, root, skeleton, 1);
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    expect(top.layerMask).toBe(0);
    const sole = top.clone('KitSole_x', top.parent);
    expect(sole.layerMask).toBe(0);   // Mesh.clone copies it
    scene.render();                   // the very next frame, before Babylon has even announced the new mesh
    expect(sole.layerMask).toBe(0x0fffffff);
    scene.dispose();
  });

  it('morph targets of the same names merge, and the influences follow the parts', async () => {
    const { scene, root, skeleton, body, top, shorts, frames } = rig();
    for (const p of [body, top, shorts]) {
      const mgr = new MorphTargetManager(scene);
      const t = new MorphTarget('felShape', 0.5, scene);
      const pos = p.getVerticesData(VertexBuffer.PositionKind)!.slice(); for (let i = 0; i < pos.length; i += 3) pos[i] *= 1.1;
      t.setPositions(pos); mgr.addTarget(t); p.morphTargetManager = mgr;
    }
    mountBodyMerge(scene, root, skeleton, 1);
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    const [m] = merged(scene);
    expect(m.morphTargetManager?.numTargets).toBe(1);
    expect(m.morphTargetManager!.getTarget(0).getPositions()!.length).toBe(m.getTotalVertices() * 3);
    expect(m.morphTargetManager!.getTarget(0).influence).toBe(0.5);
    // the creator moves the shape on every part alike: the merged mesh follows without a rebuild
    for (const p of [body, top, shorts]) p.morphTargetManager!.getTarget(0).influence = 1;
    await frames(1);
    expect(merged(scene)[0]).toBe(m);
    // one part alone moves: it can no longer share the mesh's influence, so the parts come back
    body.morphTargetManager!.getTarget(0).influence = 0.2;
    await frames(1);
    expect(merged(scene)).toHaveLength(0);
    scene.dispose();
  });

  it('off (perf.bodyMergeOn 0): nothing is merged and nothing is installed, as before', async () => {
    const { scene, root, skeleton, body, frames } = rig();
    mountBodyMerge(scene, root, skeleton, 0);
    await frames(BODY_MERGE_SETTLE_FRAMES * 3);
    expect(merged(scene)).toHaveLength(0);
    expect(body.layerMask).toBe(0x0fffffff);
    expect((scene as unknown as { __felBodyMerge?: unknown }).__felBodyMerge).toBeUndefined();
    scene.dispose();
  });

  it('disposing the handle puts every part back', async () => {
    const { scene, root, skeleton, body, top, frames } = rig();
    const h = mountBodyMerge(scene, root, skeleton, 1);
    await frames(BODY_MERGE_SETTLE_FRAMES + 12);
    expect(body.layerMask).toBe(0);
    h.dispose();
    expect(merged(scene)).toHaveLength(0);
    for (const p of [body, top]) expect(p.layerMask).toBe(0x0fffffff);
    scene.dispose();
  });
});
