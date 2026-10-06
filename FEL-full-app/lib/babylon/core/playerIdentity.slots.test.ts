// The identity pipe with SLOTS (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a): every mode builds the player from the
// active slot; a teen's look comes from the device in every mode (owner decision 2026-10-06) with nothing sent; a slot
// body of 'scan' is honoured only when the server says the account owns one; and a far-from-human skin colour reads clean.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Color3, FreeCamera, NullEngine, RawTexture, Scene, SceneLoader, Texture, Vector3 } from '@babylonjs/core';
import type { AssetContainer, PBRMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  FANTASY_GREY_MEAN, applyIdentity, fantasySkinColour, greyFromRGBA, identityFrom, invalidateIdentity, isFantasyTone,
  resolveIdentity, skinFor, type PlayerIdentity,
} from './playerIdentity';
import type { SpawnedCharacter } from './CharacterLibrary';
import { SKIN_TONES, defaultFace, defaultJersey } from '../../closet/wearable-catalog';
import { emptyCreatorDoc, type CreatorSlotV2 } from '../../creator/look/doc';
import { LOCAL_LOOK_KEY } from '../../creator/localLook';

const slot = (id: string, over: Partial<CreatorSlotV2> = {}): CreatorSlotV2 => ({
  id, label: id.toUpperCase(), body: 'male', base: { skinTone: '#8D5524', hairStyle: 'Afro' }, doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF0000' } }, ...over,
});

describe('fantasy skin: a colour far from any human tone', () => {
  it('every catalog skin tone is human (the photographed map, tinted by ratio, as before)', () => {
    for (const t of SKIN_TONES) {
      const c = Color3.FromHexString(t);
      expect(isFantasyTone(c, skinFor(c)!.meanRGB), t).toBe(false);
    }
  });
  it('green, blue, white, grey, purple and yellow are not', () => {
    for (const t of ['#4CAF50', '#2060FF', '#FFFFFF', '#D8D6CF', '#7A2BBF', '#FFD800', '#0B0B0B']) {
      const c = Color3.FromHexString(t);
      expect(isFantasyTone(c, skinFor(c)!.meanRGB), t).toBe(true);
    }
  });
  it('the grey map is the luminance re-centred on its mean; the colour over it keeps the hue exactly', () => {
    const src = new Uint8Array([200, 150, 120, 255, 160, 120, 96, 255]);
    const g = greyFromRGBA(src);
    expect(g[0]).toBe(g[1]); expect(g[1]).toBe(g[2]);
    expect((g[0] + g[4]) / 2).toBeCloseTo(FANTASY_GREY_MEAN * 255, -1);
    expect(g[0]).toBeGreaterThan(g[4]);   // the detail survives
    const c = fantasySkinColour(Color3.FromHexString('#2060FF'));
    expect(c.b).toBeGreaterThan(c.g); expect(c.g).toBeGreaterThan(c.r);
    expect(Math.max(c.r, c.g, c.b)).toBeLessThanOrEqual(1.25 + 1e-9);
    const w = fantasySkinColour(Color3.White());
    expect(w.r).toBeCloseTo(w.g, 9); expect(w.g).toBeCloseTo(w.b, 9);
  });
});

let scene: Scene;
let kit: AssetContainer;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  kit = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
}, 120_000);
let n = 0;
function body(): SpawnedCharacter {
  const inst = kit.instantiateModelsToScene((x) => `${x}_s${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `s${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const ID = (skinTone: string): PlayerIdentity => ({
  proportions: null, face: { ...defaultFace(), skinTone }, palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null, wardrobe: {}, custom: true, body: 'kit-male',
});

describe('fantasy skin on the real kit', () => {
  it('a green skin wears the grey map times green; a human skin keeps the photographed map', () => {
    const s = body();
    const skinMat = () => s.meshes.find((m) => /skin/i.test(m.material?.name ?? ''))!.material as PBRMaterial;
    applyIdentity(s, ID('#4CAF50'));
    expect(skinMat().albedoTexture).toBeInstanceOf(RawTexture);
    expect(skinMat().albedoTexture!.name).toMatch(/^fel_skin_grey_/);
    const c = skinMat().albedoColor;
    expect(c.g).toBeGreaterThan(c.r * 2);
    applyIdentity(s, ID(SKIN_TONES[4]));
    expect(skinMat().albedoTexture).not.toBeInstanceOf(RawTexture);
    expect(skinMat().albedoTexture).toBeInstanceOf(Texture);
    // the grey map is made once per (scene, map) and shared
    const t1 = (applyIdentity(s, ID('#2060FF')), skinMat().albedoTexture);
    const s2 = body(); applyIdentity(s2, ID('#3070EE'));
    expect((s2.meshes.find((m) => /skin/i.test(m.material?.name ?? ''))!.material as PBRMaterial).albedoTexture).toBe(t1);
  });
});

describe('resolveIdentity builds the player from the active slot', () => {
  const closetFace = { ...defaultFace(), skinTone: '#FBE7D3', creatorSlots: [slot('s1'), slot('s2', { body: 'female', base: { skinTone: '#22CC44', eyeColor: '#7FD8FF' }, frame: { heightScale: 1.03, buildScale: 1.05 }, equipped: { tops: 'top_lab', headwear: 'cap_nexus' }, doc: { ...emptyCreatorDoc(), colours: { jersey: '#123456' } } })], activeSlot: 's2' };
  it('face, doc, worn items and frame are the active slot\'s; the body is the server\'s answer', () => {
    const id = identityFrom({ look: { face: closetFace, equipped: { tops: null } } }, { body: 'kit-female', frame: { heightScale: 100, buildScale: 100, bodyType: 'female' }, scanOwned: false }, null);
    expect(id.face.skinTone).toBe('#22CC44');
    expect(id.face.eyeColor).toBe('#7FD8FF');
    expect(id.creator?.colours).toEqual({ jersey: '#123456' });
    expect(id.palette.jersey).toBe('#123456');
    expect(id.wardrobe.tops).toBe('top_lab');
    expect(id.wornParts?.length).toBe(1);   // the Nexus Visor the slot wears
    expect(id.proportions?.heightScale).toBeCloseTo(1.03, 6);
    expect(id.proportions?.buildScale).toBeCloseTo(1.05, 6);
    expect(id.body).toBe('kit-female');
    expect(id.lookFromDevice).toBeUndefined();
  });
  it('a look with no slots is read exactly as before (the top level)', () => {
    const id = identityFrom({ look: { face: { ...defaultFace(), hairStyle: 'Locs', creator: { v: 1, colours: { shoes: '#00FF00' } } }, equipped: { tops: 'top_lab' } } }, { body: 'kit-male', frame: null }, null);
    expect(id.face.hairStyle).toBe('Locs');
    expect(id.creator?.colours).toEqual({ shoes: '#00FF00' });
    expect(id.wardrobe.tops).toBe('top_lab');
    expect(id.proportions).toBeNull();
  });
});

describe('teens: the device look in every mode (owner decision 2026-10-06), nothing sent', () => {
  type Call = { url: string; method: string; hasBody: boolean };
  let calls: Call[] = [];
  let store: Map<string, string>;
  let reads = 0;
  const real = globalThis.fetch;
  const install = (closet: unknown, heroBody: unknown) => {
    calls = []; store = new Map(); reads = 0;
    (globalThis as Record<string, unknown>).window = { localStorage: { getItem: (k: string) => { reads++; return store.get(k) ?? null; }, setItem: (k: string, v: string) => { store.set(k, v); } } };
    (globalThis as Record<string, unknown>).fetch = async (url: unknown, init?: { method?: string; body?: unknown }) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', hasBody: init?.body != null });
      const u = String(url);
      const payload = u.includes('/api/v1/closet') ? closet : u.includes('/api/v1/hero-body') ? heroBody : null;
      return { ok: payload != null, json: async () => payload } as Response;
    };
    invalidateIdentity();
  };
  afterEach(() => { (globalThis as Record<string, unknown>).fetch = real; delete (globalThis as Record<string, unknown>).window; invalidateIdentity(); });
  const device = { face: { ...defaultFace(), creatorSlots: [slot('s1'), slot('s2', { body: 'female', base: { skinTone: '#2060FF', hairStyle: 'Bun' }, equipped: { tops: 'top_lab' } })], activeSlot: 's2' }, jersey: { number: 7, name: 'KID' } };

  it('a minor\'s hero is the device\'s active slot — and the whole path is two GETs with no body', async () => {
    install({ look: { face: defaultFace(), equipped: {}, jersey: defaultJersey() }, lookLocal: true }, { body: 'kit-male', frame: null, scanOwned: false });
    store.set(LOCAL_LOOK_KEY, JSON.stringify(device));
    const id = await resolveIdentity();
    expect(id.face.skinTone).toBe('#2060FF');
    expect(id.face.hairStyle).toBe('Bun');
    expect(id.body).toBe('kit-female');
    expect(id.wardrobe.tops).toBe('top_lab');
    expect(id.jersey?.name).toBe('KID');
    expect(id.lookFromDevice).toBe(true);
    expect(calls.map((c) => c.url).sort()).toEqual(['/api/v1/closet?for=spawn', '/api/v1/hero-body']);
    for (const c of calls) { expect(c.method).toBe('GET'); expect(c.hasBody).toBe(false); }
  });
  it('a device slot asking for the scan body gets the kit body unless the server says this account owns one', async () => {
    const scanDevice = { face: { creatorSlots: [slot('s1', { body: 'scan' })], activeSlot: 's1' } };
    install({ look: { face: defaultFace(), equipped: {} }, lookLocal: true }, { body: 'kit-male', frame: null, scanOwned: false });
    store.set(LOCAL_LOOK_KEY, JSON.stringify(scanDevice));
    expect((await resolveIdentity()).body).toBe('kit-male');
  });
  it('an adult\'s identity is the server\'s, whatever the device holds', async () => {
    install({ look: { face: { ...defaultFace(), hairStyle: 'Fade' }, equipped: {} }, lookLocal: false }, { body: 'kit-male', frame: null });
    store.set(LOCAL_LOOK_KEY, JSON.stringify(device));
    const id = await resolveIdentity();
    expect(id.face.hairStyle).toBe('Fade');
    expect(id.lookFromDevice).toBeUndefined();
    expect(reads).toBe(0);   // an adult's device copy is not even read
    // and identityFrom itself refuses a device look for a player the server did not mark lookLocal
    const forced = identityFrom({ look: { face: { ...defaultFace(), hairStyle: 'Fade' }, equipped: {} }, lookLocal: false }, { body: 'kit-male', frame: null }, device as never);
    expect(forced.face.hairStyle).toBe('Fade');
    expect(forced.lookFromDevice).toBeUndefined();
  });
  it('a minor with nothing on the device wears the row\'s catalog defaults', async () => {
    install({ look: { face: defaultFace(), equipped: {} }, lookLocal: true }, { body: 'kit-male', frame: null });
    const id = await resolveIdentity();
    expect(id.face).toEqual(defaultFace());
    expect(id.lookFromDevice).toBeUndefined();
  });
});
