// navmesh-gen — ship pass 4, phase 3: bake a walkable-area navmesh per venue map, offline.
//
// Reads each baked map GLB, applies the exact transform VenueMaps.mountVenueMap applies at
// runtime (Babylon's glTF x-mirror, then mapRotationY, scale, mapOffset and the surfaceY drop),
// runs Recast (recast-navigation — a DEV dependency; nothing from it ships) and writes
// public/models/navmesh/<mapKey>.json: the navmesh's own convex polygons in world x/z metres
// plus a grid cell size for core/NavBounds.ts.
//   npx tsx scripts/venue/navmesh-gen.mts [mapKey ...]        (default: every map in lib/map-data.ts)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { init as initRecast } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import mapDataMod from '../../lib/map-data';   // CJS interop (see scripts/avatar/validate-pose.mts)
import type { MapConfig } from '../../lib/map-data';
const MAPS = ((mapDataMod as unknown as { MAPS?: Record<string, MapConfig> }).MAPS ?? (mapDataMod as unknown as Record<string, MapConfig>));

const OUT = 'public/models/navmesh';

// The regulation play core per map, always walkable (x0, z0, x1, z1, metres). Recast erodes the mesh
// under anything below head height — the rim assembly, dojo lanterns — and a sport can't lose its
// key or its mat to a lantern. The mesh's contribution is the walkable area BEYOND the core:
// sidelines, steps, the apron, the dugout mouth. Sizes follow the specs' grounds and the modes' play.
const PLAY_CORE: Record<string, [number, number, number, number]> = {
  'venice-blue-court': [-8, -1, 8, 15],      // half court incl. the baseline apron (1v1 / 3v3 clamp: ±7.2–8 × 14.5–15)
  dojo: [-4.5, -4.5, 4.5, 4.5],              // the clear mat between the pillars (karate VS's ARENA_HALF); the mesh adds the wider ends
  'soccer-stadium': [-11, -10, 11, 11],      // penalty area to the goal line (z 10.4)
  'baseball-park': [-8, -8, 8, 5],           // plate, batter's boxes, mound approach
  'tennis-court': [-7, -6, 7, 6],
  'gymnastics-gym': [-5, -5, 5, 5],
  'mountain-slope': [-8, -10, 8, 10],
  'surf-break': [-9, -9, 9, 10],
};
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MAPS);

await initRecast();
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
mkdirSync(OUT, { recursive: true });

for (const key of keys) {
  const cfg = MAPS[key]; if (!cfg?.glb) continue;
  const file = join('public', cfg.glb); if (!existsSync(file)) { console.warn(`${key}: no file ${file}`); continue; }
  const doc = await io.read(file);
  const positions: number[] = []; const indices: number[] = [];
  const s = cfg.scale ?? 1, yaw = cfg.mapRotationY ?? 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ox = cfg.mapOffset?.[0] ?? 0, oz = cfg.mapOffset?.[2] ?? 0, oy = (cfg.mapOffset?.[1] ?? 0) - (cfg.surfaceY ?? 0);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); const idx = prim.getIndices(); if (!pos || !idx) continue;
      const base = positions.length / 3;
      for (let i = 0; i < pos.getCount(); i++) {
        const v = pos.getElement(i, [0, 0, 0]);
        let x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
        const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
        let z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        x = -x;                                            // Babylon's glTF __root__ mirrors x (right- to left-handed)
        const rx = x * cy + z * sy, rz = -x * sy + z * cy; // mapRoot.rotation.y (Babylon left-handed yaw)
        positions.push(rx * s + ox, y * s + oy, rz * s + oz);
      }
      for (let i = 0; i < idx.getCount(); i++) indices.push(base + idx.getScalar(i));
    }
  }
  const { success, navMesh } = generateSoloNavMesh(new Float32Array(positions), new Uint32Array(indices), {
    cs: 0.3, ch: 0.2, walkableSlopeAngle: 35, walkableHeight: 9, walkableClimb: 2, walkableRadius: 2,
    maxEdgeLen: 24, maxSimplificationError: 1.3, minRegionArea: 8, mergeRegionArea: 20, maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1,
  });
  if (!success || !navMesh) { console.warn(`${key}: navmesh failed`); continue; }
  const polys: { pts: [number, number][] }[] = [];
  for (let t = 0; t < navMesh.getMaxTiles(); t++) {
    const tile = navMesh.getTile(t); const header = tile.header(); if (!header) continue;
    for (let i = 0; i < header.polyCount(); i++) {
      const poly = tile.polys(i); const n = poly.vertCount(); if (n < 3) continue;
      const pts: [number, number][] = [];
      for (let j = 0; j < n; j++) { const vi = poly.verts(j); pts.push([tile.verts(vi * 3), tile.verts(vi * 3 + 2)]); }
      // orient counter-clockwise in x/z (NavBounds' inside test): signed area > 0
      let a = 0; for (let j = 0; j < n; j++) { const p = pts[j], q = pts[(j + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
      polys.push({ pts: a < 0 ? pts.reverse() : pts });
    }
  }
  if (!polys.length) { console.warn(`${key}: no walkable polygons`); navMesh.destroy(); continue; }
  const core = PLAY_CORE[key]; if (core) polys.push({ pts: [[core[0], core[1]], [core[2], core[1]], [core[2], core[3]], [core[0], core[3]]] });   // CCW
  const xs = polys.flatMap((p) => p.pts.map((q) => q[0])), zs = polys.flatMap((p) => p.pts.map((q) => q[1]));
  const out = { mapKey: key, cell: 4, polys, bbox: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)].map((v) => +v.toFixed(2)) };
  writeFileSync(join(OUT, `${key}.json`), JSON.stringify(out));
  console.log(`${key.padEnd(20)} ${String(polys.length).padStart(4)} polys  x ${out.bbox[0]}..${out.bbox[2]}  z ${out.bbox[1]}..${out.bbox[3]}  (${(positions.length / 3 / 1000).toFixed(0)}k verts)`);
  navMesh.destroy();
}
