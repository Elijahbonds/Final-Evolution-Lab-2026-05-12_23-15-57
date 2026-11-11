// DEMO-MODELS-1 item 1/2: the coach body files are the QC'd prep2 files, byte-for-byte (no gltf-transform, no rescale, no resave),
// their 53 garment/body morph targets carry real values (prep v1 shipped them flattened to zeros by gltf-transform 4.5.1), and the
// skin under the coach tee / shorts / shoes is masked only while COACH_BODY_MASK_ENABLED is on (QC E1: "skin through the tee").
// Binary files: committed as blobs beside this diff (NOTES.md lists their paths and shas). Until they are in place this file skips.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadAssetContainerAsync, NullEngine, Scene, type AssetContainer, type Mesh, type TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { COACH_BODY_MOBILE_URL, COACH_BODY_URL } from '@/lib/babylon/core/heroBody';
import { NO_DEMO_MODEL_FLAGS, setDemoModelFlags } from '@/lib/babylon/core/demoModels';
import { isBodyMesh, maskBodyNow, maskSlotOf } from '@/lib/babylon/core/bodyMask';
import { applyCoachHairHide } from '@/lib/babylon/core/hairStyles';
import { maskCoachBody } from '@/lib/babylon/core/kit';

/** QC-coach-prep2.md (2026-10-28), the "Outputs" table. */
const QC_SHA256: Record<string, string> = {
  [COACH_BODY_URL]: '051adcc05f5a76a5d657eac9e00145adecd45039f073fcd546a74c4eee737643',
  [COACH_BODY_MOBILE_URL]: 'e05d1822a38495a3a044411dcd06e81e8c2814409378bdfe1bd6e959041c9244',
};
const file = (url: string) => `public${url}`;
const present = Object.keys(QC_SHA256).every((u) => existsSync(file(u)));
const d = present ? describe : describe.skip;

// ── a small GLB reader (no deps): JSON chunk, BIN chunk, accessor values with sparse and normalized ints ──────────────────────
type Gltf = { accessors: any[]; bufferViews: any[]; meshes: any[]; nodes: any[]; asset: any; extensionsUsed?: string[] };
function readGlb(buf: Buffer): { json: Gltf; bin: Buffer } {
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);   // 'glTF'
  let o = 12, json: Gltf | null = null, bin: Buffer | null = null;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4), body = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8')); else if (type === 0x004e4942) bin = body;
    o += 8 + len;
  }
  return { json: json!, bin: bin! };
}
const SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readComp(bin: Buffer, at: number, ct: number, norm: boolean): number {
  switch (ct) {
    case 5126: return bin.readFloatLE(at);
    case 5122: { const v = bin.readInt16LE(at); return norm ? Math.max(v / 32767, -1) : v; }
    case 5123: { const v = bin.readUInt16LE(at); return norm ? v / 65535 : v; }
    case 5120: { const v = bin.readInt8(at); return norm ? Math.max(v / 127, -1) : v; }
    case 5121: { const v = bin.readUInt8(at); return norm ? v / 255 : v; }
    case 5125: return bin.readUInt32LE(at);
    default: throw new Error(`componentType ${ct}`);
  }
}
function viewRead(g: Gltf, bin: Buffer, view: number, byteOffset: number, count: number, n: number, ct: number, norm: boolean): number[] {
  const bv = g.bufferViews[view], stride = bv.byteStride ?? n * SIZE[ct], base = (bv.byteOffset ?? 0) + byteOffset, out: number[] = [];
  for (let i = 0; i < count; i++) for (let c = 0; c < n; c++) out.push(readComp(bin, base + i * stride + c * SIZE[ct], ct, norm));
  return out;
}
/** Every value of an accessor, sparse substitution applied. */
function accessorValues(g: Gltf, bin: Buffer, idx: number): number[] {
  const a = g.accessors[idx], n = COMPS[a.type], norm = a.normalized === true;
  const out = a.bufferView != null ? viewRead(g, bin, a.bufferView, a.byteOffset ?? 0, a.count, n, a.componentType, norm) : new Array(a.count * n).fill(0);
  if (a.sparse) {
    const s = a.sparse;
    const ix = viewRead(g, bin, s.indices.bufferView, s.indices.byteOffset ?? 0, s.count, 1, s.indices.componentType, false);
    const vals = viewRead(g, bin, s.values.bufferView, s.values.byteOffset ?? 0, s.count, n, a.componentType, norm);
    ix.forEach((v, i) => { for (let c = 0; c < n; c++) out[v * n + c] = vals[i * n + c]; });
  }
  return out;
}
/** The node name → its mesh's morph targets (per primitive 0): [targetName, max |POSITION delta|]. */
function morphsByNode(g: Gltf, bin: Buffer): Record<string, Array<[string, number]>> {
  const out: Record<string, Array<[string, number]>> = {};
  for (const node of g.nodes) {
    if (node.mesh == null) continue;
    const mesh = g.meshes[node.mesh], prim = mesh.primitives[0], names: string[] = mesh.extras?.targetNames ?? [];
    out[node.name] = (prim.targets ?? []).map((t: any, i: number) => [names[i] ?? `#${i}`, t.POSITION == null ? 0 : Math.max(0, ...accessorValues(g, bin, t.POSITION).map(Math.abs))]);
  }
  return out;
}

d('the coach body files (prep2, 1.73 m) are the QC\'d bytes', () => {
  for (const url of Object.keys(QC_SHA256)) {
    it(`${url}: sha256 is QC-coach-prep2's`, () => {
      expect(createHash('sha256').update(readFileSync(file(url))).digest('hex')).toBe(QC_SHA256[url]);
    });
    it(`${url}: never re-saved here (QC's own generator stamp and outfit extras, the quantization and webp it was built with)`, () => {
      const { json } = readGlb(readFileSync(file(url)));
      expect(json.asset.generator).toBe('glTF-Transform v4.5.1');
      expect(json.extensionsUsed).toEqual(expect.arrayContaining(['KHR_mesh_quantization', 'EXT_texture_webp']));
      expect(json.nodes.filter((n) => n.mesh != null).map((n) => n.name).sort()).toEqual(['Body', 'Bottom_training_shorts', 'CoachHair_coily', 'Shoe_lowcut', 'Sock_low', 'Top_compression', 'eyes'].sort());
    });
    it(`${url}: all 53 Body / tee / shorts morph targets and the 9 hair targets carry non-zero values`, () => {
      const { json, bin } = readGlb(readFileSync(file(url)));
      const m = morphsByNode(json, bin);
      const counts = { Body: m.Body.length, Top_compression: m.Top_compression.length, Bottom_training_shorts: m.Bottom_training_shorts.length, CoachHair_coily: m.CoachHair_coily.length };
      expect(counts).toEqual({ Body: 39, Top_compression: 8, Bottom_training_shorts: 6, CoachHair_coily: 9 });
      const flat = (['Body', 'Top_compression', 'Bottom_training_shorts', 'CoachHair_coily'] as const).flatMap((k) => m[k].filter(([, v]) => !(v > 0)).map(([n]) => `${k}.${n}`));
      expect(flat, 'targets whose every value is zero (the gltf-transform 4.5.1 flattening)').toEqual([]);
      expect(m.Body.length + m.Top_compression.length + m.Bottom_training_shorts.length).toBe(53);
    });
  }
});

// ── in engine: the bodyMask on the real coach body ──────────────────────────────────────────────────────────────────────────
let scene: Scene | null = null;
afterEach(() => { setDemoModelFlags(NO_DEMO_MODEL_FLAGS); });
async function coach(): Promise<{ container: AssetContainer; meshes: Mesh[]; body: Mesh; root: TransformNode }> {
  scene ??= new Scene(new NullEngine());
  const data = `data:model/gltf-binary;base64,${readFileSync(file(COACH_BODY_URL)).toString('base64')}`;
  const container = await LoadAssetContainerAsync(data, scene, { pluginExtension: '.glb', pluginOptions: { gltf: { skipMaterials: true } } });
  const inst = container.instantiateModelsToScene((n) => `${n}_c1`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  root.computeWorldMatrix(true);
  for (const t of root.getDescendants(false) as TransformNode[]) t.computeWorldMatrix?.(true);
  for (const sk of inst.skeletons) sk.prepare(true);
  const meshes = root.getChildMeshes(false) as Mesh[];
  const body = meshes.find((m) => isBodyMesh(m.name))!;
  return { container, meshes, body, root };
}

d('the skin through the tee (QC E1): the coach garments mask the body only with COACH_BODY_MASK_ENABLED', () => {
  it('the loaded mesh names: off, no coach garment has a slot; on, the tee, shorts, socks and shoes do', async () => {
    const { meshes, body, root } = await coach();
    expect(body, 'the coach body has a Body mesh').toBeTruthy();
    const names = meshes.map((m) => m.name);
    expect(names.filter((n) => maskSlotOf(n))).toEqual([]);
    setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, coachBodyMask: true });
    const slots = Object.fromEntries(names.filter((n) => maskSlotOf(n)).map((n) => [n.replace(/_c1$|_primitive\d+.*$/, ''), maskSlotOf(n)]));
    expect(slots).toMatchObject({ Top_compression: 'tops', Bottom_training_shorts: 'shorts', Shoe_lowcut: 'shoes', Sock_low: 'shoes' });
    root.dispose();
  }, 120_000);
  it('maskBodyNow: off hides no skin under the coach clothes; on hides the skin under the tee and the shorts', async () => {
    const off = await coach();
    const r0 = maskBodyNow(off.body, off.meshes);
    expect(Object.values(r0?.hiddenBySlot ?? {}).reduce((a, b) => a + b, 0)).toBe(0);
    off.root.dispose();
    setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, coachBodyMask: true });
    const on = await coach();
    const r1 = maskBodyNow(on.body, on.meshes)!;
    expect(r1, 'the mask measured').toBeTruthy();
    console.info(`[DEMO-MODELS-1 mask] coach body tris ${r1.trisBefore} → ${r1.trisAfter}; hidden by slot ${JSON.stringify(r1.hiddenBySlot)}`);
    expect(r1.hiddenBySlot.tops ?? 0).toBeGreaterThan(0);
    expect(r1.hiddenBySlot.shorts ?? 0).toBeGreaterThan(0);
    expect(r1.trisAfter).toBeLessThan(r1.trisBefore);
    on.root.dispose();
  }, 120_000);
  it('applyKit\'s early return (the coach body has no Kit_ garments) schedules the mask only with the setting on', async () => {
    const c = await coach();
    expect(maskCoachBody(c.meshes)).toBe(false);
    setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, coachBodyMask: true });
    expect(maskCoachBody(c.meshes)).toBe(true);
    expect(maskCoachBody(c.meshes.filter((m) => !/^(Top|Bottom|Shoe|Sock)_/.test(m.name)))).toBe(false);   // a body with no coach garment: nothing
    c.root.dispose();
  }, 120_000);
  it('the coach hair follows the hide paths (Bald / hidden hair / hood): applyCoachHairHide', async () => {
    const c = await coach();
    const hair = c.meshes.filter((m) => /^CoachHair_/.test(m.name));
    expect(hair.length).toBeGreaterThan(0);
    expect(applyCoachHairHide(c.meshes, true)).toBe(hair.length);
    expect(hair.every((m) => !m.isVisible)).toBe(true);
    applyCoachHairHide(c.meshes, false);
    expect(hair.every((m) => m.isVisible)).toBe(true);
    c.root.dispose();
  }, 120_000);
});
