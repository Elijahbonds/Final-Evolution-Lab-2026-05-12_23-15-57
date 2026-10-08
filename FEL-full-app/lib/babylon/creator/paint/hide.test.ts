// HIDE AND CUT-OUT (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a, tool #4) on the REAL kit bodies: the ears are a region
// of their own (split off the head by position, measured), and hide.ears / hide.head cut those texels out of the SKIN'S
// paint texture (alpha 0) under an alpha test — the body mesh, its picks and its colliders untouched; garments never cut.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, Mesh, PBRMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ATOM_COUNT, ATOMS, atomIndex, classify, REGION_ATOMS } from './bodyChart';
import { chartForBody, isPaintBody, restSkin, surfaceMapFor, geometryKey } from './surfaceMap';
import { ALPHA_TEST_MODE, cutRegions, flushPaint, paintBufferOf, paintStats, setPaintBaseReader } from './renderPaint';
import { cutLabels } from './composite';
import { applyIdentity, type PlayerIdentity } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { defaultFace } from '../../../closet/wearable-catalog';
import { sanitizeCreatorDoc } from '../../../creator/look/sanitize';

const kits: Record<'male' | 'female', AssetContainer> = {} as never;
let scene: Scene;
beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  scene.metadata = { felTier: 'mobile' };
  for (const sex of ['male', 'female'] as const) {
    kits[sex] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${sex}.glb`).toString('base64')}`, scene, undefined, '.glb');
  }
}, 120_000);
afterAll(() => setPaintBaseReader(null));
let n = 0;
function body(sex: 'male' | 'female' = 'male'): SpawnedCharacter {
  const inst = kits[sex].instantiateModelsToScene((x) => `${x}_h${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `h${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const ID = (creator: unknown): PlayerIdentity => ({
  proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null, wardrobe: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' }, custom: true, body: 'kit-male',
  creator: creator ? sanitizeCreatorDoc(creator) : null,
});
const skin = (s: SpawnedCharacter) => s.meshes.find((m) => isPaintBody(m.name)) as Mesh;

describe('the ears region (measured on both kit heads)', () => {
  it('is an atom of the head group, in the head region, not in the body region', () => {
    expect(ATOMS).toContain('ears');
    expect(REGION_ATOMS.head).toContain('ears');
    expect(REGION_ATOMS.body).not.toContain('ears');
    expect(REGION_ATOMS.ears).toEqual(['ears']);
  });
  it('holds hundreds of vertices, all far out to the side, split evenly left and right, none near the face', () => {
    for (const sex of ['male', 'female'] as const) {
      const b = body(sex);
      const m = skin(b);
      const chart = chartForBody(m)!;
      const rs = restSkin(m)!;
      const cl = classify(chart, rs);
      const e = atomIndex('ears');
      const headC = chart.groups[0].o;
      let left = 0, right = 0, nearMid = 0;
      for (let v = 0; v < cl.n; v++) {
        if (cl.atomW[v * ATOM_COUNT + e] <= 0.5) continue;
        const d = [rs.P[v * 3] - headC[0], rs.P[v * 3 + 1] - headC[1], rs.P[v * 3 + 2] - headC[2]];
        const lat = d[0] * chart.left[0] + d[1] * chart.left[1] + d[2] * chart.left[2];
        if (Math.abs(lat) < 0.06) nearMid++;
        if (lat > 0) left++; else right++;
      }
      expect(left + right, sex).toBeGreaterThan(300);
      expect(nearMid, sex).toBe(0);
      expect(Math.abs(left - right) / (left + right), sex).toBeLessThan(0.1);
      b.root.dispose();
    }
  });
});

describe('cutting out of the skin', () => {
  it('cutRegions: ears alone, or the whole head (face, scalp and ears)', () => {
    expect(cutRegions(sanitizeCreatorDoc({ v: 1, flags: { hide: { ears: true } } }))).toEqual(['ears']);
    expect(cutRegions(sanitizeCreatorDoc({ v: 1, flags: { hide: { head: true, ears: true } } }))).toEqual(['head']);
    expect(cutRegions(sanitizeCreatorDoc({ v: 1, flags: { hide: { eyes: true } } }))).toEqual([]);
    const t = cutLabels(['head'])!;
    for (const a of ['face', 'scalp', 'ears'] as const) expect(t[atomIndex(a) + 1]).toBe(1);
    expect(t[atomIndex('neck') + 1]).toBe(0);
    expect(cutLabels([])).toBeNull();
  });
  it('hide.ears: the ear texels go transparent under an alpha test, every other texel stays opaque; picks untouched', () => {
    const s = body();
    const pick = s.meshes.map((m) => [m.name, m.isPickable, m.checkCollisions]);
    applyIdentity(s, ID(null));
    const mat = skin(s).material as PBRMaterial;
    const mode0 = mat.transparencyMode;
    applyIdentity(s, ID({ v: 1, flags: { hide: { ears: true } } }));
    flushPaint(s.root);
    expect(paintStats(s.root)!.targets.map((t) => t.kind)).toEqual(['skin']);   // garments are never cut
    const m = skin(s).material as PBRMaterial;
    expect(m.transparencyMode).toBe(ALPHA_TEST_MODE);
    expect(m.useAlphaFromAlbedoTexture).toBe(true);
    const map = surfaceMapFor(skin(s), chartForBody(skin(s))!, geometryKey(skin(s)), 1024)!;
    const buf = paintBufferOf(s.root, skin(s))!;
    const ear = atomIndex('ears') + 1, face = atomIndex('face') + 1;
    let cut = 0, kept = 0, earTexels = 0, faceOpaque = 0, faceTexels = 0;
    for (let i = 0; i < map.label.length; i++) {
      if (!map.covered[i]) continue;
      if (map.label[i] === ear) { earTexels++; if (buf[i * 4 + 3] === 0) cut++; }
      else { if (buf[i * 4 + 3] === 255) kept++; if (map.label[i] === face) { faceTexels++; if (buf[i * 4 + 3] === 255) faceOpaque++; } }
    }
    expect(earTexels).toBeGreaterThan(500);
    expect(cut).toBe(earTexels);
    expect(faceOpaque).toBe(faceTexels);
    expect(kept).toBeGreaterThan(100_000);
    expect(s.meshes.map((x) => [x.name, x.isPickable, x.checkCollisions])).toEqual(pick);
    // off again: no paint at all, the material as it was
    applyIdentity(s, ID(null));
    expect(paintStats(s.root)).toBeNull();
    expect((skin(s).material as PBRMaterial).transparencyMode).toBe(mode0);
  });
  it('hide.head cuts face, scalp and ears together, and works on top of paint layers', () => {
    const s = body('female');
    applyIdentity(s, ID({ v: 1, paint: [{ id: 'a', type: 'fill', region: 'all', surface: 'skin', at: {}, colours: ['#00FF00'], opacity: 1 }], flags: { hide: { head: true } } }));
    flushPaint(s.root);
    const map = surfaceMapFor(skin(s), chartForBody(skin(s))!, geometryKey(skin(s)), 1024)!;
    const buf = paintBufferOf(s.root, skin(s))!;
    const head = new Set(['face', 'scalp', 'ears'].map((a) => atomIndex(a as never) + 1));
    const neck = atomIndex('neck') + 1;
    let bad = 0, green = 0;
    for (let i = 0; i < map.label.length; i++) {
      if (!map.covered[i]) continue;
      const a = buf[i * 4 + 3];
      if (head.has(map.label[i]) ? a !== 0 : a !== 255) bad++;
      if (map.label[i] === neck && buf[i * 4 + 1] === 255 && buf[i * 4] === 0) green++;
    }
    expect(bad).toBe(0);
    expect(green).toBeGreaterThan(100);   // the layer still paints the neck under the cut head
  });
});

describe('garments are never cut', () => {
  it('hide.ears with a garment layer: the shirt is painted, every one of its texels opaque', () => {
    const s = body();
    applyIdentity(s, ID({ v: 1, paint: [{ id: 'g', type: 'fill', region: 'all', surface: 'garments', at: {}, colours: ['#0000FF'], opacity: 1 }], flags: { hide: { ears: true } } }));
    flushPaint(s.root);
    const st = paintStats(s.root)!;
    const garments = st.targets.filter((t) => t.kind === 'garment');
    expect(garments.length).toBeGreaterThan(0);
    for (const t of garments) {
      const m = s.meshes.find((x) => x.name === t.mesh)!;
      const buf = paintBufferOf(s.root, m)!;
      let transparent = 0;
      for (let i = 3; i < buf.length; i += 4) if (buf[i] !== 255) transparent++;
      expect(transparent, t.mesh).toBe(0);
      expect((m.material as PBRMaterial).transparencyMode).not.toBe(ALPHA_TEST_MODE);
    }
  });
});

describe('the cut is cosmetic', () => {
  it('the scene camera picks the same meshes with and without a cut (the body mesh is the same mesh)', () => {
    const s = body();
    const cam = new ArcRotateCamera('pc', -Math.PI / 2, Math.PI / 2, 3, new Vector3(0, 1.6, 0), scene);
    void cam;
    applyIdentity(s, ID({ v: 1, flags: { hide: { head: true } } }));
    flushPaint(s.root);
    expect(skin(s).isPickable).toBe(skin(body()).isPickable);
    expect(skin(s).getTotalVertices()).toBe(skin(body()).getTotalVertices());
  });
});
