// IMPROVE (2026-10-06, 3PT #11): the rack balls' leather as instances of one hidden template per look.
import { describe, expect, it } from 'vitest';
import { InstancedMesh, MeshBuilder, NullEngine, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Material, Mesh } from '@babylonjs/core';
import { instanceSkinOnto } from './meshyProps';

function rig() {
  const scene = new Scene(new NullEngine());
  // a glTF-shaped template: a __root__ that flips z (the right-to-left handedness), a mesh under it off-centre
  const template = new TransformNode('tpl', scene);
  const gltfRoot = new TransformNode('__root__', scene); gltfRoot.parent = template; gltfRoot.scaling.set(1, 1, -1);
  const leather = new StandardMaterial('leather', scene);
  const part = MeshBuilder.CreateSphere('ball_part', { diameter: 0.24 }, scene); part.parent = gltfRoot; part.material = leather;
  part.position.set(0.01, 0.02, 0.03);
  const gold = new StandardMaterial('gold', scene);
  const balls: Mesh[] = [];
  for (let i = 0; i < 10; i++) { const b = MeshBuilder.CreateSphere(`rb${i}`, { diameter: 0.2 }, scene); b.position.set(i * 0.21, 0.8, 3); balls.push(b); }
  return { scene, template, part, leather, gold, balls };
}

describe('instanceSkinOnto', () => {
  it('every ball wears instances (not clones) of one source per look, and the sphere goes invisible', () => {
    const { scene, part, template, leather, gold, balls } = rig();
    const skin = instanceSkinOnto(template, balls, (i, base) => (i % 5 === 4 ? gold : base), () => 0.2 / 0.24);
    const inst = scene.meshes.filter((m): m is InstancedMesh => m instanceof InstancedMesh);
    expect(inst).toHaveLength(10);
    const sources = new Set(inst.map((m) => m.sourceMesh));
    expect(sources.size).toBe(2);   // one draw call per look
    expect([...sources].map((s) => s.material as Material).sort((a, b) => a.name.localeCompare(b.name))).toEqual([gold, leather]);
    for (const s of sources) expect(s.isVisible).toBe(false);   // a source draws only its instances
    expect(part.isVisible).toBe(false);
    for (const b of balls) expect(b.visibility).toBe(0);
    expect(inst.filter((m) => m.sourceMesh.material === gold)).toHaveLength(2);   // balls 4 and 9
    expect(skin.count).toBe(10);
  });

  it('each instance sits on its ball where the template mesh sits on the template (the flip and the offset kept, scaled)', () => {
    const { scene, part, template, balls, leather } = rig();
    const k = 0.2 / 0.24;
    instanceSkinOnto(template, balls, (_i, base) => base, () => k);
    part.computeWorldMatrix(true);
    const off = part.getAbsolutePosition().clone();   // the template sits at the origin, unrotated
    for (const b of balls) {
      b.computeWorldMatrix(true);
      const i = scene.meshes.find((m) => m instanceof InstancedMesh && m.parent?.parent === b) as InstancedMesh;
      i.computeWorldMatrix(true);
      expect(Vector3.Distance(i.getAbsolutePosition(), b.getAbsolutePosition().add(off.scale(k)))).toBeLessThan(1e-6);
      // the same handedness as its source, so Babylon draws it as an instance (not as a regular mesh)
      expect(Math.sign(i.getWorldMatrix().determinant())).toBe(Math.sign(i.sourceMesh.getWorldMatrix().determinant()));
      expect(i.sourceMesh.material).toBe(leather);
    }
  });

  it('restyle() rebuilds the looks from lookOf as it reads now; dispose() drops every instance and the template', () => {
    const { scene, template, gold, balls } = rig();
    let moneyRack = -1;
    const skin = instanceSkinOnto(template, balls, (i, base) => (i % 5 === 4 || Math.floor(i / 5) === moneyRack ? gold : base), () => 1);
    const golds = (): number => scene.meshes.filter((m) => m instanceof InstancedMesh && m.sourceMesh.material === gold && !m.isDisposed()).length;
    expect(golds()).toBe(2);
    moneyRack = 1; skin.restyle();
    expect(golds()).toBe(6);   // rack 1's five, plus rack 0's money ball
    expect(scene.meshes.filter((m) => m instanceof InstancedMesh)).toHaveLength(10);   // rebuilt, not stacked
    skin.dispose();
    expect(scene.meshes.filter((m) => m instanceof InstancedMesh)).toHaveLength(0);
    expect(template.isDisposed()).toBe(true);
  });
});
