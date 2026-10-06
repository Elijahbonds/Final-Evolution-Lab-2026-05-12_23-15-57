// IMPROVE (2026-10-06): the merge must not move a single vertex — the station is parked by its bounds and the saucer's
// underside is a surface the R1 tap reads, so a bake in the wrong frame would float or sink the whole prop.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, StandardMaterial, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { mergeByMaterial } from './mergeByMaterial';

function prop(scene: Scene) {
  const root = new TransformNode('prop', scene);
  root.position.set(4, 2.5, -7); root.rotation.y = 0.7; root.scaling.setAll(1.3);   // built under a root that is already placed (the sky tier)
  const a = new StandardMaterial('a', scene), b = new StandardMaterial('b', scene), c = new StandardMaterial('c', scene);
  const add = (m: ReturnType<typeof MeshBuilder.CreateBox>, mat: StandardMaterial, x: number, y: number, z: number) => { m.parent = root; m.position.set(x, y, z); m.material = mat; m.isPickable = false; return m; };
  add(MeshBuilder.CreateBox('b1', { size: 1 }, scene), a, 0, 0, 0);
  add(MeshBuilder.CreateBox('b2', { width: 2, height: 0.2, depth: 0.5 }, scene), a, 1.5, 1, 0).rotation.z = 0.4;
  const s = add(MeshBuilder.CreateSphere('s1', { diameter: 1 }, scene), b, -1, 0.5, 2); s.scaling.set(2, 0.5, 1.5);
  add(MeshBuilder.CreateTorus('t1', { diameter: 1, thickness: 0.1 }, scene), b, 0, 2, -1).rotation.x = Math.PI / 2;
  add(MeshBuilder.CreateCylinder('c1', { diameter: 0.3, height: 1 }, scene), c, 0.5, -0.5, 0.5);   // alone on its material
  return root;
}

/** The world-space extent of every VERTEX under the root (a bounding box's own AABB would grow under the root's turn). */
function vertexExtent(root: TransformNode): { min: Vector3; max: Vector3; n: number } {
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity); let n = 0;
  for (const m of root.getChildMeshes(true)) {
    const wm = m.computeWorldMatrix(true), pos = m.getVerticesData(VertexBuffer.PositionKind) ?? [];
    for (let i = 0; i < pos.length; i += 3) { const w = Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm); min.minimizeInPlace(w); max.maximizeInPlace(w); n++; }
  }
  return { min, max, n };
}

describe('mergeByMaterial', () => {
  it('one mesh per shared material, the same world bounds to the millimetre, the root untouched', () => {
    const scene = new Scene(new NullEngine());
    const root = prop(scene);
    const before = vertexExtent(root);
    const rootAt = root.position.clone();
    expect(root.getChildMeshes(true).length).toBe(5);
    expect(mergeByMaterial(root)).toBe(2);
    const kids = root.getChildMeshes(true);
    expect(kids.length).toBe(3);                                       // a, b merged; c left alone
    expect(new Set(kids.map((k) => k.material?.name))).toEqual(new Set(['a', 'b', 'c']));
    const after = vertexExtent(root);
    expect(after.n).toBe(before.n);                                     // every vertex kept
    expect(Vector3.Distance(before.min, after.min)).toBeLessThan(1e-3);
    expect(Vector3.Distance(before.max, after.max)).toBeLessThan(1e-3);
    expect(root.position.equals(rootAt)).toBe(true);
    expect(kids.every((k) => !k.isPickable)).toBe(true);
  });

  it('the merged parts still ride the root (the sky tier sways after the merge)', () => {
    const scene = new Scene(new NullEngine());
    const root = prop(scene);
    mergeByMaterial(root);
    const before = root.getHierarchyBoundingVectors(true);
    root.position.y += 1;
    const after = root.getHierarchyBoundingVectors(true);
    expect(after.min.y - before.min.y).toBeCloseTo(1, 4);
  });
});
