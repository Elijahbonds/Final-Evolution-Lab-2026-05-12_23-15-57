// The identity pipe on the REAL kit body (fel-kit-male/female.glb in a NullEngine), for the Creator's phase-1 fixes
// (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md): the tinted-material cache (research 16), female skin maps (4), the
// Creator doc's colours and hook, the player's own accessories (2), and resolveIdentity reading the build palette (1).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Color3, FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AssetContainer, Material, PBRMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyIdentity, invalidateIdentity, resolveIdentity, skinFor, tintGarmentSlot, type PlayerIdentity } from './playerIdentity';
import { optOutAccessories, playerWearsOwnAccessories } from './playerAccessories';
import type { SpawnedCharacter } from './CharacterLibrary';
import { defaultFace } from '../../closet/wearable-catalog';
import { sanitizeCreatorDoc } from '../../creator/look/sanitize';

// One container per body, instantiated per case with SHARED materials — exactly how CharacterLibrary.spawn does it
// (instantiateModelsToScene(…, cloneMaterials=false)), so every body starts from the same source materials.
let scene: Scene;
const kits: Record<'male' | 'female', AssetContainer> = {} as never;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  for (const kind of ['male', 'female'] as const) {
    const url = `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${kind}.glb`).toString('base64')}`;
    kits[kind] = await SceneLoader.LoadAssetContainerAsync('', url, scene, undefined, '.glb');
  }
}, 60_000);

let n = 0;
async function body(kind: 'male' | 'female' = 'male'): Promise<SpawnedCharacter> {
  const inst = kits[kind].instantiateModelsToScene((x) => `${x}_t${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `t${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}

const ID = (o: Partial<PlayerIdentity> = {}): PlayerIdentity => ({
  proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null, wardrobe: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' }, custom: true, body: 'kit-male', ...o,
});
const mesh = (s: SpawnedCharacter, name: string) => s.meshes.find((m) => m.name.startsWith(name))!;
const albedo = (m: AbstractMesh) => (m.material as PBRMaterial).albedoColor.toHexString();

describe('tinted-material cache (research 16)', () => {
  it('re-applying a look (a live editor keypress) makes no new materials; colours still change', async () => {
    const s = await body();
    // warm the scene's shared skin-map cache with both families the loop uses (one albedo each, by design)
    applyIdentity(s, ID({ face: { ...defaultFace(), skinTone: '#432818' } }));
    applyIdentity(s, ID({ face: { ...defaultFace(), skinTone: '#FBE7D3' } }));
    const after1 = scene.materials.length;
    const textures1 = scene.textures.length;
    for (let i = 0; i < 10; i++) {
      applyIdentity(s, ID({ face: { ...defaultFace(), skinTone: i % 2 ? '#FBE7D3' : '#432818', hairColor: i % 2 ? '#B0B0B0' : '#FF3366' }, palette: { jersey: `#1${i}00${i}0`, shorts: '#222222', shoes: '#333333', accent: '#444444' } }));
    }
    expect(scene.materials.length).toBe(after1);
    expect(scene.textures.length).toBe(textures1);
    expect(albedo(mesh(s, 'Kit_tops_top_lab'))).toBe('#190090');
    // tints start from the ORIGINAL material, never a clone of a clone
    for (const m of s.meshes) expect(m.material?.name ?? '').not.toMatch(/_skin_skin|_wear_wear|_style_style/);
    s.root.dispose();
  }, 60_000);

  it('the clones (and the textures each one copied) go with the body', async () => {
    const s = await body();
    // the container's own materials are not in the scene; every scene material made from here on is a tint clone
    const before = scene.materials.length;
    const texBefore = scene.textures.length;
    applyIdentity(s, ID());
    const isTint = (m: Material) => /_(skin|style|wear)$/.test(m.name);
    const tinted = scene.materials.slice(before).filter(isTint);
    expect(tinted.length).toBeGreaterThan(4);
    s.root.dispose();
    for (const m of tinted) expect(scene.materials).not.toContain(m);
    // only the scene-shared sole material (garmentFixes, one per scene) may remain
    expect(scene.materials.slice(before).map((m) => m.name).filter((x) => !x.startsWith('kitSole.'))).toEqual([]);
    // what stays is the scene's shared skin-map cache (one albedo + the detail normal), by design
    expect(scene.textures.length - texBefore).toBeLessThanOrEqual(2);
  }, 60_000);

  it('the jersey plate is replaced, not stacked: its old material and canvas go with it', async () => {
    // node has no canvas: a 2D context that draws nothing is enough to count materials and textures
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
    vi.stubGlobal('OffscreenCanvas', class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return ctx; } });
    const s = await body();
    applyIdentity(s, ID({ jersey: { number: 23, name: 'ACE' } }));
    const mats = scene.materials.length, tex = scene.textures.length;
    for (let i = 0; i < 8; i++) applyIdentity(s, ID({ jersey: { number: i, name: 'ACE' } }));
    expect(scene.materials.slice(mats).map((m) => m.name)).toEqual([]);
    expect(scene.materials.length).toBe(mats);
    expect(scene.textures.length).toBe(tex);
    expect(s.meshes.filter((m) => m.name.startsWith('jersey_decal_'))).toHaveLength(1);
    expect(s.meshes.every((m) => !m.isDisposed())).toBe(true);
    s.root.dispose();
    vi.unstubAllGlobals();
  }, 60_000);

  it('a mode re-tinting a garment reuses the body\'s clone instead of stacking another', async () => {
    const s = await body();
    applyIdentity(s, ID());
    const count = scene.materials.length;
    tintGarmentSlot(s, ['jersey', 'top', 'shirt', 'tee'], '#ff2d78');
    tintGarmentSlot(s, ['jersey', 'top', 'shirt', 'tee'], '#00ff00');
    expect(scene.materials.length).toBe(count);
    expect(albedo(mesh(s, 'Kit_tops_top_lab'))).toBe('#00FF00');
    // a bare mesh list (no root) keeps the old one-off clone
    tintGarmentSlot({ meshes: s.meshes }, ['shoe'], '#000000');
    expect(scene.materials.length).toBeGreaterThan(count);
    s.root.dispose();
  }, 60_000);
});

describe('female skin maps (research 4)', () => {
  it('skinFor picks the body\'s sex in each family, male by default', () => {
    for (const [hex, fam] of [['#241509', 'dark'], ['#A9713C', 'medium'], ['#FBE7D3', 'light']] as const) {
      expect(skinFor(Color3.FromHexString(hex), 'female')!.key).toBe(`${fam}-female`);
      expect(skinFor(Color3.FromHexString(hex), 'male')!.key).toBe(`${fam}-male`);
      expect(skinFor(Color3.FromHexString(hex))!.key).toBe(`${fam}-male`);
    }
  });
  it('the female kit body wears the female map; the male body the male one', async () => {
    const f = await body('female');
    applyIdentity(f, ID({ body: 'kit-female' }));
    expect((mesh(f, 'Body').material!.metadata as { felSkin?: string }).felSkin).toBe('light-female');
    f.root.dispose();
    const m = await body('male');
    applyIdentity(m, ID({ body: 'kit-male' }));
    expect((mesh(m, 'Body').material!.metadata as { felSkin?: string }).felSkin).toBe('light-male');
    m.root.dispose();
  }, 60_000);
});

describe('the Creator doc on the body', () => {
  it('its colours win over the palette, its face values over the sliders, and the hook records it', async () => {
    const s = await body();
    const creator = sanitizeCreatorDoc({ v: 1, colours: { jersey: '#123456', shoes: '#654321' }, shape: { face: { faceLong: 0.7 } }, parts: [{ id: 'a', shape: 'horn', bone: 'Head', colour: '#fff' }] })!;
    applyIdentity(s, ID({ creator, face: { ...defaultFace(), sliders: { faceLong: 0.1, jawOpen: 0.3 } } }));
    expect(albedo(mesh(s, 'Kit_tops_top_lab'))).toBe('#123456');
    expect(albedo(mesh(s, 'Kit_shoes_shoes_flight'))).toBe('#654321');
    expect(albedo(mesh(s, 'Kit_shorts_shorts_court'))).toBe('#0B1220');   // no doc colour → the palette's
    const mgr = mesh(s, 'Body').morphTargetManager!;
    const w = (name: string) => { for (let i = 0; i < mgr.numTargets; i++) if (mgr.getTarget(i).name === name) return mgr.getTarget(i).influence; return NaN; };
    expect(w('faceLong')).toBeCloseTo(0.7);
    expect(w('jawOpen')).toBeCloseTo(0.3);
    expect((s.root.metadata as { felCreator?: unknown }).felCreator).toEqual({ v: 1, parts: 1, paint: 0, suit: false });
    applyIdentity(s, ID({ creator: null }));
    expect((s.root.metadata as { felCreator?: unknown }).felCreator).toBeNull();
    expect(albedo(mesh(s, 'Kit_tops_top_lab'))).toBe('#00E5FF');
    s.root.dispose();
  }, 60_000);
});

describe('the player\'s own accessories (research 2)', () => {
  const accMeshes = (s: SpawnedCharacter) => scene.meshes.filter((m) => !m.isDisposed() && m.name.startsWith(`acc_player_${s.root.uniqueId}`));
  it('hangs what was equipped, replaces it on change, and leaves with the body', async () => {
    const s = await body();
    applyIdentity(s, ID({ accessories: ['headband'] }));
    const first = accMeshes(s);
    expect(first.length).toBeGreaterThan(0);
    applyIdentity(s, ID({ accessories: ['headband'] }));   // same set: nothing rebuilt
    expect(accMeshes(s)).toEqual(first);
    applyIdentity(s, ID({ accessories: ['chain', 'armsleeve'] }));
    expect(first.every((m) => m.isDisposed())).toBe(true);
    expect(accMeshes(s).length).toBeGreaterThan(0);
    applyIdentity(s, ID({ accessories: [] }));
    expect(accMeshes(s)).toEqual([]);
    applyIdentity(s, ID({ accessories: ['headband'] }));
    const mats = accMeshes(s).map((m) => m.material as Material);
    s.root.dispose();
    expect(accMeshes(s)).toEqual([]);
    for (const m of mats) expect(scene.materials).not.toContain(m);
  }, 60_000);
  it('the library deals the seeded set to everyone but the self-dressing player body', () => {
    expect(playerWearsOwnAccessories('player', false, {})).toBe(true);
    // the pipeline and both previews spawn with identity: false and apply the identity themselves: still the player's own
    expect(playerWearsOwnAccessories('player', false, { identity: false } as never)).toBe(true);
    expect(playerWearsOwnAccessories('opponent', false, {})).toBe(false);
    expect(playerWearsOwnAccessories('player', true, {})).toBe(false);                      // a roster body
    expect(playerWearsOwnAccessories('player', false, { name: 'CASS' })).toBe(false);       // a named rival
    expect(playerWearsOwnAccessories('player', false, { tint: '#ff0000' })).toBe(false);
    expect(playerWearsOwnAccessories('player', false, { skinTone: '#8d5a3b' })).toBe(false);
    expect(playerWearsOwnAccessories('player', false, { look: { items: [] } })).toBe(false);
  });
  it('a spawn that opted out of accessories stays bare', async () => {
    const s = await body();
    optOutAccessories(s.root);
    applyIdentity(s, ID({ accessories: ['headband', 'chain'] }));
    expect(accMeshes(s)).toEqual([]);
    s.root.dispose();
  }, 60_000);
});

describe('resolveIdentity (research 1 and 2)', () => {
  afterEach(() => { vi.unstubAllGlobals(); invalidateIdentity(); });
  function serve(closetFace: Record<string, unknown>, equipped: Record<string, string | null>, heroPalette: Record<string, string> | null) {
    const json = (b: unknown) => ({ ok: true, json: async () => b });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v1/hero-body')) return json({ body: 'kit-male', frame: null, palette: heroPalette });
      if (url.includes('/api/v1/closet')) return json({ look: { face: closetFace, equipped } });
      return { ok: false, json: async () => null };
    }));
  }
  it('the Athlete Creator\'s colour picks reach the palette, over the garment derivation', async () => {
    serve({}, { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' }, { jersey: '#FF3366' });
    const id = await resolveIdentity(true);
    expect(id.palette).toEqual({ jersey: '#FF3366', shorts: '#00E5FF', shoes: '#A855F7', accent: '#FFD700' });
  });
  it('the Creator doc\'s colours win over both; the face handed on carries no doc', async () => {
    serve({ hairStyle: 'Afro', creator: { v: 1, colours: { jersey: '#00FF00', accent: '#0000FF' } }, creatorSlots: [] }, { tops: 'top_lab' }, { jersey: '#FF3366', shoes: '#111111' });
    const id = await resolveIdentity(true);
    expect(id.palette).toMatchObject({ jersey: '#00FF00', shoes: '#111111', accent: '#0000FF' });
    expect(id.creator?.colours).toEqual({ jersey: '#00FF00', accent: '#0000FF' });
    expect(id.face.hairStyle).toBe('Afro');
    expect('creator' in id.face || 'creatorSlots' in id.face).toBe(false);
  });
  it('the equipped headwear and accessory become the identity\'s accessories', async () => {
    serve({}, { headwear: 'band_flow', accessory: 'acc_sleeve', tops: 'top_lab' }, null);
    expect((await resolveIdentity(true)).accessories).toEqual(['headband', 'armsleeve']);
    invalidateIdentity();
    serve({}, { headwear: null, accessory: null }, null);
    expect((await resolveIdentity(true)).accessories).toEqual([]);
  });
});
