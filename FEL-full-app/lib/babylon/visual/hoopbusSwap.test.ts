// HOOPBUS-SWAP (PERF-834-LCP batch, 2026-10-29): the corner bus is 3D Art's compressed hoopbus.glb (4,736,976 → 849,568 bytes:
// Draco geometry + WebP maps). The swap must be the same model to the game: it parses, decodes with OUR Draco decoder (never a CDN),
// and keeps the old file's node and mesh names, triangle count, texture count and bounds (DunkMode parks it by its bounds at 6.4 m).
// Pins measured from the replaced file at 593fe200 (sha256 5a4df83d…): nodes __root__ + Mesh_0, mesh Mesh_0, 111,926 tris, 3 textures.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DracoDecoder, NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { DRACO_DECODER_URLS } from './meshyProps';

const ROOT = path.resolve(__dirname, '../../..');
const pub = (url: string) => path.join(ROOT, 'public', url.split('?')[0]);
const FILE = pub('/models/meshy/hoopbus.glb');
const require = createRequire(import.meta.url);

/** The replaced file's shape (measured at 593fe200 with this decoder path). */
const OLD = { nodes: ['__root__', 'Mesh_0'], meshes: ['Mesh_0'], tris: 111926, textures: 3, min: [-4.499, -0.0018, -2.0711], max: [4.4999, 4.1737, 2.0707] };
/** 3D Art's compressed export (box /workspace/fel-specs/compress-test/out/hoopbus.glb). */
const NEW = { bytes: 849568, sha256Prefix: 'b9cb9ecd' };

function json(b: Buffer): { extensionsRequired?: string[]; nodes?: { name?: string }[]; meshes?: { name?: string }[] } {
  expect(b.readUInt32LE(0), 'a GLB').toBe(0x46546c67);
  const jl = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
}

describe('the corner bus loads as the same model', () => {
  it('parses: the same glTF node and mesh names, and it needs only extensions the game decodes', () => {
    const j = json(readFileSync(FILE));
    expect((j.nodes ?? []).map((n) => n.name)).toEqual(['Mesh_0']);
    expect((j.meshes ?? []).map((m) => m.name)).toEqual(['Mesh_0']);
    for (const ext of j.extensionsRequired ?? []) expect(['KHR_draco_mesh_compression', 'EXT_texture_webp'], ext).toContain(ext);
  });
  it('decodes with our own Draco decoder to the same nodes, mesh, triangles, textures and bounds', async () => {
    const shipped = { ...DracoDecoder.DefaultConfiguration };
    DracoDecoder.DefaultConfiguration = {
      ...DRACO_DECODER_URLS, numWorkers: 0,
      jsModule: require(pub(DRACO_DECODER_URLS.wasmUrl)), wasmBinary: readFileSync(pub(DRACO_DECODER_URLS.wasmBinaryUrl)),
    } as typeof DracoDecoder.DefaultConfiguration;
    const engine = new NullEngine(); const scene = new Scene(engine);
    try {
      const c = await SceneLoader.LoadAssetContainerAsync('', 'data:model/gltf-binary;base64,' + readFileSync(FILE).toString('base64'), scene, undefined, '.glb');
      expect([...c.transformNodes.map((n) => n.name), ...c.meshes.map((m) => m.name)]).toEqual(OLD.nodes);
      const meshes = c.meshes.filter((m) => m.getTotalVertices() > 0);
      expect(meshes.map((m) => m.name)).toEqual(OLD.meshes);
      expect(meshes[0].getTotalIndices() / 3).toBe(OLD.tris);
      expect(c.textures.length).toBe(OLD.textures);
      meshes[0].refreshBoundingInfo();
      const b = meshes[0].getBoundingInfo().boundingBox;
      b.minimum.asArray().forEach((v, i) => expect(Math.abs(v - OLD.min[i])).toBeLessThan(2e-3));
      b.maximum.asArray().forEach((v, i) => expect(Math.abs(v - OLD.max[i])).toBeLessThan(2e-3));
    } finally {
      engine.dispose();
      DracoDecoder.DefaultConfiguration = shipped;
    }
  });
});

describe('HOOPBUS-SWAP: the shipped file is the compressed one', () => {
  it('849,568 bytes, sha256 b9cb9ecd…', () => {
    const b = readFileSync(FILE);
    expect(b.length).toBe(NEW.bytes);
    expect(createHash('sha256').update(b).digest('hex').startsWith(NEW.sha256Prefix)).toBe(true);
  });
});
