/**
 * measure-surface — calibrates baked venue maps against the gameplay
 * invariant floorY=0 ("swapping the visual shell is safe",
 * components/three/procedural-map.tsx).
 *
 * Babylon's own ray picking is unreliable on these GLBs (the glTF root's
 * negative-determinant scale flip defeats it — see commit history), so this
 * probe works directly on world-space triangles after applying the EXACT
 * runtime transform from lib/map-data.ts (scale → rotationY → mapOffset),
 * the same order lib/babylon/visual/VenueMaps.ts uses.
 *
 * Per map it reports:
 *   surfaceY   — median down-cast hit at the play-centre sample grid. This is
 *                the value for `surfaceY` in lib/map-data.ts; VenueMaps
 *                subtracts it so the walking surface lands on y=0.
 *   coverage   — how many play-centre samples hit anything. Low coverage
 *                means the painted court is NOT under the gameplay (Venice
 *                blacktop keeps its court off-centre) and the map needs a
 *                mapOffset. For those, a density scan locates the largest
 *                flat up-facing region and prints the offset that would
 *                centre it.
 *
 * Run: npx tsx scripts/map/measure-surface.mts [map-key ...]
 */

import { NullEngine, Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// NOTE: dynamic import — tsx's static named-export analysis does not see
// through this project's CJS-default .ts modules, `await import` does.
const { MAPS } = (await import('../../lib/map-data.ts')) as typeof import('../../lib/map-data.ts');

const SAMPLES: Array<[number, number]> = [
  [0, 0],
  [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5],
  [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5],
  [3, 0], [-3, 0], [0, 3], [0, -3],
];

interface Tri { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number; ny: number }

async function loadTris(key: string): Promise<Tri[] | null> {
  const cfg = MAPS[key];
  const file = resolve(process.cwd(), 'public/models/maps/baked', `${key}.glb`);
  if (!existsSync(file)) return null;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const data = readFileSync(file);
    // NullEngine has no fetch/file IO — hand the loader a data: URL instead.
    const dataUrl = `data:model/gltf-binary;base64,${data.toString('base64')}`;
    const res = await SceneLoader.ImportMeshAsync('', '', dataUrl, scene, '.glb');
    const root = new TransformNode('probe-root', scene);
    for (const mesh of res.meshes) if (!mesh.parent) mesh.parent = root;
    root.scaling.setAll(cfg.scale);
    root.rotation.y = cfg.mapRotationY ?? 0;
    if (cfg.mapOffset) root.position.set(...cfg.mapOffset);
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    root.computeWorldMatrix(true);

    const tris: Tri[] = [];
    for (const mesh of res.meshes) {
      const pos = mesh.getVerticesData('position');
      const idx = mesh.getIndices();
      if (!pos || !idx) continue;
      const m = mesh.getWorldMatrix().m;
      const W = (i: number): [number, number, number] => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        return [
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ];
      };
      for (let t = 0; t < idx.length; t += 3) {
        const [ax, ay, az] = W(idx[t]);
        const [bx, by, bz] = W(idx[t + 1]);
        const [cx, cy, cz] = W(idx[t + 2]);
        // world-space normal Y (for up-facing filtering); sign-agnostic
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-12) continue;
        tris.push({ ax, ay, az, bx, by, bz, cx, cy, cz, ny: Math.abs(ny) / len });
      }
    }
    return tris;
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

/** Möller–Trumbore, double-sided, straight down from y=80 — returns ALL hit heights. */
function castDownAll(tris: Tri[], x: number, z: number): number[] {
  const hits: number[] = [];
  for (const t of tris) {
    const e1x = t.bx - t.ax, e1y = t.by - t.ay, e1z = t.bz - t.az;
    const e2x = t.cx - t.ax, e2y = t.cy - t.ay, e2z = t.cz - t.az;
    // d = (0,-1,0); p = d × e2 = (-e2z, 0, e2x)
    const px = -e2z, py = 0, pz = e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = x - t.ax, sy = 80 - t.ay, sz = z - t.az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    // q = s × e1
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    // v = d · q * inv = -qy * inv
    const v = -qy * inv;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt < 0) continue;
    hits.push(80 - tt);
  }
  return hits;
}

async function measure(key: string): Promise<void> {
  const tris = await loadTris(key);
  if (!tris) {
    console.log(`${key}: NO BAKED GLB (rejected by pipeline)`);
    return;
  }
  // Collect ALL hit heights per sample (down-casts hit roofs on enclosed
  // venues — the walking surface is a lower band, not the first hit).
  const allHits: number[] = [];
  let covered = 0;
  for (const [x, z] of SAMPLES) {
    const hs = castDownAll(tris, x, z);
    if (hs.length) covered++;
    allHits.push(...hs);
  }
  const coverage = covered / SAMPLES.length;
  if (coverage >= 0.6) {
    // Histogram into 0.25m bands; the walking surface is the densest band in
    // the plausible gameplay window [-4, +3] — bands above are roofs/stands,
    // bands below are terrain under the map (a valley floor is NOT the slope).
    allHits.sort((a, b) => a - b);
    const bands = new Map<number, number>();
    for (const h of allHits) {
      const b = Math.round(h / 0.25) * 0.25;
      bands.set(b, (bands.get(b) ?? 0) + 1);
    }
    const sortedBands = [...bands.entries()].sort((a, b) => a[0] - b[0]);
    const minBandCount = Math.max(2, Math.floor(SAMPLES.length * 0.25));
    const inWindow = sortedBands.filter(([b, n]) => b >= -4 && b <= 3 && n >= minBandCount);
    const floorBand = inWindow.sort((a, b) => b[1] - a[1])[0];
    if (floorBand) {
      // Median of hits within ±0.5m of the chosen band.
      const near = allHits.filter((h) => Math.abs(h - floorBand[0]) <= 0.5);
      const median = near[Math.floor(near.length / 2)];
      const roofNote = sortedBands[sortedBands.length - 1][0] > floorBand[0] + 2
        ? `  (other bands: ${sortedBands.filter(([b, n]) => Math.abs(b - floorBand[0]) > 1 && n >= 2).map(([b, n]) => `${b.toFixed(1)}×${n}`).join(', ') || '—'} — correctly ignored)`
        : '';
      console.log(`${key}: surfaceY=${median.toFixed(3)}  coverage ${covered}/${SAMPLES.length}  band ${floorBand[0].toFixed(2)}m×${floorBand[1]}${roofNote}`);
      return;
    }
    console.log(`${key}: coverage ${covered}/${SAMPLES.length} but no dense band — bands: ${sortedBands.map(([b, n]) => `${b.toFixed(1)}×${n}`).join(' ')}`);
    return;
  }

  // Low coverage — find the dominant flat up-facing region (the painted
  // court) and suggest the mapOffset that centres it on the play origin.
  const flat = tris.filter((t) => t.ny > 0.85);
  // Bin by 1m XZ cell, tracking population and mean height per cell.
  const cells = new Map<string, { n: number; ySum: number }>();
  for (const t of flat) {
    const mx = (t.ax + t.bx + t.cx) / 3, my = (t.ay + t.by + t.cy) / 3, mz = (t.az + t.bz + t.cz) / 3;
    const k = `${Math.round(mx)},${Math.round(mz)}`;
    const c = cells.get(k) ?? { n: 0, ySum: 0 };
    c.n++; c.ySum += my;
    cells.set(k, c);
  }
  // Densest 5x5 block of populated cells = the court.
  let bestScore = 0, bestCx = 0, bestCz = 0, bestY = 0;
  for (const [k] of cells) {
    const [gx, gz] = k.split(',').map(Number);
    let score = 0, ySum = 0, nSum = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const c = cells.get(`${gx + dx},${gz + dz}`);
      if (c) { score += c.n; ySum += c.ySum; nSum += c.n; }
    }
    if (score > bestScore) { bestScore = score; bestCx = gx; bestCz = gz; bestY = nSum ? ySum / nSum : 0; }
  }
  console.log(
    `${key}: coverage ${covered}/${SAMPLES.length} — court NOT under play origin. ` +
    `Densest flat region ~(${bestCx}, ${bestCz}) at y=${bestY.toFixed(3)} → ` +
    `try mapOffset [${(-bestCx).toFixed(1)}, 0, ${(-bestCz).toFixed(1)}], surfaceY ${bestY.toFixed(3)}`,
  );
}

const keys = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(MAPS);
for (const k of keys) await measure(k);
