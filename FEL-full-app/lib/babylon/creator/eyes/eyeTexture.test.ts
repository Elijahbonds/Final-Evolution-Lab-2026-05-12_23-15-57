// PROCEDURAL EYES (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a, tool #3): the iris centres are where the real kit's
// eyeballs face forward (measured on both GLBs here), the pixels say what the parameters ask, and through the identity
// pipe the eyes get one texture per body that is redrawn in place, hidden on request and disposed with the body.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, RawTexture, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, Mesh, PBRMaterial, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { EYE_CENTRES, EYE_TEX_SIZE, IRIS_RADIUS, drawEyes, eyeParams, eyeSig, pupilCover } from './eyeTexture';
import { eyeStats, eyeTextureOf, isEyeMesh } from './renderEyes';
import { applyIdentity, type PlayerIdentity } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { defaultFace } from '../../../closet/wearable-catalog';
import { sanitizeCreatorDoc } from '../../../creator/look/sanitize';
import { hairMeshesOf } from '../hair/renderHair';

const S = EYE_TEX_SIZE;
const px = (buf: Uint8Array, u: number, v: number) => { const x = Math.min(S - 1, Math.floor(u * S)), y = Math.min(S - 1, Math.floor(v * S)); const o = (y * S + x) * 4; return [buf[o], buf[o + 1], buf[o + 2]]; };
const P = (over: Parameters<typeof eyeParams>[1] = {}, iris = '#2060FF') => eyeParams(iris, over);

describe('the eye map\'s pixels', () => {
  it('a round pupil is black at the centre, the iris colour around it, the sclera outside, in both eyes', () => {
    const { albedo, emissive } = drawEyes(P());
    expect(emissive).toBeNull();
    for (const [u, v] of EYE_CENTRES) {
      expect(px(albedo, u, v)).toEqual([0, 0, 0]);
      const ring = px(albedo, u + IRIS_RADIUS * 0.6, v);
      expect(ring[2]).toBeGreaterThan(ring[0] * 2);   // blue iris
      const white = px(albedo, u + IRIS_RADIUS * 1.6, v);
      expect(Math.min(...white)).toBeGreaterThan(180);   // the default sclera (#F2EEE8), lightly shaded
    }
  });
  it('the iris size scales the iris; the sclera colour is free', () => {
    const big = drawEyes(P({ size: 1.6 })).albedo, small = drawEyes(P({ size: 0.5, sclera: '#000000' })).albedo;
    const [u, v] = EYE_CENTRES[0];
    expect(px(big, u + IRIS_RADIUS * 1.3, v)[2]).toBeGreaterThan(100);   // inside the big iris
    expect(px(small, u + IRIS_RADIUS * 0.8, v)).toEqual([0, 0, 0]);       // outside the small one: a black sclera
  });
  it('a slit pupil is tall and thin; "none" leaves the iris whole', () => {
    const slit = drawEyes(P({ pupil: 'slit' })).albedo, none = drawEyes(P({ pupil: 'none' })).albedo;
    const [u, v] = EYE_CENTRES[1];
    expect(px(slit, u, v + IRIS_RADIUS * 0.6)).toEqual([0, 0, 0]);         // up the slit (v is up and down the eye)
    expect(px(slit, u + IRIS_RADIUS * 0.4, v)[2]).toBeGreaterThan(60);     // beside it: iris
    expect(px(none, u, v)[2]).toBeGreaterThan(60);
    expect(pupilCover(0, 0, 'none', 0.3, 0.01)).toBe(0);
  });
  it('glow makes an emissive map of the iris alone (the pupil and the sclera never glow)', () => {
    const { emissive } = drawEyes(P({ glow: 1 }));
    const [u, v] = EYE_CENTRES[0];
    expect(px(emissive!, u + IRIS_RADIUS * 0.6, v)[2]).toBeGreaterThan(150);
    expect(px(emissive!, u, v)).toEqual([0, 0, 0]);
    expect(px(emissive!, u + IRIS_RADIUS * 1.6, v)).toEqual([0, 0, 0]);
  });
  it('params clamp, and the signature changes with every parameter', () => {
    expect(eyeParams('nope', { size: 99, glow: -1 })).toEqual({ iris: '#3B2A1A', sclera: '#F2EEE8', size: 1.6, pupil: 'round', pupilSize: 0.33, glow: 0 });
    const base = eyeSig(P());
    for (const o of [{ size: 1.2 }, { sclera: '#000000' }, { pupil: 'slit' as const }, { pupilSize: 0.5 }, { glow: 0.3 }]) expect(eyeSig(P(o))).not.toBe(base);
    expect(eyeSig(P({}, '#FF0000'))).not.toBe(base);
  });
});

// ── the real kit ─────────────────────────────────────────────────────────────────────────────────────────────────────
const kits: Record<'male' | 'female', AssetContainer> = {} as never;
let scene: Scene;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  for (const sex of ['male', 'female'] as const) {
    kits[sex] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${sex}.glb`).toString('base64')}`, scene, undefined, '.glb');
  }
}, 120_000);
let n = 0;
function body(sex: 'male' | 'female' = 'male'): SpawnedCharacter {
  const inst = kits[sex].instantiateModelsToScene((x) => `${x}_e${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `e${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const ID = (eyeColor: string, creator: unknown = null): PlayerIdentity => ({
  proportions: null, face: { ...defaultFace(), eyeColor }, palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null, wardrobe: {}, custom: true, body: 'kit-male', creator: creator ? sanitizeCreatorDoc(creator) : null,
});

describe('the kit\'s eyeballs', () => {
  it('UVs verified: each eyeball\'s forward-facing vertices sit inside the iris drawn for it (both kits)', () => {
    for (const sex of ['male', 'female'] as const) {
      const eyes = body(sex).meshes.find(isEyeMesh) as Mesh;
      expect(eyes, sex).toBeTruthy();
      const nrm = eyes.getVerticesData('normal')!, uv = eyes.getVerticesData('uv')!, pos = eyes.getVerticesData('position')!;
      expect(pos.length / 3).toBe(53);
      // the forward axis: the mean normal of the vertices facing most the same way (both eyes look the same way)
      const fwd = [0, 0, 1];
      for (const side of [-1, 1]) {
        const vs = [...Array(pos.length / 3).keys()].filter((i) => Math.sign(pos[i * 3]) === side);
        const front = vs.filter((i) => nrm[i * 3] * fwd[0] + nrm[i * 3 + 1] * fwd[1] + nrm[i * 3 + 2] * fwd[2] > 0.85);
        expect(front.length, `${sex} ${side}`).toBeGreaterThanOrEqual(2);
        const mu = front.reduce((a, i) => a + uv[i * 2], 0) / front.length, mv = front.reduce((a, i) => a + uv[i * 2 + 1], 0) / front.length;
        const d = Math.min(...EYE_CENTRES.map(([u, v]) => Math.hypot(mu - u, mv - v)));
        expect(d, `${sex} eye ${side}: forward UV (${mu.toFixed(3)}, ${mv.toFixed(3)})`).toBeLessThan(IRIS_RADIUS);
      }
    }
  });
  it('through applyIdentity: one texture per body, redrawn in place on a colour change, nothing new made', () => {
    const s = body();
    applyIdentity(s, ID('#2060FF'));
    const eyes = s.meshes.find(isEyeMesh)!;
    const tex = (eyes.material as PBRMaterial).albedoTexture;
    expect(tex).toBeInstanceOf(RawTexture);
    expect(tex).toBe(eyeTextureOf(s.root));
    const mats = scene.materials.length, texs = scene.textures.length;
    applyIdentity(s, ID('#20FF60'));
    applyIdentity(s, ID('#20FF60'));
    expect((eyes.material as PBRMaterial).albedoTexture).toBe(tex);
    expect(scene.materials.length).toBe(mats);
    expect(scene.textures.length).toBe(texs);
    expect(eyeStats(s.root)).toMatchObject({ textures: 1, clones: 1, hidden: 0 });
  });
  it('glow adds the emissive map only while it glows', () => {
    const s = body();
    applyIdentity(s, ID('#7FD8FF', { v: 1, eyes: { glow: 0.9 } }));
    const m = s.meshes.find(isEyeMesh)!.material as PBRMaterial;
    expect(m.emissiveTexture).toBeInstanceOf(RawTexture);
    expect(eyeStats(s.root)!.textures).toBe(2);
    applyIdentity(s, ID('#7FD8FF'));
    expect(m.emissiveTexture).toBeNull();
    expect(eyeStats(s.root)!.textures).toBe(1);
  });
  it('hide eyes (or the whole head) hides the eyeballs and shows them again after; nothing pickable changes', () => {
    const s = body();
    const eyes = s.meshes.find(isEyeMesh)!;
    const pick = s.meshes.map((m) => m.isPickable);
    applyIdentity(s, ID('#2060FF', { v: 1, flags: { hide: { eyes: true } } }));
    expect(eyes.isVisible).toBe(false);
    applyIdentity(s, ID('#2060FF'));
    expect(eyes.isVisible).toBe(true);
    applyIdentity(s, ID('#2060FF', { v: 1, flags: { hide: { head: true } } }));
    expect(eyes.isVisible).toBe(false);
    expect(s.meshes.map((m) => m.isPickable)).toEqual(pick);
  });
  it('hide hair takes every hair node off, whatever the style', () => {
    const s = body();
    // test changed (2026-10-07, the hair expansion): on the kit body the hair is the code-built mesh and the baked Hair_*
    // nodes stay hidden — "the hair" is a visible baked node or a built hair mesh
    const hair = () => s.meshes.filter((m) => /^Hair_/.test(m.name) && m.isVisible && m.isEnabled()).length + hairMeshesOf(s.root).length;
    applyIdentity(s, { ...ID('#2060FF', { v: 1, flags: { hide: { hair: true } } }), face: { ...defaultFace(), hairStyle: 'Afro' } });
    expect(hair()).toBe(0);
    applyIdentity(s, { ...ID('#2060FF'), face: { ...defaultFace(), hairStyle: 'Afro' } });
    expect(hair()).toBeGreaterThan(0);
  });
  it('everything the eyes made goes with the body', () => {
    const s = body();
    applyIdentity(s, ID('#2060FF', { v: 1, eyes: { glow: 0.5 } }));
    const tex = eyeTextureOf(s.root)!;
    const mat = s.meshes.find(isEyeMesh)!.material!;
    s.root.dispose();
    expect(scene.textures.includes(tex)).toBe(false);
    expect(scene.materials.includes(mat)).toBe(false);
    expect(eyeStats(s.root)).toBeNull();
  });
});
