// FDB-2 (2026-10-17): the dunk-1 models 3D Art shrank, and the decoder the Draco hoop needs, from our own server.
//
//   hoop.glb          3,929,424 → 915,584 bytes: Draco (position 16-bit, normal int8, UV uint16; the JSON is the shrunk file's)
//   fel-kit-male.glb  3,725,748 → 3,568,268 bytes: 7 of 15 WebP maps re-encoded; every geometry, skin and morph byte unchanged
//
// Babylon's default Draco decoder is fetched from cdn.babylonjs.com. meshyProps points it at public/loaders/draco instead, and
// these hold that, and that the files decode with that decoder to the same hoop and the same body.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DracoDecoder, NullEngine, Scene, SceneLoader, VertexBuffer } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { DRACO_DECODER_URLS, MESHY_PROP_URL, dracoWorkerCount } from './meshyProps';
import { DUNK_RIVALS } from '../core/DunkRivals';
import { MODE_CAST, rosterBodyUrl } from '../core/athleteRoster';
import { urlForHeroBody } from '../core/heroBody';

const ROOT = path.resolve(__dirname, '../../..');
const pub = (url: string) => path.join(ROOT, 'public', url.split('?')[0]);
/** What meshyProps set at import, before anything below swaps in a Node-loadable decoder. */
const SHIPPED = { ...DracoDecoder.DefaultConfiguration };

interface Gltf { extensionsUsed?: string[]; extensionsRequired?: string[]; accessors: { componentType: number; normalized?: boolean; type: string; count: number }[]; bufferViews: { byteOffset?: number; byteLength: number }[]; images?: { bufferView?: number }[]; meshes: { primitives: { attributes: Record<string, number>; extensions?: Record<string, unknown> }[] }[]; [k: string]: unknown }
function glb(url: string): { json: Gltf; bin: Buffer } {
  const b = readFileSync(pub(url));
  expect(b.readUInt32LE(0), `${url} is a GLB`).toBe(0x46546c67);
  const jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + jl).toString('utf8')) as Gltf, bin: b.subarray(20 + jl + 8) };
}

describe('the Draco decoder is ours, never the CDN', () => {
  it('importing meshyProps points Babylon at public/loaders/draco: all three files exist, and no URL leaves this site', () => {
    expect(SHIPPED.wasmUrl).toBe('/loaders/draco/draco_wasm_wrapper.js');
    expect(SHIPPED.wasmBinaryUrl).toBe('/loaders/draco/draco_decoder.wasm');
    expect(SHIPPED.fallbackUrl).toBe('/loaders/draco/draco_decoder.js');
    for (const url of Object.values(DRACO_DECODER_URLS)) expect(existsSync(pub(url)), url).toBe(true);
    expect(JSON.stringify(SHIPPED)).not.toMatch(/babylonjs\.com|https?:/);
  });
  it('always at least one worker (Babylon applies the accessors\' normalized flag only there), else its own default', () => {
    expect(SHIPPED.numWorkers).toBeGreaterThanOrEqual(1);
    expect([1, 2, 3, 4, 8, 16].map(dracoWorkerCount)).toEqual([1, 1, 1, 2, 4, 4]);   // Babylon's: floor(cores / 2), at most 4 — 0 for one core
    expect(dracoWorkerCount(undefined)).toBe(1);
    expect(dracoWorkerCount(Number.NaN)).toBe(1);
  });
});

describe('hoop.glb is the Draco hoop, and it decodes to the same hoop', () => {
  const url = MESHY_PROP_URL('hoop');
  it('is 3D Art\'s file (sha256 4b74e6d3…) and needs Draco and quantization only', () => {
    expect(createHash('sha256').update(readFileSync(pub(url))).digest('hex')).toBe('4b74e6d3702b23fc28d31ddbafa6515d6c9480929ff9785113287afc74f26d0d');
    const { json } = glb(url);
    expect([...(json.extensionsRequired ?? [])].sort()).toEqual(['KHR_draco_mesh_compression', 'KHR_mesh_quantization']);
    const prim = json.meshes[0].primitives[0];
    expect(prim.extensions?.KHR_draco_mesh_compression).toBeTruthy();
    const acc = (name: string) => json.accessors[prim.attributes[name]];
    expect(acc('NORMAL')).toMatchObject({ componentType: 5120, normalized: true, type: 'VEC3' });       // int8, normalized
    expect(acc('TEXCOORD_0')).toMatchObject({ componentType: 5123, normalized: true, type: 'VEC2' });   // uint16, normalized
  });

  it('decodes with the repo\'s own wrapper and wasm: 97,233 triangles, the original\'s bounds, unit normals and UVs in [0, 1]', async () => {
    // Node has no Worker, so Babylon decodes in-thread here, from the same two files a browser fetches from /loaders/draco
    const require = createRequire(import.meta.url);
    DracoDecoder.DefaultConfiguration = {
      ...DRACO_DECODER_URLS, numWorkers: 0,
      jsModule: require(pub(DRACO_DECODER_URLS.wasmUrl)), wasmBinary: readFileSync(pub(DRACO_DECODER_URLS.wasmBinaryUrl)),
    };
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      const c = await SceneLoader.LoadAssetContainerAsync('', 'data:model/gltf-binary;base64,' + readFileSync(pub(url)).toString('base64'), scene, undefined, '.glb');
      const meshes = c.meshes.filter((m) => m.getTotalVertices() > 0);
      expect(meshes.map((m) => m.name)).toEqual(['Mesh_0']);   // HoopJuice and dressHoop read this one mesh
      const m = meshes[0];
      expect(m.material?.name).toBe('Material.001');
      expect(c.textures.length).toBe(2);
      expect(m.getTotalIndices() / 3).toBe(97_233);
      expect(m.getTotalVertices()).toBe(75_253);   // welded by the encoder (77,417 before)
      // the original float hoop's bounds (measured on 772a4138 the same way): Draco's 16-bit positions sit within 0.1 mm
      m.refreshBoundingInfo();
      const bb = m.getBoundingInfo().boundingBox;
      const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i]), `${a} vs ${b}`).toBeLessThan(1e-4));
      near(bb.minimum.asArray(), [-1.0838, -0.00002, -0.8031]);
      near(bb.maximum.asArray(), [1.08381, 3.94997, 0.80314]);
      // the integers, read the way the accessors say (normalized): unit normals, UVs inside [0, 1]
      const nb = m.getVertexBuffer(VertexBuffer.NormalKind)!; const ub = m.getVertexBuffer(VertexBuffer.UVKind)!;
      const n = nb.getData() as Int8Array; const uv = ub.getData() as Uint16Array;
      expect(n).toBeInstanceOf(Int8Array); expect(uv).toBeInstanceOf(Uint16Array);
      let worstLen = 0;
      for (let i = 0; i < n.length; i += 3) worstLen = Math.max(worstLen, Math.abs(Math.hypot(Math.max(n[i] / 127, -1), Math.max(n[i + 1] / 127, -1), Math.max(n[i + 2] / 127, -1)) - 1));
      expect(worstLen).toBeLessThan(0.02);
      let uvMax = 0; for (const v of uv) uvMax = Math.max(uvMax, v);
      expect(uvMax / 65535).toBeLessThanOrEqual(1);
      expect(uvMax / 65535).toBeGreaterThan(0.9);   // the atlas reaches its far edge, as the float UVs did (max 1.0)
      // WHY THE WORKER FLOOR (meshyProps): in-thread, Babylon 9.23 keeps Draco's own flag (false) instead of the accessor's
      // (true), so the GPU would read UVs of 0–65535. If this starts failing, Babylon applies the accessor's flag in-thread
      // now and the floor in dracoWorkerCount is no longer needed for this file.
      expect([nb.normalized, ub.normalized]).toEqual([false, false]);
    } finally {
      scene.dispose(); engine.dispose();
      DracoDecoder.DefaultConfiguration = SHIPPED;
    }
  });
});

describe('fel-kit-male.glb is the shrunk kit: new textures, the same body', () => {
  it('is 3D Art\'s file (sha256 e4791bbf…); its JSON and all 23 geometry, skin and morph views are byte-identical to c9468a40', () => {
    const KIT = urlForHeroBody('kit-male');   // the guest's own body on /try
    expect(KIT).toBe('/models/candidates/fel-kit-male.glb');
    expect(createHash('sha256').update(readFileSync(pub(KIT))).digest('hex')).toBe('e4791bbf7c2f219d3b4be0053fd6aa6e00ce54191e7d57e0a054cb57ad0344fb');
    const { json, bin } = glb(KIT);
    const images = new Set((json.images ?? []).map((i) => i.bufferView));
    expect(images.size).toBe(15);   // the image order phoneTextureCap's #image7 reads is the source's
    const h = createHash('sha256'); let views = 0;
    json.bufferViews.forEach((v, i) => { if (images.has(i)) return; views++; h.update(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)); });
    expect(views).toBe(23);
    // pinned from the kit shipped before FDB-2 (blob c9468a40): the same two hashes over the same views and the same JSON
    expect(h.digest('hex')).toBe('a360d96f08a75cccf412e7ff18c56002bad7286dc47347c8ad695e7ff2e83a70');
    const { bufferViews: _v, buffers: _b, ...rest } = json;
    expect(createHash('sha256').update(JSON.stringify(rest)).digest('hex')).toBe('9590adb833c3844ce66963fef0c47c17810dbb54b8ed05a294117322f09c10ed');
    expect([...(json.extensionsRequired ?? [])].sort()).toEqual(['EXT_texture_webp', 'KHR_mesh_quantization']);
  });
});

describe('nothing the dunk loads asks Babylon for a decoder from its CDN', () => {
  // every GLB a /try dunk session requested (FDB-2 capture, prod build: dunk 1 and the contest set after it), plus every body
  // a rival or an onlooker of the dunk can wear on another night
  const MEASURED = [
    '/models/meshy/hoop.glb', '/models/props/venice/env2/palm_hero_lod0.glb', '/models/props/venice/env2/palm_hero_lod1.glb', '/models/props/venice/env2/palm_hero_lod2.glb',
    '/models/props/venice/env2/venice_boardwalk_kit.glb', '/models/props/venice/env2/venice_crowd_cards.glb', '/models/candidates/fel-kit-male.glb', '/models/meshy/ball-basketball.glb',
    '/models/props/racing/lightPostModern.glb', '/models/props/racing/tent.glb', '/models/props/racing/flagRed.glb', '/models/props/racing/flagGreen.glb', '/models/meshy/hoopbus.glb',
    '/models/meshy/sedan.glb', '/models/props/venice/pier_far.glb', '/models/props/venice/sail_billboard_0.glb', '/models/props/venice/sail_billboard_1.glb',
  ];
  const bodies = [...DUNK_RIVALS.map((r) => r.body), ...MODE_CAST.dunk].map((k) => rosterBodyUrl(k)).filter((u): u is string => !!u);
  const urls = [...new Set([...MEASURED, ...bodies])];
  it('meshopt and KTX2/Basis (no local decoder: Babylon would fetch one from cdn.babylonjs.com) are used by none; Draco only by the hoop', () => {
    expect(bodies.length).toBeGreaterThanOrEqual(DUNK_RIVALS.length);
    const draco: string[] = [];
    for (const url of urls) {
      const used = glb(url).json.extensionsUsed ?? [];
      expect(used.filter((e) => /meshopt|basisu|KHR_texture_basisu|EXT_meshopt/i.test(e)), url).toEqual([]);
      if (used.includes('KHR_draco_mesh_compression')) draco.push(url);
    }
    expect(draco).toEqual(['/models/meshy/hoop.glb']);   // and meshyProps sets the decoder before the hoop loads
  });
});
