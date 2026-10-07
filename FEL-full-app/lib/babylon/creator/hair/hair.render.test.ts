// CODE-BUILT HAIR on the REAL bodies (2026-10-07, the hair expansion), through the real path (identityFrom → applyIdentity →
// renderHair), in NullEngine scenes: the male kit, the female kit and the forge hero.
//
// What is proven here:
//   - every catalog style builds on every body, skinned to the body's OWN skeleton (valid joints, weights summing to 1),
//     never pickable, and the baked Hair_* nodes are hidden while it is worn;
//   - every style is its own shape: no two styles share a geometry, and every pair differs in SILHOUETTE (the head-frame
//     voxels their vertices occupy) — the eleven names that used to share six baked nodes included;
//   - the per-character budget per tier (triangles, draws, materials), with the heaviest extras on;
//   - the hijab covers the hair, the ears and the neck and leaves the face open; a raised hood or a helmet takes the hair
//     off (the beard stays), headwear presses tall hair down;
//   - the beards leave the mouth open; accessories appear only on styles they fit;
//   - colours rewrite a buffer (no rebuild), the same look rebuilds nothing;
//   - hanging hair sways on the creator's swing rig within its limits, at most six chains, the heap flat;
//   - a body it cannot fit is left exactly as it was.
import { readFileSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, SceneLoader, Vector3, VertexBuffer } from '@babylonjs/core';
import type { AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { applyIdentity, identityFrom } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { HAIR_STYLES, defaultFace } from '../../../closet/wearable-catalog';
import { BEARD_STYLES, HAIR_ACCS, emptyCreatorDoc, type CreatorDoc, type CreatorSlotV2 } from '../../../creator/look/doc';
import { HAIR_SWAY, accFits, resolveHair } from '../../../creator/look/hair';
import { bodyMeshOf } from '../shape/renderShape';
import { clothFieldOf } from '../clothes/bodyField';
import { SWING_MAX_ANGLE, SWING_MAX_CHAINS, stepSwing } from '../parts/swing';
import { setPaintBaseReader } from '../paint/renderPaint';
import { dirOf, headFieldOf, sampleMap, type HeadField } from './headField';
import { buildHair, type HairGeo } from './build';
import { K } from './geo';
import { DETAIL_H, DETAIL_W, HAIR_ALPHA_CUT, HAIR_BUDGET, hairDetailHeight, hairMeshOf, hairMeshesOf, hairSwingRigOf, resetHairCaches, syncHair } from './renderHair';

const kits: Record<string, AssetContainer> = {};
let scene: Scene;
beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  scene = new Scene(new NullEngine());
  scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
  scene.metadata = { felTier: 'desktop' };
  const files: Record<string, string> = { male: 'candidates/fel-kit-male.glb', female: 'candidates/fel-kit-female.glb', hero: 'fel-hero.glb' };
  for (const [k, f] of Object.entries(files)) {
    kits[k] = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/${f}`).toString('base64')}`, scene, undefined, '.glb');
  }
}, 180_000);
afterAll(() => setPaintBaseReader(null));

let n = 0;
function spawn(kit: 'male' | 'female' | 'hero' = 'male'): SpawnedCharacter {
  const inst = kits[kit].instantiateModelsToScene((x) => `${x}_h${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `h${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const WEAR = { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' };
function wear(s: SpawnedCharacter, style: string, doc: Partial<CreatorDoc> = {}, o: { sex?: 'male' | 'female'; colour?: string; equipped?: Record<string, string | null> } = {}): void {
  const sex = o.sex ?? 'male';
  const base = { ...defaultFace(), hairStyle: style, hairColor: o.colour ?? '#2B1B0E' };
  const eq = (o.equipped ?? WEAR) as CreatorSlotV2['equipped'];
  const slot: CreatorSlotV2 = { id: 'w1', label: 'W', body: sex, base, doc: { ...emptyCreatorDoc(), ...doc }, equipped: eq };
  applyIdentity(s, identityFrom({ look: { face: { ...base, creatorSlots: [slot], activeSlot: 'w1' }, equipped: eq } } as never,
    { body: sex === 'female' ? 'kit-female' : 'kit-male', frame: { heightScale: 100, buildScale: 100 }, scanOwned: false } as never, null));
}
const glbHair = (s: SpawnedCharacter) => s.meshes.filter((m) => /^Hair_/.test(m.name));
/** Recompute every node's world matrix (a moved root does not refresh its descendants' cached ones on its own). */
const settle = (root: TransformNode) => { root.computeWorldMatrix(true); for (const n of root.getChildTransformNodes(false)) n.computeWorldMatrix(true); };
const field = (s: SpawnedCharacter): HeadField => headFieldOf(bodyMeshOf(s.meshes)!)!;
const winding = (s: SpawnedCharacter) => clothFieldOf(bodyMeshOf(s.meshes)!)!.winding;

/** Head-frame voxels (1 cm) a geometry's vertices occupy: its silhouette, for telling styles apart. */
function voxels(g: HairGeo): Set<string> {
  const out = new Set<string>();
  for (let v = 0; v < g.verts; v++) out.add(`${Math.floor(g.hf[v * 3] / 0.01)},${Math.floor(g.hf[v * 3 + 1] / 0.01)},${Math.floor(g.hf[v * 3 + 2] / 0.01)}`);
  return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return 1 - inter / (a.size + b.size - inter || 1);
}
function geoHash(g: HairGeo): string {
  let h = 2166136261;
  for (let i = 0; i < g.P.length; i += 1) { h ^= Math.round(g.P[i] * 1e4); h = Math.imul(h, 16777619); }
  return `${g.verts}:${g.tris}:${h >>> 0}`;
}

describe('every style on every body', () => {
  for (const kit of ['male', 'female', 'hero'] as const) {
    it(`builds all ${HAIR_STYLES.length} styles on the ${kit} body, skinned to its own skeleton, the baked nodes hidden`, () => {
      const s = spawn(kit);
      const bones = s.skeleton!.bones.length;
      for (const style of HAIR_STYLES) {
        wear(s, style, {}, { sex: kit === 'female' ? 'female' : 'male' });
        expect((s.root.metadata as { felHair?: { style: string } }).felHair?.style, style).toBe(style);
        for (const m of glbHair(s)) expect(m.isVisible, `${style}: ${m.name}`).toBe(false);
        const mesh = hairMeshOf(s.root);
        if (style === 'Bald') { expect(mesh).toBeNull(); continue; }
        expect(mesh, style).not.toBeNull();
        // (booleans: a failing toBe on a Babylon object pretty-prints the whole scene graph and runs out of memory)
        expect(mesh!.skeleton === bodyMeshOf(s.meshes)!.skeleton, `${style}: the body's own skeleton`).toBe(true);
        expect(mesh!.isPickable).toBe(false);
        expect(s.meshes.includes(mesh!), `${style}: not in spawn.meshes`).toBe(false);
        const J = mesh!.getVerticesData(VertexBuffer.MatricesIndicesKind)!, W = mesh!.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
        let bad = 0;
        for (let v = 0; v < J.length / 4; v++) {
          const sum = W[v * 4] + W[v * 4 + 1] + W[v * 4 + 2] + W[v * 4 + 3];
          if (Math.abs(sum - 1) > 1e-4) bad++;
          for (let k = 0; k < 4; k++) if (!(J[v * 4 + k] < bones)) bad++;
        }
        for (const x of mesh!.getVerticesData(VertexBuffer.PositionKind)!) if (!Number.isFinite(x)) bad++;
        expect(bad, `${style}: bad weights, joints or positions`).toBe(0);
      }
      s.root.dispose();
    }, 180_000);
  }
});

describe('every style its own shape', () => {
  it('no two styles share a geometry, and every pair differs in silhouette', () => {
    const s = spawn('male');
    const H = field(s), w = winding(s);
    const geos = new Map<string, HairGeo>();
    for (const style of HAIR_STYLES) if (style !== 'Bald') geos.set(style, buildHair(H, { style, beard: null, acc: [] }, { tier: 'desktop', winding: w }));
    const hashes = new Set([...geos.values()].map(geoHash));
    expect(hashes.size).toBe(geos.size);
    const vox = new Map([...geos].map(([k, g]) => [k, voxels(g)]));
    const names = [...geos.keys()];
    let closest = { d: 1, a: '', b: '' };
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const d = jaccard(vox.get(names[i])!, vox.get(names[j])!);
      if (d < closest.d) closest = { d, a: names[i], b: names[j] };
    }
    console.log(`[hair] closest silhouettes: ${closest.a} / ${closest.b} at ${closest.d.toFixed(3)}`);
    expect(closest.d, `${closest.a} vs ${closest.b}`).toBeGreaterThan(0.18);
    // the names that used to share a baked node are apart by much more than that
    const pairs = [['Box Braids', 'Locs'], ['Locs', 'Cornrows'], ['Box Braids', 'Cornrows'], ['Fade', 'Buzz'], ['Buzz', 'Cropped'], ['Cropped', 'Waves'],
      ['Fade', 'Waves'], ['Curly', 'Straight'], ['Straight', 'Wavy'], ['Curly', 'Wavy']];
    for (const [a, b] of pairs) expect(jaccard(vox.get(a)!, vox.get(b)!), `${a} vs ${b}`).toBeGreaterThan(0.18);
    s.root.dispose();
  }, 120_000);
  it('an old saved name loads unchanged and shows its new shape (not the shared node)', () => {
    const s = spawn('male');
    wear(s, 'Locs');
    const locs = hairMeshesOf(s.root).reduce((t, m) => t + m.getTotalVertices(), 0);
    wear(s, 'Box Braids');
    const braids = hairMeshesOf(s.root).reduce((t, m) => t + m.getTotalVertices(), 0);
    wear(s, 'Cornrows');
    const rows = hairMeshesOf(s.root).reduce((t, m) => t + m.getTotalVertices(), 0);
    expect(new Set([locs, braids, rows]).size).toBe(3);
    s.root.dispose();
  });
});

describe('the per-character budget', () => {
  for (const tier of ['desktop', 'mobile', 'crowd'] as const) {
    it(`${tier}: every style with a full beard and every fitting accessory stays under ${HAIR_BUDGET[tier].tris} triangles, two draws, one material`, () => {
      const s = spawn('male');
      const H = field(s), w = winding(s);
      let worst = { style: '', tris: 0 };
      for (const style of HAIR_STYLES) {
        const acc = HAIR_ACCS.filter((a) => accFits(a, style)).slice(0, 3);
        const g = buildHair(H, { style, beard: 'full', acc }, { tier, winding: w });
        if (g.tris > worst.tris) worst = { style, tris: g.tris };
        expect(g.tris, style).toBeLessThanOrEqual(HAIR_BUDGET[tier].tris);
        expect(g.chains.length, style).toBeLessThanOrEqual(SWING_MAX_CHAINS.mobile);
      }
      console.log(`[hair] ${tier} heaviest: ${worst.style} ${worst.tris} tris`);
      s.root.dispose();
    }, 120_000);
  }
  it('in the scene: at most two hair meshes per body, one material shared by every body', () => {
    const a = spawn('male'), b = spawn('female');
    wear(a, 'Box Braids', { hair: { beard: 'full', acc: ['beads', 'cuffs'] } });
    wear(b, 'Afro Puffs', { hair: { acc: ['ties'] } }, { sex: 'female' });
    for (const s of [a, b]) expect(hairMeshesOf(s.root).length).toBeLessThanOrEqual(2);
    const mats = new Set([...hairMeshesOf(a.root), ...hairMeshesOf(b.root)].map((m) => m.material));
    expect(mats.size).toBe(1);
    expect(hairMeshOf(a.root)!.skeleton === a.skeleton || hairMeshOf(a.root)!.skeleton === bodyMeshOf(a.meshes)!.skeleton).toBe(true);
    a.root.dispose(); b.root.dispose();
  });
});

describe('coverings and what covers the hair', () => {
  it('the hijab covers the scalp, the ears and the neck, and leaves the face open; no hair under it', () => {
    for (const kit of ['male', 'female'] as const) {
      const s = spawn(kit);
      const H = field(s);
      const g = buildHair(H, { style: 'Hijab', beard: null, acc: [] }, { tier: 'desktop', winding: winding(s) });
      let hairUnder = 0;
      for (let v = 0; v < g.verts; v++) if (g.kind[v] !== K.fabric && g.kind[v] !== K.trim) hairUnder++;
      expect(hairUnder).toBe(0);
      // the fabric's reach per direction (a coarse map of its vertices' radii)
      const NA = 36, NB = 18, map = new Float32Array(NA * NB);
      for (let v = 0; v < g.verts; v++) {
        const x = g.hf[v * 3], y = g.hf[v * 3 + 1], z = g.hf[v * 3 + 2];
        const a = Math.atan2(x, z), b = Math.atan2(y, Math.hypot(x, z));
        const i = Math.min(NA - 1, Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA)), j = Math.min(NB - 1, Math.floor(((b + Math.PI / 2) / Math.PI) * NB));
        map[j * NA + i] = Math.max(map[j * NA + i], Math.hypot(x, y, z));
      }
      const covered = (a: number, b: number) => {
        const i = Math.min(NA - 1, Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA)), j = Math.min(NB - 1, Math.floor(((b + Math.PI / 2) / Math.PI) * NB));
        return map[j * NA + i] > sampleMap(H.Rf, a, b) + 0.004;
      };
      const D = Math.PI / 180;
      // the crown, the back, the ears, the nape
      for (const [a, b] of [[0, 80], [180, 40], [180, 0], [90, 0], [-90, 0], [150, -30], [-150, -30], [0, 40]]) expect(covered(a * D, b * D), `${kit} ${a},${b}`).toBe(true);
      // the face: the nose tip and the mouth stay open (no fabric in front of them)
      for (const p of [[0, H.L.nose.y, H.L.nose.z], [0, H.L.mouth.y, H.L.mouth.z]]) {
        const near = Array.from({ length: g.verts }, (_, v) => v).some((v) => Math.hypot(g.hf[v * 3] - p[0], g.hf[v * 3 + 1] - p[1], g.hf[v * 3 + 2] - p[2]) < 0.025);
        expect(near, `${kit} face open`).toBe(false);
      }
      s.root.dispose();
    }
  });
  it('a raised hood takes the hair off and keeps the beard; down, the hair is back', () => {
    const s = spawn('male');
    const hoodie = (hood: 'up' | 'down') => ({ clothes: [{ id: 'c1', kind: 'top' as const, style: 'hoodie' as const, colour: '#222222', hood }], hair: { beard: 'short' as const } });
    wear(s, 'Afro', hoodie('up'));
    expect((s.root.metadata as { felHair: { style: string; beard: string } }).felHair).toMatchObject({ style: 'Bald', beard: 'short' });
    expect(hairMeshOf(s.root)).not.toBeNull();   // the beard
    for (const m of glbHair(s)) expect(m.isVisible).toBe(false);
    wear(s, 'Afro', hoodie('down'));
    expect((s.root.metadata as { felHair: { style: string } }).felHair.style).toBe('Afro');
    s.root.dispose();
  });
  it('a head-sized helmet part hides the hair', () => {
    const s = spawn('male');
    wear(s, 'Locs', { parts: [{ id: 'p1', shape: 'helmet', bone: 'Head', pos: [0, 0.08, 0], rot: [0, 0, 0], scale: [1.1, 1.1, 1.1], colour: '#888888', finish: 'metal', mirror: false }] });
    expect((s.root.metadata as { felHair: { style: string } }).felHair.style).toBe('Bald');
    expect(hairMeshesOf(s.root)).toHaveLength(0);
    s.root.dispose();
  });
  it('the headband presses a tall style down', () => {
    const s = spawn('male');
    const H = field(s), w = winding(s);
    const tall = (cover: 'none' | 'compress') => { const g = buildHair(H, { style: 'High-Top Fade', beard: null, acc: [] }, { tier: 'desktop', winding: w, cover }); let m = -Infinity; for (let v = 0; v < g.verts; v++) m = Math.max(m, g.hf[v * 3 + 1]); return m; };
    expect(tall('compress')).toBeLessThan(tall('none') - 0.04);
    s.root.dispose();
  });
});

describe('beards and accessories', () => {
  it('every beard builds, as beard, and leaves the mouth open', () => {
    const s = spawn('male');
    const H = field(s), w = winding(s);
    const sigs = new Set<string>();
    for (const b of BEARD_STYLES) {
      const g = buildHair(H, { style: 'Bald', beard: b, acc: [] }, { tier: 'desktop', winding: w });
      expect(g.tris, b).toBeGreaterThan(20);
      sigs.add(geoHash(g));
      let notBeard = 0, overMouth = 0;
      for (let v = 0; v < g.verts; v++) {
        if (g.kind[v] !== K.beard) notBeard++;
        const x = g.hf[v * 3], y = g.hf[v * 3 + 1];
        // nothing thick over the lips. TEST CHANGED (polish pass, 2026-10-07): the owner asked for the mustache to come OVER
        // the upper lip, so its ragged lower edge now hangs up to ~4 mm under the lip line (measured: 3.6 mm on the male kit);
        // for it the check moves to the lower lip (4.5–10.5 mm under the line), which must stay open. Every other beard keeps
        // the original check at the lip line.
        const lip = b === 'mustache' ? H.L.mouth.y - 0.0075 : H.L.mouth.y;
        if (Math.abs(x) < 0.012 && Math.abs(y - lip) < 0.003 && g.along[v] >= 0.1) overMouth++;
      }
      expect(notBeard, b).toBe(0);
      expect(overMouth, `${b} over the mouth`).toBe(0);
    }
    expect(sigs.size).toBe(BEARD_STYLES.length);
    s.root.dispose();
  });
  it('accessories add pieces only where they fit', () => {
    const s = spawn('male');
    const H = field(s), w = winding(s);
    const accVerts = (style: string, acc: Parameters<typeof buildHair>[1]['acc']) => { const g = buildHair(H, { style, beard: null, acc }, { tier: 'desktop', winding: w }); let c = 0; for (let v = 0; v < g.verts; v++) if (g.kind[v] === K.acc) c++; return c; };
    expect(accVerts('Box Braids', ['beads'])).toBeGreaterThan(100);
    expect(accVerts('Locs', ['cuffs'])).toBeGreaterThan(100);
    expect(accVerts('Ponytail', ['ties'])).toBeGreaterThan(10);
    expect(accVerts('Straight', ['clips'])).toBeGreaterThan(10);
    expect(accVerts('Afro', ['headband'])).toBeGreaterThan(10);
    // through resolveHair a misfit is dropped before it reaches the builder
    expect(resolveHair({ hairStyle: 'Buzz' }, { hair: { acc: ['beads', 'ties'] } }).acc).toEqual([]);
    s.root.dispose();
  });
});

describe('re-applying', () => {
  it('the same look rebuilds nothing; a colour change rewrites the colours only; a style change rebuilds', () => {
    resetHairCaches();
    const s = spawn('male');
    wear(s, 'Twists', { hair: { colour2: '#FF3366' } });
    const m0 = hairMeshOf(s.root)!;
    const c0 = Array.from(m0.getVerticesData(VertexBuffer.ColorKind)!.slice(0, 400));
    wear(s, 'Twists', { hair: { colour2: '#FF3366' } });
    expect(hairMeshOf(s.root) === m0).toBe(true);
    wear(s, 'Twists', { hair: { colour2: '#00E5FF' } }, { colour: '#E4C590' });
    expect(hairMeshOf(s.root) === m0).toBe(true);
    expect(Array.from(m0.getVerticesData(VertexBuffer.ColorKind)!.slice(0, 400))).not.toEqual(c0);
    wear(s, 'Bob');
    expect(hairMeshOf(s.root) === m0).toBe(false);
    expect(m0.isDisposed()).toBe(true);
    s.root.dispose();
    expect(hairMeshesOf(s.root)).toHaveLength(0);
  });
});

describe('hair that moves', () => {
  it('the hanging styles sway on the swing rig (at most six chains), within its limits, and the heap stays flat', () => {
    const s = spawn('male');
    for (const style of Object.keys(HAIR_SWAY)) {
      wear(s, style);
      const rig = hairSwingRigOf(s.root);
      expect(rig, style).not.toBeNull();
      expect(rig!.chains.length).toBeLessThanOrEqual(SWING_MAX_CHAINS.mobile);
    }
    wear(s, 'Locs');
    const rig = hairSwingRigOf(s.root)!;
    for (let i = 0; i < 600; i++) { s.root.position.x = Math.sin(i / 7) * 0.6; s.root.position.y = Math.abs(Math.sin(i / 11)) * 0.8; settle(s.root); stepSwing(rig, 1 / 60); }
    for (let c = 0; c < rig.chains.length; c++) {
      expect(Math.abs(rig.state[c * 12])).toBeLessThanOrEqual(SWING_MAX_ANGLE + 1e-6);
      expect(Math.abs(rig.state[c * 12 + 1])).toBeLessThanOrEqual(SWING_MAX_ANGLE + 1e-6);
    }
    // something actually moved
    expect(rig.chains.some((_, c) => Math.abs(rig.state[c * 12]) + Math.abs(rig.state[c * 12 + 1]) > 0.01)).toBe(true);
    v8.setFlagsFromString('--expose_gc');
    const gc = vm.runInNewContext('gc') as () => void;
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 20_000; i++) { s.root.position.x = Math.sin(i / 10) * 0.2; s.root.computeWorldMatrix(true); stepSwing(rig, 1 / 60); }
    gc();
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(400_000);
    s.root.dispose();
  });
  it('a short style has nothing hanging', () => {
    const s = spawn('male');
    for (const style of ['Buzz', 'Fade', 'Waves', 'High-Top Fade', 'Hijab']) { wear(s, style); expect(hairSwingRigOf(s.root), style).toBeNull(); }
    s.root.dispose();
  });
});

describe('a body it cannot fit', () => {
  it('without the forge Hair_* nodes (the scan, the procedural fallback) nothing changes', () => {
    const s = spawn('male');
    for (const m of glbHair(s)) m.dispose();
    const body = { ...s, meshes: s.meshes.filter((m) => !m.isDisposed()) };
    expect(syncHair(body, resolveHair({ hairStyle: 'Afro' }, null))).toBeNull();
    expect(hairMeshesOf(s.root)).toHaveLength(0);
    s.root.dispose();
  });
  it('dirOf is a unit vector (the head frame sanity)', () => {
    const d = dirOf(0.7, -0.3);
    expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1, 6);
  });
});

describe('the polish pass (owner, 2026-10-07)', () => {
  it('the detail texture: the three hair bands carry a pattern, the plain band (fabric, accessories) is flat', () => {
    const h = hairDetailHeight(), bw = DETAIL_W / 4;
    for (let band = 0; band < 4; band++) {
      let lo = 1, hi = 0;
      for (let y = 0; y < DETAIL_H; y++) for (let x = band * bw; x < (band + 1) * bw; x++) { lo = Math.min(lo, h[y * DETAIL_W + x]); hi = Math.max(hi, h[y * DETAIL_W + x]); }
      if (band === 3) expect(hi - lo, 'plain').toBe(0);
      else expect(hi - lo, `band ${band}`).toBeGreaterThan(0.3);
    }
  });
  it('fabric and accessories sample the plain band, hair and beards a patterned one', () => {
    const s = spawn('female');
    const H = field(s), w = winding(s);
    const seen = new Set<string>();
    for (const [style, acc] of [['Hijab', []], ['Box Braids', ['beads', 'cuffs']], ['Durag', []]] as const) {
      const g = buildHair(H, { style, beard: 'full', acc: [...acc] }, { tier: 'desktop', winding: w });
      let wrong = 0;
      for (let v = 0; v < g.verts; v++) {
        const band = Math.min(3, Math.floor(g.UV[v * 2] * 4 + 1e-6));
        const hairy = g.kind[v] === K.hair || g.kind[v] === K.beard;
        if (hairy ? band === 3 : band !== 3) wrong++;
        seen.add(`${g.kind[v]}`);
      }
      expect(wrong, style).toBe(0);
    }
    expect(seen.has(`${K.fabric}`) && seen.has(`${K.acc}`) && seen.has(`${K.hair}`) && seen.has(`${K.beard}`)).toBe(true);
    s.root.dispose();
  });
  it('a beard\'s edge is feathered (partial coverage the alpha test dithers away), its middle solid; stubble is sparse', () => {
    const s = spawn('male');
    const H = field(s), w = winding(s);
    for (const b of ['full', 'long', 'stubble'] as const) {
      const g = buildHair(H, { style: 'Bald', beard: b, acc: [] }, { tier: 'desktop', winding: w });
      let solid = 0, feather = 0, n = 0;
      for (let v = 0; v < g.verts; v++) {
        if (g.kind[v] !== K.beard) continue;
        n++;
        if (g.alpha[v] > 0.97) solid++;
        else if (g.alpha[v] > HAIR_ALPHA_CUT - 0.05) feather++;
      }
      if (b === 'stubble') expect(solid, b).toBe(0);
      else { expect(solid / n, b).toBeGreaterThan(0.1); expect(feather / n, b).toBeGreaterThan(0.1); }
    }
    s.root.dispose();
  });
  it('long hair falls in clumps that taper to ragged, thinning tips (not a board cut square)', () => {
    const s = spawn('female');
    const H = field(s), w = winding(s);
    for (const style of ['Straight', 'Wavy', 'Curly', 'Long Layered']) {
      const g = buildHair(H, { style, beard: null, acc: [] }, { tier: 'desktop', winding: w });
      let tipA = 0, tipN = 0;
      const ends = new Set<number>();
      for (let v = 0; v < g.verts; v++) {
        if (g.kind[v] !== K.hair || g.chain[v] < 0) continue;
        if (g.along[v] > 0.95) { tipA += g.alpha[v]; tipN++; ends.add(Math.round(g.hf[v * 3 + 1] * 100)); }
      }
      expect(tipN, style).toBeGreaterThan(0);
      // (the clump tips are at ~0.5 coverage; the dark under-curtain's hem, solid, is averaged in)
      expect(tipA / tipN, style).toBeLessThan(0.75);
      // the ends lie at many heights (ragged), not one line
      expect(ends.size, style).toBeGreaterThan(5);
    }
    s.root.dispose();
  });
});

void ([] as Mesh[]);
