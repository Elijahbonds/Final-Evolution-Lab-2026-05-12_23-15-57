// IMPROVE (2026-10-06), aeroaces #16 #17 #18 #20: the toy planes share their untinted paint and drop their primitives
// once a body is on; the field's bodies are one instanced mesh, from the 1024² LOD.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, InstancedMesh, NullEngine, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { buildToyPlane, sharedToyPaints } from './toyPlane';
import { dressVehicle, vehicleBodyUrl, vehicleLodUrl } from './vehicleBody';

let scene: Scene;
beforeEach(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 2, -8), scene); });
afterEach(() => { vi.restoreAllMocks(); scene.dispose(); });

describe('#18 shared paint', () => {
  it('eight planes hold 5 shared materials, not 40; only body and trim are per plane', () => {
    const before = scene.materials.length;
    const planes = [buildToyPlane(scene, 'player', '#e63946', '#ffd166'), ...Array.from({ length: 7 }, (_, i) => buildToyPlane(scene, `r${i}`, '#4cc9f0', '#a5f3fc', { toyPilot: true }))];
    expect(sharedToyPaints(scene)).toBe(5);   // dark, cream, prop blur, skin, cap
    expect(scene.materials.length - before).toBe(8 * 2 + 5);   // was 8 × 4 + 7 × 2 (skin, cap) + 8 (blur) = 54
    for (const p of planes) p.dispose();
    expect(sharedToyPaints(scene)).toBe(0);   // the last plane to let go disposes them
    expect(scene.materials.length).toBe(before);
  });
});

describe('#16 primitives go once the body is on', () => {
  it('dropPrimitives disposes every primitive (and the plane\'s own paint) and keeps the anchors; it is idempotent', () => {
    const meshes0 = scene.meshes.length;
    const rival = buildToyPlane(scene, 'r', '#4cc9f0', '#a5f3fc', { toyPilot: true });
    const player = buildToyPlane(scene, 'p', '#e63946', '#ffd166');
    const built = scene.meshes.length - meshes0;
    expect(rival.parts.length).toBe(27);
    expect(player.parts.length).toBe(23);
    expect(built).toBe(50);   // the whole field: 23 + 7 × 27 = 212 shadow-caster entries before, 0 after
    rival.dropPrimitives(); rival.dropPrimitives();
    player.dropPrimitives();
    expect(scene.meshes.length).toBe(meshes0);
    expect(rival.parts).toHaveLength(0);
    for (const n of [rival.prop, rival.seat, rival.scarfAnchor, ...rival.wingtips]) expect(n.isDisposed()).toBe(false);
    expect(sharedToyPaints(scene)).toBe(0);
    rival.dispose(); player.dispose();
  });
});

describe('#17 #20 the field wears one instanced LOD body', () => {
  const glb = (file: string) => 'data:model/gltf-binary;base64,' + readFileSync(path.resolve('public/models/vehicles', file)).toString('base64');
  const lodFile = path.basename(vehicleLodUrl('plane', 'rival')!);
  const fullFile = path.basename(vehicleBodyUrl('plane', 'rival'));

  it('the LOD file is on disk, under half the full body, the same mesh with maps ≤ 1024²', async () => {
    const lod = statSync(path.resolve('public/models/vehicles', lodFile)).size;
    const full = statSync(path.resolve('public/models/vehicles', fullFile)).size;
    expect(lod).toBeLessThan(full * 0.5);
    const a = await SceneLoader.LoadAssetContainerAsync('', glb(lodFile), scene, undefined, '.glb');
    const b = await SceneLoader.LoadAssetContainerAsync('', glb(fullFile), scene, undefined, '.glb');
    const verts = (c: typeof a) => c.meshes.reduce((n, m) => n + m.getTotalVertices(), 0);
    expect(verts(a)).toBe(verts(b));
    expect(a.textures.length).toBeGreaterThan(0);
    // the payload: three 1024² maps where the full body has three 2048² ones (read from the GLB's own JSON)
    const sizes = (f: string): number[] => {
      const buf = readFileSync(path.resolve('public/models/vehicles', f));
      const jl = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + jl).toString());
      const bin = 20 + jl + 8;
      return j.images.map((im: { bufferView: number }) => {
        const bv = j.bufferViews[im.bufferView], d = buf.subarray(bin + (bv.byteOffset ?? 0), bin + (bv.byteOffset ?? 0) + bv.byteLength);
        for (let i = 2; i < d.length - 8;) {   // the JPEG's frame header carries its size
          if (d[i] !== 0xff) { i++; continue; }
          const mk = d[i + 1];
          if (mk >= 0xc0 && mk <= 0xc3) return Math.max(d.readUInt16BE(i + 5), d.readUInt16BE(i + 7));
          i += 2 + d.readUInt16BE(i + 2);
        }
        return -1;
      });
    };
    expect(sizes(fullFile)).toEqual([2048, 2048, 2048]);
    expect(sizes(lodFile)).toEqual([1024, 1024, 1024]);
  });

  it('with `instance`, the first body is a clone and every later one an instance of it; `lod` asks for the LOD file', async () => {
    const asked: string[] = [];
    // the real loader on a data URI, through the same entry dressVehicle uses
    const real = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader);
    vi.spyOn(SceneLoader, 'LoadAssetContainerAsync').mockImplementation(((root: string, file: string, sc: Scene) => {
      asked.push(`${root}${file}`);
      return real('', glb(file.includes('lod') ? lodFile : fullFile), sc, undefined, '.glb');
    }) as never);
    const roots = [0, 1, 2].map((i) => new TransformNode(`toy_r${i}`, scene));
    const handles = await Promise.all(roots.map((r) => dressVehicle(scene, r, 'plane', 'rival', { lod: true, instance: true })));
    expect(asked).toEqual([`/models/vehicles/${lodFile}`]);   // loaded once, the LOD
    const meshesOf = (i: number) => handles[i]!.root.getChildMeshes().filter((m) => m.getTotalVertices() > 0);
    expect(meshesOf(0).every((m) => !(m instanceof InstancedMesh))).toBe(true);
    for (const i of [1, 2]) {
      const ms = meshesOf(i);
      expect(ms.length).toBe(meshesOf(0).length);
      for (const m of ms) {
        expect(m).toBeInstanceOf(InstancedMesh);
        expect(meshesOf(0)).toContain((m as InstancedMesh).sourceMesh);
      }
      expect(handles[i]!.root.parent).toBe(roots[i]);
    }
    // without the option nothing changes: a clone of the full body
    const plain = await dressVehicle(scene, new TransformNode('toy_plain', scene), 'plane', 'rival');
    expect(plain!.root.getChildMeshes().some((m) => m instanceof InstancedMesh)).toBe(false);
    expect(asked[asked.length - 1]).toBe(`/models/vehicles/${fullFile}`);
  });
});
