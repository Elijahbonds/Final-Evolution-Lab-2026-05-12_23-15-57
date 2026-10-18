// FDB-2 / FDB-4 (2026-10-17): the dunk-1 models 3D Art shrank, and the decoder the Draco files need, from our own server.
//
//   hoop.glb            3,929,424 → 915,584 (FDB-2: Draco, int8 normals / uint16 UVs) → 893,740 bytes (FDB-4: Draco, float attributes)
//   ball-basketball.glb   874,092 → 280,832 bytes (FDB-4: Draco, float attributes)
//   palm_hero_lod0.glb    464,320 → 375,460 bytes (FDB-4: Draco, float attributes)
//   fel-kit-male.glb    3,725,748 → 3,568,268 bytes (FDB-2): 7 of 15 WebP maps re-encoded; every geometry, skin and morph byte unchanged
//
// Babylon's default Draco decoder is fetched from cdn.babylonjs.com. meshyProps points it at public/loaders/draco instead, and
// these hold that, and that the files decode with that decoder to the same hoop, ball, palm and body.
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

/**
 * THE DRACO FILES (FDB-4, 3D Art, 2026-10-17: draco3dgltf 1.5.7 via gltf-transform 4.5.0; float attributes, so they decode the same
 * on Babylon's worker and in-thread paths). Each pin is exact, and each one that moved says why. The decoded shapes are held to
 * the files they replaced, measured the same way (repo decoder, in-thread, refreshBoundingInfo).
 */
const DRACO_FILES = [
  {
    url: MESHY_PROP_URL('hoop'), bytes: 893_740,
    // PIN MOVED (FDB-4) from FDB-2's 4b74e6d3702b23fc28d31ddbafa6515d6c9480929ff9785113287afc74f26d0d (int8 normals / uint16 UVs, which
    // only Babylon's worker path normalizes) to 3D Art's float-attribute Draco hoop: 21,844 B smaller and path-independent.
    sha: 'd727583d222aa17a26e265ca68c5e6e097f93cc44e857ea160549e3dc654ab83',
    required: ['KHR_draco_mesh_compression'], textures: 2,
    // images (both JPEGs) and asset/scene/nodes/materials/textures/samplers byte-identical to the FDB-2 hoop (and its 772a4138 source)
    imgSha: '9d29d023788d99e7845607ce76a46ae19ead57a3e753b60c4479e5320843083f', jsonSha: 'd299265109bd61eff6f7980d0b663921bfcd58fd79b76e454abd98b68e41f32e',
    // HoopJuice and dressHoop read this one mesh; bounds: the original float hoop 772a4138's
    meshes: [{ name: 'Mesh_0', material: 'Material.001', verts: 77_699, tris: 97_233, min: [-1.0838, -0.00002, -0.8031], max: [1.08381, 3.94997, 0.80314], uv: [[0.00003, 0.99995], [0.00001, 1]] }],
  },
  {
    url: MESHY_PROP_URL('ball-basketball'), bytes: 280_832,
    // NEW PIN (FDB-4): the ball was the shipped float GLB (sha 72daee0d…, 874,092 B); now 3D Art's Draco ball, 593,260 B smaller
    sha: '655a86bfc898e6d87411bb7e3f6702d70076cf13b4dbb57ef0cf15da0e08e039',
    required: ['KHR_draco_mesh_compression'], textures: 1,
    imgSha: '62cc30aad9e97f1647c81751f1b3ae311e1284740da0950964bca831fc74295d', jsonSha: 'dcd7623bed644154ddb7cf81389e23e1e28c4404600ea601a90fdfb96c0d055e',
    meshes: [{ name: 'Mesh_0', material: 'Material.001', verts: 20_246, tris: 20_957, min: [-0.12006, -0.12, -0.11999], max: [0.12012, 0.1201, 0.12013], uv: [[0.00002, 0.99951], [0.00365, 1]] }],
  },
  {
    url: '/models/props/venice/env2/palm_hero_lod0.glb', bytes: 375_460,
    // NEW PIN here (FDB-4); venuePropSets.test's drop pin moved with it (03109df7… → 70e7e4b7…): 3D Art's Draco LOD0, 88,860 B smaller
    sha: '70e7e4b78b09d56445fe456080275cc1db732b982c9bc5047a87be944fabd4d8',
    required: ['EXT_texture_webp', 'KHR_draco_mesh_compression'], textures: 3,
    imgSha: '36d29a3d070e4acd7b1786ccdcdfeb91cfe9d2dc71635b9b143fe5afee7945b7', jsonSha: 'd5eefbf4cdfdefab8dd74d63e368e991c3c8fc0d57adb3d3963348af3d979519',
    // veniceBoardwalk finds the trunk and the frond by material name; bounds: the 4beb7e90 drop's LOD0
    meshes: [
      { name: 'palm_hero_lod0_primitive0', material: 'palm_trunk', verts: 703, tris: 1296, min: [-0.27545, -0.01245, -0.26506], max: [0.80183, 7.38238, 0.27684], uv: [[0, 1], [-1.94, 1.02]] },
      { name: 'palm_hero_lod0_primitive1', material: 'palm_frond', verts: 1703, tris: 2552, min: [-2.4288, 4.70169, -2.99639], max: [3.92126, 9.97599, 3.07077], uv: [[0.01221, 1], [0, 1]] },
    ],
  },
] as const;

describe.each(DRACO_FILES)('$url is 3D Art\'s Draco file, and it decodes to the same model', (f) => {
  it(`is the pinned file (${f.bytes} B), needs ${f.required.join(' + ')} only, and keeps the replaced file's images and material JSON byte for byte`, () => {
    const raw = readFileSync(pub(f.url));
    expect(raw.length).toBe(f.bytes);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(f.sha);
    const { json, bin } = glb(f.url);
    expect([...(json.extensionsRequired ?? [])].sort()).toEqual([...f.required]);
    for (const prim of json.meshes.flatMap((m) => m.primitives)) {
      expect(prim.extensions?.KHR_draco_mesh_compression).toBeTruthy();
      // FLOAT ONLY: no normalized integer attribute, so nothing here leans on Babylon's worker-only normalization (meshyProps)
      for (const [name, i] of Object.entries(prim.attributes)) expect([name, json.accessors[i].componentType, json.accessors[i].normalized ?? false]).toEqual([name, 5126, false]);
    }
    const j = json as Gltf & { images: { name?: string; mimeType?: string; bufferView: number }[] };
    const ih = createHash('sha256');
    for (const im of j.images) { const v = json.bufferViews[im.bufferView]; ih.update(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)); }
    expect(ih.digest('hex')).toBe(f.imgSha);
    const blocks = { asset: j.asset, scene: j.scene, scenes: j.scenes, nodes: j.nodes, materials: j.materials, textures: j.textures, samplers: j.samplers, images: j.images.map((i) => ({ name: i.name, mimeType: i.mimeType })) };
    expect(createHash('sha256').update(JSON.stringify(blocks)).digest('hex')).toBe(f.jsonSha);
  });

  it('decodes with the repo\'s own wrapper and wasm to the replaced file\'s meshes: counts, materials, bounds within 0.1 mm, float unit normals, its UV ranges', async () => {
    // Node has no Worker, so Babylon decodes in-thread here, from the same two files a browser fetches from /loaders/draco
    const require = createRequire(import.meta.url);
    DracoDecoder.DefaultConfiguration = {
      ...DRACO_DECODER_URLS, numWorkers: 0,
      jsModule: require(pub(DRACO_DECODER_URLS.wasmUrl)), wasmBinary: readFileSync(pub(DRACO_DECODER_URLS.wasmBinaryUrl)),
    };
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      const c = await SceneLoader.LoadAssetContainerAsync('', 'data:model/gltf-binary;base64,' + readFileSync(pub(f.url)).toString('base64'), scene, undefined, '.glb');
      const meshes = c.meshes.filter((m) => m.getTotalVertices() > 0);
      expect(meshes.map((m) => m.name)).toEqual(f.meshes.map((m) => m.name));
      expect(c.textures.length).toBe(f.textures);
      const near = (a: number[], b: readonly number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i]), `${a} vs ${b}`).toBeLessThan(1e-4));
      meshes.forEach((m, k) => {
        const want = f.meshes[k];
        expect([m.material?.name, m.getTotalVertices(), m.getTotalIndices() / 3]).toEqual([want.material, want.verts, want.tris]);
        m.refreshBoundingInfo();
        near(m.getBoundingInfo().boundingBox.minimum.asArray(), want.min);
        near(m.getBoundingInfo().boundingBox.maximum.asArray(), want.max);
        // every decoded buffer is FLOAT — the same on Babylon's worker and in-thread paths
        for (const kind of m.getVerticesDataKinds()) expect([kind, m.getVertexBuffer(kind)!.type]).toEqual([kind, VertexBuffer.FLOAT]);
        const n = m.getVerticesData(VertexBuffer.NormalKind)!;
        let worst = 0; for (let i = 0; i < n.length; i += 3) worst = Math.max(worst, Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1));
        expect(worst).toBeLessThan(1e-3);
        // the replaced file's UV ranges (u, v), within 0.001: never 0–65535 integers (the trunk's v runs −1.94…1.02 by design)
        const uv = m.getVerticesData(VertexBuffer.UVKind)!;
        const r = [[Infinity, -Infinity], [Infinity, -Infinity]];
        for (let i = 0; i < uv.length; i += 2) for (let a = 0; a < 2; a++) { r[a][0] = Math.min(r[a][0], uv[i + a]); r[a][1] = Math.max(r[a][1], uv[i + a]); }
        r.forEach((ab, a) => ab.forEach((v, e) => expect(Math.abs(v - want.uv[a][e]), `uv ${a} ${e}: ${v}`).toBeLessThan(1e-3)));
      });
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
  it('meshopt and KTX2/Basis (no local decoder: Babylon would fetch one from cdn.babylonjs.com) are used by none; Draco only by the three files above', () => {
    expect(bodies.length).toBeGreaterThanOrEqual(DUNK_RIVALS.length);
    const draco: string[] = [];
    for (const url of urls) {
      const used = glb(url).json.extensionsUsed ?? [];
      expect(used.filter((e) => /meshopt|basisu|KHR_texture_basisu|EXT_meshopt/i.test(e)), url).toEqual([]);
      if (used.includes('KHR_draco_mesh_compression')) draco.push(url);
    }
    // FDB-4 widened this from the hoop alone: meshyProps sets the decoder before any of them loads (the dunk and veniceBoardwalk
    // import it statically)
    expect(draco.sort()).toEqual(DRACO_FILES.map((f) => f.url).sort());
  });
});
