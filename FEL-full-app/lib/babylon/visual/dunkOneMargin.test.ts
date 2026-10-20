// FDB-3 (PM, 2026-10-17): margin under the 8 MB dunk-1 budget from two assets the phone loads before dunk 1.
//
//   models/skins/detail-normal-1024.jpg            118,202 → 87,185 B: the phone tier's skin detail normal, re-encoded in place
//     (PM pick: mozjpeg q85, same 1024², 4:2:0, progressive — 43.1 dB vs the old map, normal error p99 4.05° before its 0.45
//     strength; the slam-cam close-up old vs new is ~/Claude/outbox/FDB-3-slamcam-old-vs-new.png).
//   models/props/venice/env2/palm_hero_lod1.glb   130,448 → 84,112 B: lossless — the file minus its copy of the far frond atlas,
//     which is byte-identical to the one palm_hero_lod2.glb carries and loads beside it (veniceBoardwalk.shareFarFrondMaterial).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, SceneLoader, type Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { shareFarFrondMaterial } from '../nexus/veniceBoardwalk';
import { VENICE_ENV2_DIR } from './venuePropSets';
import { skinMapUrl } from '../core/playerIdentity';
import { SKIN_DETAIL_NORMAL } from '../core/skinLibrary';

const ROOT = path.resolve(__dirname, '../../..');
const pub = (url: string) => path.join(ROOT, 'public', url);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
interface Gltf { images: { name: string; bufferView: number }[]; bufferViews: { byteOffset?: number; byteLength: number }[]; materials: { name: string; pbrMetallicRoughness?: { baseColorTexture?: unknown }; extras?: Record<string, string>; [k: string]: unknown }[] }
function glb(url: string): { json: Gltf; bin: Buffer } {
  const b = readFileSync(pub(url)); const jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + jl).toString('utf8')) as Gltf, bin: b.subarray(20 + jl + 8) };
}
const view = (g: { json: Gltf; bin: Buffer }, i: number) => { const v = g.json.bufferViews[i]; return g.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };

describe('the phone skin detail normal: re-encoded in place (q85), same size, same path', () => {
  const file = readFileSync(pub('/models/skins/detail-normal-1024.jpg'));
  it('is the q85 file: 87,185 B, sha256 4461c77a…', () => {
    expect(file.length).toBe(87_185);
    expect(sha(file)).toBe('4461c77a918ee84b0dc1b73c5d4273e88dfe2ee74fc67fdae80169298a2e52af');
  });
  it('still a progressive 1024² JPEG, 4:2:0, three components (read off its SOF2)', () => {
    let at = 2, sof: Buffer | null = null;
    while (at < file.length - 4 && !sof) {
      const marker = file.readUInt16BE(at), len = file.readUInt16BE(at + 2);
      if (marker === 0xffc2) sof = file.subarray(at + 4, at + 2 + len);
      at += 2 + len;
    }
    expect(sof).not.toBeNull();
    const s = sof!;
    expect([s.readUInt16BE(1), s.readUInt16BE(3), s[5]]).toEqual([1024, 1024, 3]);        // height, width, components
    expect([s[7], s[10], s[13]]).toEqual([0x22, 0x11, 0x11]);                             // Y 2×2, Cb/Cr 1×1: 4:2:0
  });
  it('the phone still asks for it by the same name; the desktop 2048² map is untouched', () => {
    expect(skinMapUrl(SKIN_DETAIL_NORMAL, 'mobile')).toBe('/models/skins/detail-normal-1024.jpg');
    expect(sha(readFileSync(pub('/models/skins/detail-normal.jpg')))).toBe('a0db3a049b287ea8fec8a2c7c3f0ef6fad89d6cb833a79cf1a31023047431fb4');
  });
});

describe('palm LOD1 without its duplicate far atlas (lossless)', () => {
  const lod1 = glb(`${VENICE_ENV2_DIR}palm_hero_lod1.glb`), lod2 = glb(`${VENICE_ENV2_DIR}palm_hero_lod2.glb`);
  it('is the FDB-3 file (84,112 B, sha256 4868821b…): the trunk maps only, and every remaining byte is the drop\'s', () => {
    const raw = readFileSync(pub(`${VENICE_ENV2_DIR}palm_hero_lod1.glb`));
    expect(raw.length).toBe(84_112);
    expect(sha(raw)).toBe('4868821bbb2cb2af6665d5cb4e80f775b03fbf37b1e7ce17c850a99fe002dfae');
    expect(lod1.json.images.map((i) => i.name)).toEqual(['palm_trunk_normal_half', 'palm_trunk_albedo_half']);
    // the drop's five other views (geometry, both trunk maps), in order — hashed from d9acd04d… minus palm_frond_atlas_far
    const h = createHash('sha256'); lod1.json.bufferViews.forEach((_, i) => h.update(view(lod1, i)));
    expect(lod1.json.bufferViews).toHaveLength(5);
    expect(h.digest('hex')).toBe('f3df551333083fdf52fb543b87c718210bdacba16935e9ceabfda4b7e39ee30d');
  });
  it('LOD2 carries the far atlas (46,270 B, d1db8a5b…) and a frond material that is LOD1\'s but for the atlas it points at', () => {
    const atlas = lod2.json.images.findIndex((i) => i.name === 'palm_frond_atlas_far');
    expect(sha(view(lod2, lod2.json.images[atlas].bufferView))).toBe('d1db8a5b321f16c84f6eba3528a3099b7a5d3596ae0347540fd8c3cf8d599b53');
    const bare = (m: Gltf['materials'][number]) => { const c = JSON.parse(JSON.stringify(m)); delete c.extras; delete c.pbrMetallicRoughness?.baseColorTexture; return c; };
    const f1 = lod1.json.materials.find((m) => m.name === 'palm_frond')!, f2 = lod2.json.materials.find((m) => m.name === 'palm_frond')!;
    expect(f1.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
    expect(f1.extras?.felFrondAtlas).toMatch(/^palm_hero_lod2\.glb palm_frond_atlas_far/);
    expect(bare(f1)).toEqual(bare(f2));
  });
  it('shareFarFrondMaterial: LOD1\'s fronds wear LOD2\'s textured frond material, and its own bare one is freed', async () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      const load = (f: string) => SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync(pub(`${VENICE_ENV2_DIR}${f}`)).toString('base64'), scene, undefined, '.glb');
      const [r1, r2] = [await load('palm_hero_lod1.glb'), await load('palm_hero_lod2.glb')];
      const frond = (r: typeof r1) => r.meshes.find((m) => m.material?.name === 'palm_frond') as Mesh;
      const m1 = frond(r1), m2 = frond(r2), own = m1.material!;
      shareFarFrondMaterial(m1, m2);
      expect(m1.material).toBe(m2.material);
      expect((m2.material as unknown as { albedoTexture: unknown }).albedoTexture).toBeTruthy();
      expect(scene.materials.includes(own)).toBe(false);   // disposed: out of the scene's list
      shareFarFrondMaterial(m1, m2);   // idempotent
      expect(m1.material).toBe(m2.material);
    } finally { scene.dispose(); engine.dispose(); }
  });
  it('the dunk dressing shares it before it builds the LOD chain', () => {
    const src = readFileSync(path.join(ROOT, 'lib/babylon/nexus/veniceBoardwalk.ts'), 'utf8');
    const mount = src.slice(src.indexOf('export async function mountVeniceDunkDressing('));
    const share = mount.indexOf('shareFarFrondMaterial(fronds[1] as Mesh, fronds[2] as Mesh);');
    expect(share).toBeGreaterThan(0);
    expect(mount.indexOf('m0.addLODLevel(')).toBeGreaterThan(share);
  });
});
