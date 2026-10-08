// The paint REGIONS and CHART on the real kit bodies (fel-kit-male.glb and fel-kit-female.glb in a NullEngine):
// IMPROVE (2026-10-06), CREATOR-PLAN phase 3. Regions come from the skin weights; this checks they cover the body with
// no gaps and no double counting, that the two sides of every UV seam agree, and that left and right mirror.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AssetContainer, Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ATOMS, ATOM_COUNT, ATOM_GROUP, ATOM_MIRROR, GROUP_COUNT, classify, type BodyChart, type Classified } from './bodyChart';
import { ANG_Q, T_Q, type SurfaceMap } from './rasterise';
import { chartForBody, fullIndices, geometryKey, isPaintBody, restSkin, surfaceMapFor } from './surfaceMap';

const SIZE = 512;
interface Kit { body: Mesh; meshes: Mesh[]; chart: BodyChart; map: SurfaceMap; cls: Classified; P: Float32Array }
const kits: Record<'male' | 'female', Kit> = {} as never;

beforeAll(async () => {
  for (const sex of ['male', 'female'] as const) {
    const scene = new Scene(new NullEngine());
    scene.activeCamera = new ArcRotateCamera('c', 0, 1, 3, Vector3.Zero(), scene);
    const c: AssetContainer = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(`public/models/candidates/fel-kit-${sex}.glb`).toString('base64')}`, scene, undefined, '.glb');
    const inst = c.instantiateModelsToScene((x) => `${x}_c1`, false, { doNotInstantiate: true });
    for (const g of inst.animationGroups) g.stop();
    const meshes = (inst.rootNodes[0] as TransformNode).getChildMeshes() as Mesh[];
    const body = meshes.find((m) => isPaintBody(m.name))!;
    const chart = chartForBody(body)!;
    const skin = restSkin(body)!;
    kits[sex] = { body, meshes, chart, map: surfaceMapFor(body, chart, geometryKey(body), SIZE)!, cls: classify(chart, skin), P: skin.P };
  }
}, 120_000);

const each = (fn: (k: Kit, sex: string) => void) => { for (const sex of ['male', 'female'] as const) fn(kits[sex], sex); };
const argmax = (w: Float32Array, v: number) => { let b = -1, bw = 0; for (let a = 0; a < ATOM_COUNT; a++) if (w[v * ATOM_COUNT + a] > bw) { bw = w[v * ATOM_COUNT + a]; b = a; } return b; };

describe('regions from the skin weights', () => {
  it('every vertex\'s region weights sum to 1 (they ARE its bone weights, grouped and split)', () => each((k, sex) => {
    let worst = 0;
    for (let v = 0; v < k.cls.n; v++) { let s = 0; for (let a = 0; a < ATOM_COUNT; a++) s += k.cls.atomW[v * ATOM_COUNT + a]; worst = Math.max(worst, Math.abs(s - 1)); }
    expect(worst, sex).toBeLessThan(0.01);
  }));

  it('the masks cover the body: every triangle\'s centre texel carries a region, the one its vertices say (no gaps)', () => each((k, sex) => {
    const uv = k.body.getVerticesData('uv')!, ind = fullIndices(k.body)!;
    let tested = 0, gaps = 0, wrong = 0;
    for (let f = 0; f < ind.length; f += 3) {
      const [a, b, c] = [ind[f], ind[f + 1], ind[f + 2]];
      const ux = [uv[a * 2], uv[b * 2], uv[c * 2]].map((u) => u * SIZE), uy = [uv[a * 2 + 1], uv[b * 2 + 1], uv[c * 2 + 1]].map((u) => u * SIZE);
      const area = Math.abs((ux[1] - ux[0]) * (uy[2] - uy[0]) - (ux[2] - ux[0]) * (uy[1] - uy[0])) / 2;
      if (area < 2) continue;   // a triangle under two texels has no texel centre of its own to test
      tested++;
      const x = Math.floor((ux[0] + ux[1] + ux[2]) / 3), y = Math.floor((uy[0] + uy[1] + uy[2]) / 3);
      const lab = k.map.label[y * SIZE + x];
      if (!lab) { gaps++; continue; }
      // the centroid's region by the interpolated weights (equal thirds)
      let best = -1, bw = 0;
      for (let at = 0; at < ATOM_COUNT; at++) { const w = (k.cls.atomW[a * ATOM_COUNT + at] + k.cls.atomW[b * ATOM_COUNT + at] + k.cls.atomW[c * ATOM_COUNT + at]) / 3; if (w > bw) { bw = w; best = at; } }
      if (lab !== best + 1) wrong++;
    }
    expect(tested, sex).toBeGreaterThan(5000);
    expect(gaps, sex).toBe(0);
    // a centroid texel's centre is up to half a texel from the true centroid: a few land across a region boundary
    expect(wrong / tested, sex).toBeLessThan(0.01);
  }));

  it('the masks are padded past every UV island\'s edge (so sampling and mipmaps never pull in unpainted skin)', () => each((k, sex) => {
    const pad = Math.max(2, Math.round(SIZE / 256));
    let near = 0, unlabelled = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (k.map.covered[i]) continue;
      let close = false;
      for (let dy = -pad; dy <= pad && !close; dy++) for (let dx = -pad; dx <= pad; dx++) {
        const X = x + dx, Y = y + dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= pad && X >= 0 && Y >= 0 && X < SIZE && Y < SIZE && k.map.covered[Y * SIZE + X]) { close = true; break; }
      }
      if (!close) continue;
      near++;
      if (!k.map.label[i]) unlabelled++;
    }
    expect(near, sex).toBeGreaterThan(1000);
    expect(unlabelled, sex).toBe(0);
  }));

  it('no double counting: no texel is claimed by two triangles of different regions (the body\'s UVs never overlap)', () => each((k, sex) => {
    expect(k.map.overlaps, sex).toBe(0);
  }));

  it('both sides of every UV seam agree: same region, and the same chart position to within a few mm', () => each((k, sex) => {
    // vertices split along a UV seam share a position; sample the map just inside each side's triangle
    const uv = k.body.getVerticesData('uv')!, ind = fullIndices(k.body)!;
    const byPos = new Map<string, number[]>();
    for (let v = 0; v < k.cls.n; v++) {
      const key = `${Math.round(k.P[v * 3] * 2e4)},${Math.round(k.P[v * 3 + 1] * 2e4)},${Math.round(k.P[v * 3 + 2] * 2e4)}`;
      (byPos.get(key) ?? byPos.set(key, []).get(key)!).push(v);
    }
    const triOf = new Map<number, number>();
    for (let f = 0; f < ind.length; f += 3) for (let k2 = 0; k2 < 3; k2++) if (!triOf.has(ind[f + k2])) triOf.set(ind[f + k2], f);
    // a point 1.5 texels in from the vertex towards its triangle's middle: its texel, and where it is on the body
    const sample = (v: number) => {
      const f = triOf.get(v)!;
      const tri = [ind[f], ind[f + 1], ind[f + 2]];
      const cx = tri.reduce((s2, i) => s2 + uv[i * 2], 0) / 3, cy = tri.reduce((s2, i) => s2 + uv[i * 2 + 1], 0) / 3;
      const dx = cx - uv[v * 2], dy = cy - uv[v * 2 + 1], d = Math.hypot(dx, dy) * SIZE || 1;
      const step = Math.min(1.5, d * 0.5) / d;
      const sx = uv[v * 2] + dx * step, sy = uv[v * 2 + 1] + dy * step;
      // the same point as barycentric weights: the vertex (1 − step) and the centroid (step)
      const w = tri.map((i) => (i === v ? 1 - step : 0) + step / 3);
      const p = [0, 1, 2].map((c) => tri.reduce((s2, i, j) => s2 + w[j] * k.P[i * 3 + c], 0));
      return { i: Math.floor(sy * SIZE) * SIZE + Math.floor(sx * SIZE), p };
    };
    let pairs = 0, labelMismatch = 0;
    const dist: number[] = [];
    for (const vs of byPos.values()) {
      if (vs.length < 2) continue;
      const a = vs[0];
      for (const b of vs.slice(1)) {
        if (Math.abs(uv[a * 2] - uv[b * 2]) < 1e-4 && Math.abs(uv[a * 2 + 1] - uv[b * 2 + 1]) < 1e-4) continue;   // not a UV seam
        if (!triOf.has(a) || !triOf.has(b)) continue;
        pairs++;
        const A = sample(a), B = sample(b), ia = A.i, ib = B.i;
        const la = k.map.label[ia], lb = k.map.label[ib];
        // a seam vertex that sits ON a region boundary may fall either way; only a clear one must agree
        const clear = k.cls.atomW[a * ATOM_COUNT + argmax(k.cls.atomW, a)] > 0.75;
        if (la !== lb) { if (clear) labelMismatch++; continue; }
        const g = ATOM_GROUP[la - 1], R = k.chart.groups[g].radius;
        let da = Math.abs(k.map.ang[ia] - k.map.ang[ib]) / ANG_Q; if (da > Math.PI) da = 2 * Math.PI - da;
        // a seam is continuous when the chart moves as far as the body does between the two samples
        const onChart = Math.hypot(da * R, (k.map.tt[ia] - k.map.tt[ib]) / T_Q);
        const onBody = Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1], A.p[2] - B.p[2]);
        dist.push(Math.abs(onChart - onBody));
      }
    }
    dist.sort((x, y) => x - y);
    const p95 = dist[Math.floor(dist.length * 0.95)], max = dist[dist.length - 1];
    console.info(`[paint seams ${sex}] ${pairs} seam pairs, ${labelMismatch} clear label mismatches; chart step across the seam p95 ${(p95 * 1000).toFixed(1)} mm, max ${(max * 1000).toFixed(1)} mm (texel ${(k.map.metresPerTexel * 1000).toFixed(1)} mm)`);
    expect(pairs, sex).toBeGreaterThan(200);
    expect(labelMismatch / pairs, sex).toBeLessThan(0.01);
    // measured 2026-10-06 (see the log line): the chart steps by under two texels across 95% of seam points. The
    // largest steps are where a cylinder chart has its pole (the crown of the head, the fingertips, the toes), where a
    // centimetre on the body is a large turn of the angle: a pattern pinches there, as on any wrapped cylinder.
    expect(p95, sex).toBeLessThan(2 * k.map.metresPerTexel);
  }));

  it('every region is on the body, and left and right mirror (texel counts within 5%, the same extents)', () => each((k, sex) => {
    const counts = new Array(ATOM_COUNT + 1).fill(0);
    for (let i = 0; i < k.map.label.length; i++) if (k.map.covered[i]) counts[k.map.label[i]]++;
    for (let a = 0; a < ATOM_COUNT; a++) {
      expect(counts[a + 1], `${sex} ${ATOMS[a]}`).toBeGreaterThan(200);
      const m = ATOM_MIRROR[a];
      if (m !== a) expect(Math.abs(counts[a + 1] - counts[m + 1]) / counts[a + 1], `${sex} ${ATOMS[a]}`).toBeLessThan(0.05);
    }
    for (let a = 0; a < ATOM_COUNT; a++) for (let q = 0; q < 4; q++) expect(k.chart.extent[a * 4 + q]).toBe(k.chart.extent[ATOM_MIRROR[a] * 4 + q]);
  }));

  it('the face is the front of the head, the torso front is in front of the back, the hands are at the ends of the arms', () => each((k, sex) => {
    const { fwd, left } = k.chart;
    const mean = (atom: string, axis: number[]) => {
      const a = ATOMS.indexOf(atom as never); let s = 0, n = 0;
      for (let v = 0; v < k.cls.n; v++) if (argmax(k.cls.atomW, v) === a) { s += k.P[v * 3] * axis[0] + k.P[v * 3 + 1] * axis[1] + k.P[v * 3 + 2] * axis[2]; n++; }
      return s / n;
    };
    expect(mean('face', fwd), sex).toBeGreaterThan(mean('scalp', fwd) + 0.04);
    expect(mean('torsoFront', fwd), sex).toBeGreaterThan(mean('torsoBack', fwd) + 0.08);
    expect(mean('handL', left), sex).toBeGreaterThan(mean('forearmL', left));
    expect(mean('handR', left), sex).toBeLessThan(mean('forearmR', left));
    expect(mean('upperArmL', left), sex).toBeGreaterThan(0.15);
  }));

  it('the chart reads right-to-left as you face the surface: on the chest the angle grows towards the body\'s left', () => each((k, sex) => {
    const torso = 1;
    let c = 0, n = 0;
    for (let v = 0; v < k.cls.n; v++) {
      if (ATOMS[argmax(k.cls.atomW, v)] !== 'torsoFront') continue;
      const side = k.P[v * 3] * k.chart.left[0] + k.P[v * 3 + 1] * k.chart.left[1] + k.P[v * 3 + 2] * k.chart.left[2];
      if (Math.abs(side) < 0.05) continue;
      n++; if (Math.sign(k.cls.ang[v * GROUP_COUNT + torso]) === Math.sign(side - (k.chart.groups[torso].o[0] * k.chart.left[0] + k.chart.groups[torso].o[1] * k.chart.left[1] + k.chart.groups[torso].o[2] * k.chart.left[2]))) c++;
    }
    expect(c / n, sex).toBeGreaterThan(0.98);
  }));

  it('garments are classified with the body\'s chart: the shirt is torso and upper arms, the shoes shins and feet', () => each((k, sex) => {
    const regions = (re: RegExp) => {
      const m = k.meshes.find((x) => re.test(x.name))!;
      const c = classify(k.chart, restSkin(m)!);
      const seen = new Set<string>();
      for (let v = 0; v < c.n; v++) seen.add(ATOMS[argmax(c.atomW, v)]);
      return seen;
    };
    for (const r of regions(/^Kit_tops_top_bonds/)) expect(['torsoFront', 'torsoBack', 'upperArmL', 'upperArmR', 'thighL', 'thighR', 'neck'], `${sex} top ${r}`).toContain(r);
    for (const r of regions(/^Kit_shoes_shoes_flight/)) expect(['shinL', 'shinR', 'footL', 'footR'], `${sex} shoe ${r}`).toContain(r);
  }));
});
