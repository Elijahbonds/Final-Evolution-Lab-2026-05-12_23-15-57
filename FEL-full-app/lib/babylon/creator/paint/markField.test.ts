// Player-drawn stamps on the body (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c): the mark's distance field, a drawn disc
// drawing like the library's circle stamp in the compositor, and a drawn stamp painted onto the REAL kit body through the
// identity pipe.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { MARK_SIZE, brushMark, discMark, emptyMark, encodeMark } from '../../../creator/look/marks';
import { sanitizeCreatorDoc, sanitizePaintLayer } from '../../../creator/look/sanitize';
import type { PaintLayer } from '../../../creator/look/doc';
import { markField, sampleMark } from './markField';
import { ATOM_COUNT, GROUP_COUNT, atomIndex, type Atom } from './bodyChart';
import { ANG_Q, T_Q, buildTiles, type SurfaceMap } from './rasterise';
import { compileLayers, compositeDirty, type ChartInfo, type PaintBuffers } from './composite';
import { flushPaint, paintBufferOf, setPaintBaseReader } from './renderPaint';
import { isPaintBody } from './surfaceMap';
import { applyIdentity, type PlayerIdentity } from '../../core/playerIdentity';
import type { SpawnedCharacter } from '../../core/CharacterLibrary';
import { defaultFace } from '../../../closet/wearable-catalog';

describe('the distance field', () => {
  it('a drawn disc measures like a disc: negative inside, the edge at its radius, positive outside', () => {
    const r = 40;   // cells
    const f = markField(encodeMark(brushMark(emptyMark(), MARK_SIZE / 2, MARK_SIZE / 2, r, true))!)!;
    const R = (2 * r) / MARK_SIZE;   // in the unit square
    expect(sampleMark(f, 0, 0)).toBeCloseTo(-R, 1);
    for (const a of [0, 0.7, 1.9, 3.3, 4.4]) {
      expect(Math.abs(sampleMark(f, Math.cos(a) * R, Math.sin(a) * R)), `edge at ${a}`).toBeLessThan(0.03);
      expect(sampleMark(f, Math.cos(a) * R * 1.4, Math.sin(a) * R * 1.4)).toBeCloseTo(0.4 * R, 1);
    }
    // outside the pad the distance keeps growing (an outline never wraps round the pad's edge)
    expect(sampleMark(f, 1.5, 0)).toBeGreaterThan(sampleMark(f, 1, 0));
  });
  it('y is up: a mark inked only in the pad\'s top rows is inside near y = 1, not y = −1', () => {
    const c = emptyMark(); c.fill(1, 0, MARK_SIZE * 8);
    const f = markField(encodeMark(c)!)!;
    expect(sampleMark(f, 0, 0.97)).toBeLessThan(0);
    expect(sampleMark(f, 0, -0.97)).toBeGreaterThan(0);
  });
  it('is built once per mark and an invalid text gives none', () => {
    const t = encodeMark(discMark())!;
    expect(markField(t)).toBe(markField(t));
    expect(markField('rnope')).toBeNull();
  });
});

// ── in the compositor (composite.test.ts's synthetic map) ────────────────────────────────────────────────────────────
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
const extent = new Float32Array(ATOM_COUNT * 4);
for (let a = 0; a < ATOM_COUNT; a++) extent.set([0, 31 * 0.004, 16 * 0.01 * 0.15, 16 * 0.01 * 0.15], a * 4);
const chart: ChartInfo = { radius: new Float32Array(GROUP_COUNT).fill(0.15), extent };
function inked(layer: Partial<PaintLayer>, marks = [] as { id: string; data: string }[]): number {
  const l = sanitizePaintLayer({ id: 'a', region: 'torsoFront', surface: 'both', at: { scale: 0.6 }, colours: ['#FF0000'], opacity: 1, ...layer })!;
  const B: PaintBuffers = { map, base: new Uint8Array(SIZE * SIZE * 4).fill(200), flat: [0, 0, 0], tint: [1, 1, 1], out: new Uint8Array(SIZE * SIZE * 4), aa: map.metresPerTexel, radius: chart.radius };
  compositeDirty(B, compileLayers([l], chart, { target: 'skin', suit: false, aa: B.aa, marks }), new Uint8Array(map.tiles.n ** 2).fill(1));
  let n = 0; for (let i = 0; i < SIZE * SIZE; i++) if (B.out[i * 4] > 230 && B.out[i * 4 + 1] < 30) n++;
  return n;
}

describe('a drawn stamp in the compositor', () => {
  it('a drawn disc covers what the library\'s circle stamp covers (within a few texels)', () => {
    // the circle stamp is radius 0.92 of its unit square: draw the same disc on the pad
    const disc = encodeMark(brushMark(emptyMark(), MARK_SIZE / 2, MARK_SIZE / 2, 0.92 * MARK_SIZE / 2, true))!;
    const circle = inked({ type: 'stamp', stamp: 'circle' });
    const drawn = inked({ type: 'mark', mark: 'm1' }, [{ id: 'm1', data: disc }]);
    expect(circle).toBeGreaterThan(50);
    expect(Math.abs(drawn - circle)).toBeLessThanOrEqual(Math.max(4, circle * 0.06));
  });
  it('a mark layer whose mark is missing draws nothing', () => {
    expect(inked({ type: 'mark', mark: 'm9' }, [])).toBe(0);
  });
});

// ── the real kit body ────────────────────────────────────────────────────────────────────────────────────────────────
let scene: Scene; let kit: AssetContainer;
beforeAll(async () => {
  setPaintBaseReader((_t, size) => new Uint8Array(size * size * 4).fill(128));
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); scene.metadata = { felTier: 'mobile' };
  kit = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64')}`, scene, undefined, '.glb');
}, 90_000);
afterAll(() => setPaintBaseReader(null));

describe('a drawn stamp on the body', () => {
  it('paints the chest through applyIdentity, and redrawing the mark changes the paint', () => {
    const inst = kit.instantiateModelsToScene((x) => `${x}_mk1`, false, { doNotInstantiate: true });
    for (const g of inst.animationGroups) g.stop();
    const root = inst.rootNodes[0] as TransformNode;
    const s = { id: 'mk', root, meshes: root.getChildMeshes(), skeleton: inst.skeletons[0] } as unknown as SpawnedCharacter;
    const ID = (data: string): PlayerIdentity => ({
      proportions: null, face: defaultFace(), palette: { jersey: '#00E5FF', shorts: '#0B1220', shoes: '#A855F7', accent: '#FFD700' }, jersey: null,
      wardrobe: {}, custom: true, body: 'kit-male',
      creator: sanitizeCreatorDoc({ v: 1, flags: { suit: true }, marks: [{ id: 'm1', data }], paint: [{ id: 'l1', type: 'mark', mark: 'm1', region: 'torsoFront', surface: 'skin', at: { scale: 2 }, colours: ['#FF0000'], opacity: 1 }] }),
    });
    const red = (buf: Uint8Array) => { let n = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] > 230 && buf[i + 1] < 30 && buf[i + 2] < 30) n++; return n; };
    const skin = s.meshes.find((m) => isPaintBody(m.name)) as Mesh;
    applyIdentity(s, ID(encodeMark(discMark())!));
    flushPaint(s.root);
    const big = red(paintBufferOf(s.root, skin)!);
    expect(big).toBeGreaterThan(500);
    applyIdentity(s, ID(encodeMark(brushMark(emptyMark(), 64, 64, 15, true))!));
    flushPaint(s.root);
    const small = red(paintBufferOf(s.root, skin)!);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(big * 0.5);
    s.root.dispose();
  });
});
