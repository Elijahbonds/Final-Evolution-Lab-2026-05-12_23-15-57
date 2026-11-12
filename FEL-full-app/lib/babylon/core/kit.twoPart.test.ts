// KIT-NO-HIGH-BOOTS (2026-10-20): the low shoe is two glTF primitives (shoe + low sock), and the pass-2 tee and shorts ship
// without UVs. The kit shows, hides and paints a garment's parts together; a UV-less garment gets an atlas that renders
// exactly as the welded mesh did.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FreeCamera, Mesh, NullEngine, Scene, SceneLoader, Vector3, VertexBuffer } from '@babylonjs/core';
import type { AbstractMesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyKit, kitOf } from './kit';
import { ensureGarmentUVs } from './garmentFixes';

const fake = (name: string) => ({ name, isVisible: true }) as unknown as AbstractMesh;

describe('a garment in two primitives is one item', () => {
  it('parses Babylon\'s `_primitive<i>` parts (before or after the clone suffix) to the garment they belong to', () => {
    expect(kitOf('Kit_shoes_shoes_evo_primitive0')).toEqual({ slot: 'shoes', itemId: 'shoes_evo' });
    expect(kitOf('Kit_shoes_shoes_evo_primitive1_c4')).toEqual({ slot: 'shoes', itemId: 'shoes_evo' });
    expect(kitOf('Kit_shoes_shoes_flight_primitive12')).toEqual({ slot: 'shoes', itemId: 'shoes_flight' });
    expect(kitOf('KitSole_evo_primitive0')).toBeNull();
  });
  it('shows both parts of the equipped shoe and neither part of the other', () => {
    const ms = ['Kit_shoes_shoes_evo_primitive0', 'Kit_shoes_shoes_evo_primitive1', 'Kit_shoes_shoes_flight_primitive0', 'Kit_shoes_shoes_flight_primitive1'].map(fake);
    expect(applyKit(ms, { shoes: 'shoes_flight' })).toBe(4);
    expect(ms.map((m) => m.isVisible)).toEqual([false, false, true, true]);
    applyKit(ms, { shoes: 'shoes_evo' });
    expect(ms.map((m) => m.isVisible)).toEqual([true, true, false, false]);
  });
});

describe('a garment without UVs gets an atlas (Creator paint draws through UVs)', () => {
  it('unwelds to one cell per triangle: the same corners, normals and triangles, every UV inside its own cell', () => {
    const scene = new Scene(new NullEngine());
    const m = new Mesh('Kit_tops_t', scene);
    const P = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1], N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0], I = [0, 1, 2, 1, 3, 2, 0, 2, 4];
    m.setVerticesData(VertexBuffer.PositionKind, P); m.setVerticesData(VertexBuffer.NormalKind, N); m.setIndices(I);
    expect(ensureGarmentUVs(m)).toBe(true);
    expect(ensureGarmentUVs(m)).toBe(false);   // once: it has UVs now
    const p = m.getVerticesData(VertexBuffer.PositionKind)!, n = m.getVerticesData(VertexBuffer.NormalKind)!, uv = m.getVerticesData(VertexBuffer.UVKind)!;
    const ind = Array.from(m.getIndices()!);
    expect(m.getTotalVertices()).toBe(9);
    expect(ind).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) { expect(p[i * 3 + k]).toBe(P[I[i] * 3 + k]); expect(n[i * 3 + k]).toBe(N[I[i] * 3 + k]); }
    const cells = 2, cell = 1 / cells;   // ceil(sqrt(3)) cells a side
    for (let t = 0; t < 3; t++) {
      const cu = (t % cells) * cell, cv = Math.floor(t / cells) * cell;
      for (let c = 0; c < 3; c++) {
        const u = uv[(t * 3 + c) * 2], v = uv[(t * 3 + c) * 2 + 1];
        expect(u).toBeGreaterThan(cu); expect(u).toBeLessThan(cu + cell);
        expect(v).toBeGreaterThan(cv); expect(v).toBeLessThan(cv + cell);
      }
    }
    // a mesh that already has UVs is left as it is
    const shoe = new Mesh('Kit_shoes_s', scene);
    shoe.setVerticesData(VertexBuffer.PositionKind, P); shoe.setVerticesData(VertexBuffer.UVKind, [0, 0, 1, 0, 0, 1, 1, 1, 0.5, 0.5]); shoe.setIndices(I);
    expect(ensureGarmentUVs(shoe)).toBe(false);
    expect(shoe.getTotalVertices()).toBe(5);
    scene.dispose();
  });
  it('on the kit body: the tee, shorts and sock get UVs and keep their skinning; the shoe keeps its own', async () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const url = `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`;
    const kit = await SceneLoader.LoadAssetContainerAsync('', url, scene, undefined, '.glb');
    const inst = kit.instantiateModelsToScene((x) => `${x}_c1`, false, { doNotInstantiate: true });
    const meshes = (inst.rootNodes[0] as TransformNode).getChildMeshes();
    const before = new Map(meshes.map((m) => [m.name, { verts: m.getTotalVertices(), tris: (m.getIndices()?.length ?? 0) / 3, uv: m.isVerticesDataPresent(VertexBuffer.UVKind) }]));
    applyKit(meshes, { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_evo' });
    const shown = meshes.filter((m) => kitOf(m.name) && m.isVisible);
    expect(shown.map((m) => m.name).sort()).toEqual(['Kit_shoes_shoes_evo_primitive0_c1', 'Kit_shoes_shoes_evo_primitive1_c1', 'Kit_shorts_shorts_court_c1', 'Kit_tops_top_lab_c1']);
    for (const m of shown) {
      const b = before.get(m.name)!;
      expect(m.isVerticesDataPresent(VertexBuffer.UVKind), m.name).toBe(true);
      // every triangle is still drawn: the shoe's light sole band (garmentFixes) moves its bottom triangles to a KitSole mesh
      const sole = scene.meshes.find((x) => x.metadata?.felSoleOf === m.name);
      expect((m.getIndices()!.length + (sole?.getIndices()?.length ?? 0)) / 3, m.name).toBe(b.tris);
      if (b.uv) expect(m.getTotalVertices(), m.name).toBe(b.verts);   // the shoe had a map: untouched
      else expect(m.getTotalVertices(), m.name).toBe(b.tris * 3);
      expect(m.getVerticesData(VertexBuffer.MatricesWeightsKind)!.length, m.name).toBe(m.getTotalVertices() * 4);
    }
    // a hidden garment gets its UVs at the same first apply, so its vertex count never changes under a later cache
    const bonds = meshes.find((m) => m.name === 'Kit_tops_top_bonds_c1')!;
    expect(bonds.isVisible).toBe(false);
    expect(bonds.getTotalVertices()).toBe(before.get(bonds.name)!.tris * 3);
    applyKit(meshes, { tops: 'top_bonds' });
    expect(bonds.getTotalVertices()).toBe(before.get(bonds.name)!.tris * 3);
    scene.dispose();
  }, 120_000);
});
