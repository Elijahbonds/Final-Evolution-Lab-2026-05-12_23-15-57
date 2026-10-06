// Glow paint (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c): the `glow` blend's emission, on the compositor's synthetic map
// (the same four 32 × 32 quadrants composite.test.ts uses) and on the REAL kit body through the identity pipe: the
// emissive texture is made only while a layer glows, sized by tier, capped on a phone, bound and released.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import { Vector3, type AssetContainer, type Mesh, type PBRMaterial, type TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ATOM_COUNT, GROUP_COUNT, atomIndex, type Atom } from './bodyChart';
import { ANG_Q, T_Q, buildTiles, type SurfaceMap } from './rasterise';
import { compileLayers, compositeDirty, dirtyTiles, type ChartInfo, type EmitBuffer, type PaintBuffers } from './composite';
import { GLOW_LAYER_CAP, GLOW_SHIFT, PAINT_SIZES, flushPaint, glowBufferOf, paintBufferOf, paintStats, setPaintBaseReader } from './renderPaint';
import { isPaintBody } from './surfaceMap';
import { sanitizeCreatorDoc, sanitizePaintLayer } from '../../../creator/look/sanitize';
import { decodeShareCode, encodeShareCode } from '../../../creator/look/shareCode';
import type { CreatorDoc, PaintLayer } from '../../../creator/look/doc';
import { applyIdentity, type PlayerIdentity } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { defaultFace } from '../../../closet/wearable-catalog';
import { payloadHasImage } from '../../../creator/lookPrivacy';

// ── the synthetic map (composite.test.ts's) ──────────────────────────────────────────────────────────────────────────
const SIZE = 64;
const QUAD: Atom[] = ['torsoFront', 'torsoBack', 'upperArmL', 'upperArmR'];
function synthMap(): SurfaceMap {
  const label = new Uint8Array(SIZE * SIZE), ang = new Int16Array(SIZE * SIZE), tt = new Int16Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x, q = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1);
    label[i] = atomIndex(QUAD[q]) + 1;
    let a = ((x % 32) - 16) * 0.01;
    if (QUAD[q] === 'torsoBack') a = a > 0 ? Math.PI - a : -Math.PI - a;
    ang[i] = Math.round(a * ANG_Q); tt[i] = Math.round((y % 32) * 0.004 * T_Q);
  }
  return { size: SIZE, label, ang, tt, covered: new Uint8Array(SIZE * SIZE).fill(1), tiles: buildTiles(label, ang, tt, SIZE), metresPerTexel: 0.0015, overlaps: 0 };
}
const map = synthMap();
const NT = map.tiles.n * map.tiles.n;
const extent = new Float32Array(ATOM_COUNT * 4);
for (let a = 0; a < ATOM_COUNT; a++) extent.set([0, 31 * 0.004, 16 * 0.01 * 0.15, 16 * 0.01 * 0.15], a * 4);
const chart: ChartInfo = { radius: new Float32Array(GROUP_COUNT).fill(0.15), extent };
const L = (o: Partial<PaintLayer> & { id: string }): PaintLayer => sanitizePaintLayer({ type: 'fill', region: 'torsoFront', surface: 'both', at: {}, colours: ['#FF0000'], opacity: 1, ...o })!;

function render(layers: PaintLayer[], shift = 1, glowCap = Infinity) {
  const emit: EmitBuffer = { buf: new Uint8Array((SIZE >> shift) ** 2 * 4), size: SIZE >> shift, shift };
  const B: PaintBuffers = { map, base: new Uint8Array(SIZE * SIZE * 4).fill(200), flat: [0, 0, 0], tint: [1, 1, 1], out: new Uint8Array(SIZE * SIZE * 4), aa: map.metresPerTexel, radius: chart.radius, emit };
  const compiled = compileLayers(layers, chart, { target: 'skin', suit: false, aa: B.aa, glowCap });
  compositeDirty(B, compiled, new Uint8Array(NT).fill(1));
  return { B, emit, compiled };
}
const epx = (e: EmitBuffer, x: number, y: number) => Array.from(e.buf.slice(((y >> e.shift) * e.size + (x >> e.shift)) * 4, ((y >> e.shift) * e.size + (x >> e.shift)) * 4 + 4));
const apx = (B: PaintBuffers, x: number, y: number) => Array.from(B.out.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4));

describe('the glow blend in the compositor', () => {
  it('paints over like normal AND lights its region; everywhere else stays dark', () => {
    const { B, emit } = render([L({ id: 'g', blend: 'glow', colours: ['#00FF80'] })]);
    expect(apx(B, 5, 5)).toEqual([0, 255, 128, 255]);
    expect(epx(emit, 5, 5)).toEqual([0, 255, 128, 255]);
    expect(epx(emit, 40, 5)).toEqual([0, 0, 0, 0]);
    expect(epx(emit, 5, 40)).toEqual([0, 0, 0, 0]);
  });
  it('a normal or multiply layer has no emission at all; a normal layer over a glow covers it, opacity in proportion', () => {
    expect(render([L({ id: 'a' }), L({ id: 'b', blend: 'multiply' })]).emit.buf.every((v) => v === 0)).toBe(true);
    const covered = render([L({ id: 'g', blend: 'glow', colours: ['#FFFFFF'] }), L({ id: 'n', colours: ['#000000'] })]);
    expect(epx(covered.emit, 5, 5).slice(0, 3)).toEqual([0, 0, 0]);
    const half = render([L({ id: 'g', blend: 'glow', colours: ['#FFFFFF'] }), L({ id: 'n', colours: ['#000000'], opacity: 0.5 })]);
    expect(epx(half.emit, 5, 5).slice(0, 3)).toEqual([128, 128, 128]);
  });
  it('the emission buffer is the paint\'s size >> shift, and a tile redraw recomputes (never accumulates) its block', () => {
    const r = render([L({ id: 'g', blend: 'glow' })], 2);
    expect(r.emit.size).toBe(16);
    // move the glow off the chest: redraw only the dirty tiles; the chest's emission goes dark
    const next = compileLayers([L({ id: 'g', blend: 'glow', region: 'torsoBack' })], chart, { target: 'skin', suit: false, aa: r.B.aa });
    const dirty = new Uint8Array(NT);
    dirtyTiles(r.compiled, next, map, dirty);
    compositeDirty(r.B, next, dirty);
    expect(epx(r.emit, 5, 5).slice(0, 3)).toEqual([0, 0, 0]);
    expect(epx(r.emit, 40, 5).slice(0, 3)).toEqual([255, 0, 0]);
  });
  it('past the glow cap a glow layer paints as normal (and its signature says so, so a cap change redraws it)', () => {
    const layers = [L({ id: 'a', blend: 'glow', colours: ['#FF0000'] }), L({ id: 'b', blend: 'glow', region: 'torsoBack', colours: ['#00FF00'] })];
    const r = render(layers, 1, 1);
    expect(r.compiled.map((c) => c.glow)).toEqual([true, false]);
    expect(epx(r.emit, 40, 5).slice(0, 3)).toEqual([0, 0, 0]);
    expect(apx(r.B, 40, 5)).toEqual([0, 255, 0, 255]);
    expect(r.compiled[1].sig).not.toBe(compileLayers(layers, chart, { target: 'skin', suit: false, aa: 0.0015 })[1].sig);
  });
  it('the doc field: sanitised, round-trips a share code, never trips the image refusal', () => {
    expect(L({ id: 'g', blend: 'glow' }).blend).toBe('glow');
    expect(L({ id: 'g', blend: 'neon' as never }).blend).toBeUndefined();
    const d = sanitizeCreatorDoc({ v: 1, paint: [L({ id: 'g', blend: 'glow' })] })!;
    expect(decodeShareCode(encodeShareCode(d))).toMatchObject({ ok: true, doc: d });
    expect(payloadHasImage(d)).toBe(false);
  });
});

// ── the real kit body ────────────────────────────────────────────────────────────────────────────────────────────────
const GLB = () => `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`;
let mobile: Scene, desktop: Scene, kitM: AssetContainer, kitD: AssetContainer;
beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  mobile = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), mobile); mobile.metadata = { felTier: 'mobile' };
  desktop = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), desktop);
  kitM = await SceneLoader.LoadAssetContainerAsync('', GLB(), mobile, undefined, '.glb');
  kitD = await SceneLoader.LoadAssetContainerAsync('', GLB(), desktop, undefined, '.glb');
}, 120_000);
afterAll(() => setPaintBaseReader(null));
let n = 0;
function body(c: AssetContainer): SpawnedCharacter {
  const inst = c.instantiateModelsToScene((x) => `${x}_g${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  return { id: `g${n}`, root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
}
const ID = (creator: CreatorDoc | null): PlayerIdentity => ({
  proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null, wardrobe: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' }, custom: true, body: 'kit-male', creator,
});
const doc = (paint: Partial<PaintLayer>[]) => sanitizeCreatorDoc({ v: 1, paint: paint.map((p, i) => ({ id: `l${i}`, type: 'fill', region: 'torsoFront', surface: 'skin', at: {}, colours: ['#00E5FF'], opacity: 1, ...p })) })!;
const skin = (s: SpawnedCharacter) => s.meshes.find((m) => isPaintBody(m.name)) as Mesh;

describe('glow on the body', () => {
  it('no glow layer: no glow buffer, no glow texture, the emissive channel untouched', () => {
    const s = body(kitD);
    const mat0 = skin(s).material as PBRMaterial;
    const before = mat0.emissiveTexture;
    applyIdentity(s, ID(doc([{}])));
    flushPaint(s.root);
    expect(glowBufferOf(s.root, skin(s))).toBeNull();
    expect(paintStats(s.root)!.targets[0].glowSize).toBe(0);
    expect((skin(s).material as PBRMaterial).emissiveTexture).toBe(before);
    s.root.dispose();
  });

  for (const [tier, c] of [['desktop', () => kitD], ['mobile', () => kitM]] as const) {
    it(`${tier}: a glow layer gets an emissive texture at the paint's size >> ${GLOW_SHIFT[tier]}, bound; removing it restores the material`, () => {
      const s = body(c());
      const mat = skin(s).material as PBRMaterial;
      const emissive0 = mat.emissiveColor.clone();
      applyIdentity(s, ID(doc([{ blend: 'glow', type: 'pattern', pattern: 'lines', weight: 0.2 }])));
      flushPaint(s.root);
      const st = paintStats(s.root)!.targets.find((t) => t.kind === 'skin')!;
      expect(st.glowSize).toBe(PAINT_SIZES[tier].skin >> GLOW_SHIFT[tier]);
      expect(st.glowBound).toBe(true);
      const m = skin(s).material as PBRMaterial;
      expect([m.emissiveColor.r, m.emissiveColor.g, m.emissiveColor.b]).toEqual([1, 1, 1]);
      const E = glowBufferOf(s.root, skin(s))!;
      let lit = 0; for (let i = 0; i < E.buf.length; i += 4) if (E.buf[i + 1] > 0) lit++;
      expect(lit).toBeGreaterThan(0);
      expect(lit).toBeLessThan(E.size * E.size / 4);   // the chest's lines, not the whole body
      // the paint's albedo still shows the layer too
      expect(paintBufferOf(s.root, skin(s))).not.toBeNull();
      // back to a normal layer: the glow goes, the material's emissive is what it was
      applyIdentity(s, ID(doc([{ type: 'pattern', pattern: 'lines', weight: 0.2 }])));
      flushPaint(s.root);
      expect(glowBufferOf(s.root, skin(s))).toBeNull();
      expect((skin(s).material as PBRMaterial).emissiveTexture).toBeNull();
      expect((skin(s).material as PBRMaterial).emissiveColor.equals(emissive0)).toBe(true);
      s.root.dispose();
    });
  }

  it('the phone caps how many layers glow; desktop lets more glow', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ blend: 'glow' as const, region: (['torsoFront', 'torsoBack', 'armLeft', 'armRight', 'legLeft', 'legRight'] as const)[i], colours: ['#FF00FF'] }));
    const lit = (c: AssetContainer) => {
      const s = body(c); applyIdentity(s, ID(doc(many))); flushPaint(s.root);
      const E = glowBufferOf(s.root, skin(s))!;
      // the share of the glow texture lit: the glowing regions cover it, the capped ones do not
      let on = 0; for (let i = 0; i < E.buf.length; i += 4) if (E.buf[i] > 0) on++;
      s.root.dispose(); return on / (E.size * E.size);
    };
    expect(GLOW_LAYER_CAP.mobile).toBeLessThan(6);
    expect(lit(kitD)).toBeGreaterThan(lit(kitM) * 1.2);
  });

  it('memory: the glow adds ≤ 0.6 MiB on a phone and ≤ 9.4 MiB on desktop (CPU buffer + GPU with mips), measured', () => {
    const cost = (c: AssetContainer, glow: boolean) => {
      const s = body(c); applyIdentity(s, ID(doc([{ blend: glow ? 'glow' : undefined }]))); flushPaint(s.root);
      const st = paintStats(s.root)!; s.root.dispose(); return st.cpuBytes + st.gpuBytes;
    };
    const mob = cost(kitM, true) - cost(kitM, false), desk = cost(kitD, true) - cost(kitD, false);
    console.log(`[glow] extra bytes: mobile ${mob} (${(mob / 2 ** 20).toFixed(2)} MiB), desktop ${desk} (${(desk / 2 ** 20).toFixed(2)} MiB)`);
    expect(mob).toBeLessThanOrEqual(0.6 * 2 ** 20);
    expect(desk).toBeLessThanOrEqual(9.4 * 2 ** 20);
  });
});
