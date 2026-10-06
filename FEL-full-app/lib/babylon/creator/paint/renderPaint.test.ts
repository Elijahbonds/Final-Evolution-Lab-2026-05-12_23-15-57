// Paint on the REAL kit body through the identity pipe (fel-kit-male.glb in a NullEngine): IMPROVE (2026-10-06),
// CREATOR-PLAN phase 3. The texture is made, bound over the skin, sized by tier, kept across re-applies, painted onto a
// garment when a layer asks, released when the paint goes and disposed with the body; suit mode hides the garments.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, RawTexture, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, PBRMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyIdentity, type PlayerIdentity } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { defaultFace } from '../../../closet/wearable-catalog';
import { sanitizeCreatorDoc } from '../../../creator/look/sanitize';
import { MAX_PAINT_LAYERS, type CreatorDoc, type PaintLayer } from '../../../creator/look/doc';
import { PAINT_SIZES, flushPaint, paintBufferOf, paintStats, setPaintBaseReader, syncPaint } from './renderPaint';
import { atomIndex } from './bodyChart';
import { chartForBody, geometryKey, isPaintBody, surfaceMapFor } from './surfaceMap';
import type { Mesh } from '@babylonjs/core';

let scene: Scene, desktop: Scene;
let kit: AssetContainer, kitDesk: AssetContainer;
const GLB = () => `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`;
beforeAll(async () => {
  // the albedo under the paint: a flat 128 grey, so pixels are predictable (the browser reads the real map back)
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  scene.metadata = { felTier: 'mobile' };
  kit = await SceneLoader.LoadAssetContainerAsync('', GLB(), scene, undefined, '.glb');
  desktop = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), desktop);
  kitDesk = await SceneLoader.LoadAssetContainerAsync('', GLB(), desktop, undefined, '.glb');
}, 120_000);
afterAll(() => setPaintBaseReader(null));

let n = 0;
function body(c = kit): SpawnedCharacter {
  const inst = c.instantiateModelsToScene((x) => `${x}_c${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `p${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const ID = (creator: CreatorDoc | null): PlayerIdentity => ({
  proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null, wardrobe: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' }, custom: true, body: 'kit-male', creator,
});
const doc = (paint: Partial<PaintLayer>[], suit = false) => sanitizeCreatorDoc({
  v: 1, paint: paint.map((p, i) => ({ id: `l${i}`, type: 'fill', region: 'torsoFront', surface: 'both', at: {}, colours: ['#FF0000'], opacity: 1, ...p })), flags: { suit },
})!;
const skinMesh = (s: SpawnedCharacter) => s.meshes.find((m) => isPaintBody(m.name))! as Mesh;
const albedoTex = (m: AbstractMesh) => (m.material as PBRMaterial).albedoTexture;
/** The colour of the first texel of `atom` in a mesh's paint buffer. */
function texelOf(s: SpawnedCharacter, m: Mesh, atom: string, size: number): number[] {
  const body = skinMesh(s);
  const map = surfaceMapFor(m, chartForBody(body)!, geometryKey(body), size)!;
  const buf = paintBufferOf(s.root, m)!;
  const lab = atomIndex(atom as never) + 1;
  const i = map.label.findIndex((l, k) => l === lab && map.covered[k] === 1);
  return Array.from(buf.slice(i * 4, i * 4 + 4));
}

describe('paint through the identity pipe', () => {
  it('paints the skin: one texture over the skin\'s own albedo, sized for the tier, bound with the tint baked in', () => {
    const s = body();
    applyIdentity(s, ID(null));
    const tint = (skinMesh(s).material as PBRMaterial).albedoColor.clone();
    applyIdentity(s, ID(doc([{ surface: 'skin' }])));
    flushPaint(s.root);
    const st = paintStats(s.root)!;
    expect(st.targets).toHaveLength(1);
    expect(st.targets[0]).toMatchObject({ kind: 'skin', size: PAINT_SIZES.mobile.skin, complete: true, bound: true, pendingTiles: 0 });
    const tex = albedoTex(skinMesh(s));
    expect(tex).toBeInstanceOf(RawTexture);
    expect(tex!.getSize()).toEqual({ width: 1024, height: 1024 });
    const c = (skinMesh(s).material as PBRMaterial).albedoColor;
    expect([c.r, c.g]).toEqual([1, 1]);   // the material's tint is baked into the texture
    expect(texelOf(s, skinMesh(s), 'torsoFront', 1024)).toEqual([255, 0, 0, 255]);
    // the back is not in the layer's region: the albedo (128 grey × the skin's tint, never pure grey and never red)
    // the PBR shader multiplies the linear albedo by the colour; baked into gamma bytes that is colour^(1/2.2)
    const back = texelOf(s, skinMesh(s), 'torsoBack', 1024);
    const want = [tint.r, tint.g, tint.b].map((c) => Math.min(255, Math.round(128 * Math.pow(c, 1 / 2.2))));
    back.slice(0, 3).forEach((v, i) => expect(Math.abs(v - want[i]), `channel ${i}`).toBeLessThanOrEqual(1));
    s.root.dispose();
  }, 120_000);

  it('a re-apply (every Closet keypress) re-binds the same texture after the skin tone resets the material; nothing new is made', () => {
    const s = body();
    const d = doc([{}, { type: 'stamp', stamp: 'star', colours: ['#FFFFFF'] }]);
    applyIdentity(s, ID(d)); flushPaint(s.root);
    const tex = albedoTex(skinMesh(s));
    const textures = scene.textures.length, materials = scene.materials.length;
    for (let i = 0; i < 5; i++) { applyIdentity(s, ID(d)); flushPaint(s.root); }
    expect(albedoTex(skinMesh(s))).toBe(tex);
    expect(scene.textures.length).toBe(textures);
    expect(scene.materials.length).toBe(materials);
    s.root.dispose();
  }, 120_000);

  it('an edit redraws only the tiles it touches (a stamp moved on the chest)', () => {
    const s = body();
    const layers: Partial<PaintLayer>[] = [{ region: 'all', colours: ['#202020'] }, { type: 'stamp', stamp: 'star', at: { x: 0.5, y: 0.7, rot: 0, scale: 0.5, stretch: 1 } }];
    applyIdentity(s, ID(doc(layers))); flushPaint(s.root);
    applyIdentity(s, ID(doc([layers[0], { ...layers[1], at: { x: 0.55, y: 0.7, rot: 0, scale: 0.5, stretch: 1 } }])));
    const st = paintStats(s.root)!.targets[0];
    expect(st.pendingTiles).toBeGreaterThan(0);
    expect(st.pendingTiles).toBeLessThan(st.tiles * 0.05);
    flushPaint(s.root);
    s.root.dispose();
  }, 120_000);

  it('taking the paint off gives the skin back its own map and tint; the body\'s disposal disposes the texture', () => {
    const s = body();
    applyIdentity(s, ID(null));
    const own = albedoTex(skinMesh(s));
    applyIdentity(s, ID(doc([{}]))); flushPaint(s.root);
    const painted = albedoTex(skinMesh(s)) as RawTexture;
    expect(painted).not.toBe(own);
    applyIdentity(s, ID(doc([])));
    expect(albedoTex(skinMesh(s))).toBe(own);
    expect(paintStats(s.root)).toBeNull();
    expect(scene.textures).not.toContain(painted);
    // painted again, then the body goes: its texture goes with it
    applyIdentity(s, ID(doc([{}]))); flushPaint(s.root);
    const again = albedoTex(skinMesh(s)) as RawTexture;
    expect(scene.textures).toContain(again);
    s.root.dispose();
    expect(scene.textures).not.toContain(again);
  }, 120_000);

  it('a hidden layer draws nothing (and a doc of only hidden layers paints nothing at all)', () => {
    const s = body();
    applyIdentity(s, ID(doc([{ hidden: true }])));
    expect(paintStats(s.root)).toBeNull();
    s.root.dispose();
  }, 60_000);

  it('a layer on skin and clothes paints the skin and only the garments its region reaches (a chest fill leaves the shoes alone)', () => {
    const s = body();
    applyIdentity(s, ID(doc([{}]))); flushPaint(s.root);
    const meshes = paintStats(s.root)!.targets.map((t) => t.mesh.replace(/_c\d+$/, '')).sort();
    expect(meshes).toEqual(['Body', 'Kit_shorts_shorts_court', 'Kit_tops_top_lab']);
    s.root.dispose();
  }, 120_000);

  it('a layer on the clothes paints the shown top with its own smaller texture, and leaves the skin alone', () => {
    const s = body();
    applyIdentity(s, ID(doc([{ surface: 'garments', colours: ['#00FF00'] }]))); flushPaint(s.root);
    const st = paintStats(s.root)!;
    const kinds = st.targets.map((t) => `${t.kind}:${t.mesh.replace(/_c\d+$/, '')}:${t.size}`);
    expect(kinds).toContain(`garment:Kit_tops_top_lab:${PAINT_SIZES.mobile.garment}`);
    expect(kinds.some((k) => k.startsWith('skin'))).toBe(false);
    const top = s.meshes.find((m) => m.name.startsWith('Kit_tops_top_lab'))! as Mesh;
    expect(albedoTex(top)).toBeInstanceOf(RawTexture);
    expect(texelOf(s, top, 'torsoFront', 512)).toEqual([0, 255, 0, 255]);
    s.root.dispose();
  }, 120_000);

  it('a painted garment re-tinted by the Closet (its colour copied into the same material) bakes the new colour in', () => {
    const s = body();
    const d = doc([{ surface: 'garments', colours: ['#00FF00'] }]);
    applyIdentity(s, ID(d)); flushPaint(s.root);
    const top = s.meshes.find((m) => m.name.startsWith('Kit_tops_top_lab'))! as Mesh;
    const before = texelOf(s, top, 'torsoBack', 512);
    applyIdentity(s, { ...ID(d), palette: { jersey: '#FF0000', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' } }); flushPaint(s.root);
    const after = texelOf(s, top, 'torsoBack', 512);
    // 128 grey under a red tint: red stays up, green and blue go to 0
    expect(after[1]).toBe(0); expect(after[2]).toBe(0);
    expect(after).not.toEqual(before);
    expect(texelOf(s, top, 'torsoFront', 512)).toEqual([0, 255, 0, 255]);
    s.root.dispose();
  }, 120_000);

  it('suit mode hides the garments (not the parts) and paints clothes-only layers on the skin; off again, the kit is back', () => {
    const s = body();
    const shown = () => s.meshes.filter((m) => /^Kit_/.test(m.name) && m.isVisible).map((m) => m.name.replace(/_c\d+$/, '')).sort();
    applyIdentity(s, ID(null));
    const kitShown = shown();
    expect(kitShown.length).toBe(3);
    const suit = sanitizeCreatorDoc({ ...doc([{ surface: 'garments' }], true), parts: [{ id: 'p1', shape: 'spike', bone: 'Head', colour: '#FF0000' }] })!;
    applyIdentity(s, ID(suit)); flushPaint(s.root);
    expect(shown()).toEqual([]);
    expect(paintStats(s.root)!.targets.map((t) => t.kind)).toEqual(['skin']);
    // the spike part is still there
    expect(s.root.getChildMeshes().some((m) => /part/i.test(m.name) && m.isVisible)).toBe(true);
    applyIdentity(s, ID(doc([{ surface: 'garments' }])));
    expect(shown()).toEqual(kitShown);
    s.root.dispose();
  }, 120_000);

  it('a suit with no layers just hides the clothes', () => {
    const s = body();
    applyIdentity(s, ID(doc([], true)));
    expect(s.meshes.filter((m) => /^Kit_/.test(m.name) && m.isVisible)).toEqual([]);
    expect(paintStats(s.root)!.targets).toEqual([]);
    s.root.dispose();
  }, 60_000);

  it('the budget holds: a doc of 30 layers keeps 24', () => {
    const d = doc(Array.from({ length: 30 }, () => ({})));
    expect(d.paint).toHaveLength(MAX_PAINT_LAYERS);
  });

  it('desktop gets the 2048 texture; the memory a 10-layer body holds is measured', () => {
    const s = body(kitDesk);
    const ten: Partial<PaintLayer>[] = [
      { region: 'body', colours: ['#C8102E'] }, { region: 'head', colours: ['#C8102E'] }, { region: 'legLeft', colours: ['#1A3FA0'] },
      { region: 'legRight', colours: ['#1A3FA0'] }, { type: 'pattern', pattern: 'web', colours: ['#111111'], weight: 0.3 },
      { type: 'pattern', pattern: 'web', region: 'head', colours: ['#111111'] }, { type: 'stamp', stamp: 'eyeSharp', region: 'face', colours: ['#FFFFFF', '#000000'], mirror: true, at: { x: 0.62, y: 0.62, rot: -10, scale: 0.35, stretch: 1 } },
      { type: 'stamp', stamp: 'star', colours: ['#FFD700'], at: { x: 0.5, y: 0.72, rot: 0, scale: 1, stretch: 1 } }, { type: 'text', text: 'FEL 23', region: 'torsoBack', colours: ['#FFFFFF', '#000000'] },
      { type: 'pattern', pattern: 'stripes', region: 'armLeft', colours: ['#FFFFFF'], opacity: 0.9 },
    ];
    applyIdentity(s, ID(doc(ten, true)));
    flushPaint(s.root);
    const st = paintStats(s.root)!;
    expect(st.targets[0].size).toBe(PAINT_SIZES.desktop.skin);
    expect(st.cpuBytes).toBe(2048 * 2048 * 4);
    expect(st.gpuBytes).toBe(Math.round(2048 * 2048 * 4 * (4 / 3)));
    console.info(`[paint memory] 10 layers, desktop: buffer ${(st.cpuBytes / 2 ** 20).toFixed(1)} MiB, GPU ${(st.gpuBytes / 2 ** 20).toFixed(1)} MiB`);
    s.root.dispose();
  }, 180_000);

  it('syncPaint on a body with no paint and no doc does nothing at all', () => {
    const s = body();
    expect(syncPaint(s, null)).toEqual({ targets: 0, layers: 0 });
    expect(paintStats(s.root)).toBeNull();
    s.root.dispose();
  });
});
