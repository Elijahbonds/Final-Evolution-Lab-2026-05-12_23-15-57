/**
 * VENICE HUB, improvement pass phase 5 (look): the park's furniture round the four courts, inside the venice_hub phone row.
 *
 *   fences      chain-link round each court on three sides (the east sideline, where the walk-up ring is, stays open): one
 *               merged panel mesh (an alpha-tested diamond weave on a 128² canvas, tiled in the UVs) and one merged post mesh
 *               for all four courts: two draws.
 *   name boards a board on two posts above each court's far baseline, facing the way you walk in, its name painted big:
 *               the four boards share ONE canvas (a 4-row atlas) and are one merged mesh; the posts join the fence posts.
 *   benches     a slatted bench along each court's open sideline (the run's court gets the long bench — the queue): one bench
 *               drawn as thin instances, one draw.
 *   light poles a pole and a lamp head at each court's corners: one merged pole, thin instances, one draw; the lamp heads
 *               glow (emissive, no light: a light per pole would cost every material a shader variant).
 * All procedural (no new files), all one material each, every placement in the courts district's frame (hubWorld.v1Spots).
 * `venue.veniceLookV2` 0 mounts none of it (V1's look).
 */

import { Color3, DynamicTexture, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, StandardMaterial, Texture, TransformNode, Vector3, type Scene } from '@babylonjs/core';
import { v1Spots } from './hubWorld';
import type { Spot } from './layout';

export const VENICE_LOOK_V2 = 1;
/** V2 phase 3: the camera keeps out of the park's props (mountCameraBlockers). 1 = poles, posts, boards, palms, hoops and the
 *  boardwalk row; 2 = the fences too; 0 = it passes through them all, as before. */
export const VENICE_CAM_COLLIDE = 1;
/** Court half-sizes this furniture rings (m): the 16 × 28 painted court plus its run-off. */
export const FENCE = { halfW: 10.5, halfL: 16.5, h: 3.2, postEvery: 3.5 } as const;
export const BENCH = { w: 3.2, d: 0.45, h: 0.48 } as const;
/** The walk-up ring on each court's open sideline (courtsView): its centre is `out` m past the court's edge; its drawn radius. */
export const RING = { out: 3, r: 2.5 } as const;
/** The name board's posts stand this far behind the north fence (m); the board itself hangs 0.62 m behind it, facing the court. */
export const BOARD_POST_BACK = 0.85;

/** Where a court's benches stand (centre x, z): on the open sideline, clear of the ring (the run's court has four). Shared with the solids (hubSolids). */
export function benchSpots(s: Spot): Array<[number, number]> {
  const count = s.id === 'court.run' ? 4 : 2;
  const x = s.at[0] + FENCE.halfW + 1.2, gap = BENCH.w + 0.4, first = RING.r + 1.2 + BENCH.w / 2;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count / 2; i++) { out.push([x, s.at[1] - first - i * gap]); out.push([x, s.at[1] + first + i * gap]); }
  return out;
}

/** Where a court's light poles stand (its four corners, just outside the fence). */
export function poleSpots(s: Spot): Array<[number, number]> {
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [s.at[0] + sx * (FENCE.halfW + 0.6), s.at[1] + sz * (FENCE.halfL - 1)] as [number, number]);
}

export interface CourtsDressing { root: TransformNode; dispose(): void; draws: number }

/** Pure: the fence runs for one court centred at (cx, cz): west, north and south sides (east open), as [x0, z0, x1, z1]. */
export function fenceRuns(cx: number, cz: number): Array<[number, number, number, number]> {
  const w = FENCE.halfW, l = FENCE.halfL;
  return [
    [cx - w, cz - l, cx - w, cz + l],   // west
    [cx - w, cz - l, cx + w, cz - l],   // north (behind the hoop)
    [cx - w, cz + l, cx + w, cz + l],   // south
  ];
}

/** Pure: posts along a run, every FENCE.postEvery metres, both ends included. */
export function postsAlong([x0, z0, x1, z1]: [number, number, number, number]): Array<[number, number]> {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / FENCE.postEvery));
  return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
}

function chainLink(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('venice_chainlink', { width: 128, height: 128 }, scene, true);
  const g = t.getContext() as CanvasRenderingContext2D;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(205,210,214,1)'; g.lineWidth = 5;
  for (const [a, b, c, d] of [[0, 0, 128, 128], [128, 0, 0, 128], [-64, 0, 64, 128], [64, 0, 192, 128], [64, 0, -64, 128], [192, 0, 64, 128]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
  t.update(); t.hasAlpha = true; t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

/** One board's row in the atlas (px): 512 × 128 per court, V1's sign size (the four rows cost what V1's four signs did, 1.3 MB). */
export const BOARD_ROW = { w: 512, h: 128 } as const;

function boardAtlas(scene: Scene, names: string[]): DynamicTexture {
  const W = BOARD_ROW.w, R = BOARD_ROW.h, H = R * names.length;
  const t = new DynamicTexture('venice_board_atlas', { width: W, height: H }, scene, true);
  const g = t.getContext() as CanvasRenderingContext2D;
  names.forEach((n, i) => {
    const y = i * R;
    g.fillStyle = '#10243A'; g.fillRect(0, y, W, R);
    g.fillStyle = '#F2C14E'; g.fillRect(0, y, W, 10); g.fillRect(0, y + R - 10, W, 10);
    g.fillStyle = '#FFFFFF'; g.font = 'bold 66px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(n, W / 2, y + R / 2 + 2, W - 24);
  });
  t.update();
  return t;
}

export function mountCourtsDressing(scene: Scene, parent: TransformNode): CourtsDressing {
  const root = new TransformNode('venice_furniture', scene);
  root.parent = parent;
  const spots = v1Spots();
  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { owned.push(x); return x; };

  // ── fences: one panel mesh, one post mesh (with the board posts) ──
  const panels: Mesh[] = [], posts: Mesh[] = [];
  for (const s of spots) {
    for (const run of fenceRuns(s.at[0], s.at[1])) {
      const [x0, z0, x1, z1] = run, len = Math.hypot(x1 - x0, z1 - z0);
      const p = MeshBuilder.CreatePlane('venice_fence_panel', { width: len, height: FENCE.h, sideOrientation: Mesh.DOUBLESIDE }, scene);
      p.position.set((x0 + x1) / 2, FENCE.h / 2, (z0 + z1) / 2);
      p.rotation.y = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      const uv = p.getVerticesData('uv');
      if (uv) { for (let i = 0; i < uv.length; i += 2) { uv[i] *= len / 1.2; uv[i + 1] *= FENCE.h / 1.2; } p.setVerticesData('uv', uv); }
      panels.push(p);
      for (const [px, pz] of postsAlong(run)) {
        const c = MeshBuilder.CreateCylinder('venice_fence_post', { diameter: 0.09, height: FENCE.h + 0.1, tessellation: 6 }, scene);
        c.position.set(px, (FENCE.h + 0.1) / 2, pz); posts.push(c);
      }
    }
    // the name board's two posts, behind the far baseline fence
    for (const dx of [-2.4, 2.4]) {
      const c = MeshBuilder.CreateCylinder('venice_board_post', { diameter: 0.16, height: 5.2, tessellation: 8 }, scene);
      c.position.set(s.at[0] + dx, 2.6, s.at[1] - FENCE.halfL - BOARD_POST_BACK); posts.push(c);   // behind the board (it faces +z), not through its words
    }
  }
  const fence = Mesh.MergeMeshes(panels, true, true)!;
  fence.name = 'venice_fences'; fence.parent = root; fence.isPickable = false;
  const fm = keep(new PBRMaterial('venice_fence_mat', scene));
  fm.albedoTexture = keep(chainLink(scene)); fm.useAlphaFromAlbedoTexture = true; fm.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST; fm.alphaCutOff = 0.4;
  fm.metallic = 0.6; fm.roughness = 0.45; fm.backFaceCulling = false;
  fence.material = fm; fence.freezeWorldMatrix();
  const postMesh = Mesh.MergeMeshes(posts, true, true)!;
  postMesh.name = 'venice_posts'; postMesh.parent = root; postMesh.isPickable = false;
  const pm = keep(new PBRMaterial('venice_post_mat', scene)); pm.albedoColor = Color3.FromHexString('#8A9096'); pm.metallic = 0.7; pm.roughness = 0.4;
  postMesh.material = pm; postMesh.freezeWorldMatrix();

  // ── name boards: one atlas, one merged mesh ──
  const names = spots.map((s) => s.label.replace('[PLACEHOLDER] ', '').replace(/\s+—\s+/, ' · '));
  const atlas = keep(boardAtlas(scene, names));
  const boards: Mesh[] = [];
  spots.forEach((s, i) => {
    const b = MeshBuilder.CreatePlane('venice_board', { width: 6, height: 1.5, sideOrientation: Mesh.DOUBLESIDE }, scene);
    // the board's row in the atlas: v from (n-1-i)/n to (n-i)/n (canvas rows run top-down, v bottom-up)
    const n = spots.length, v0 = (n - 1 - i) / n, v1 = (n - i) / n;
    const uv = b.getVerticesData('uv')!;
    for (let k = 1; k < uv.length; k += 2) uv[k] = uv[k] < 0.5 ? v0 : v1;
    b.setVerticesData('uv', uv);
    b.position.set(s.at[0], 5.0, s.at[1] - FENCE.halfL - 0.62);
    b.rotation.y = Math.PI;   // the face toward +z: the way a player walks in from the gate
    boards.push(b);
  });
  const board = Mesh.MergeMeshes(boards, true, true)!;
  board.name = 'venice_boards'; board.parent = root; board.isPickable = false;
  const bm = keep(new StandardMaterial('venice_board_mat', scene)); bm.diffuseTexture = atlas; bm.emissiveTexture = atlas; bm.emissiveColor = new Color3(0.55, 0.55, 0.55); bm.specularColor = Color3.Black(); bm.backFaceCulling = false;
  board.material = bm; board.freezeWorldMatrix();

  // ── benches: one bench, thin instances along each court's open (east) sideline ──
  const seat = MeshBuilder.CreateBox('b_seat', { width: BENCH.w, height: 0.07, depth: BENCH.d }, scene); seat.position.y = BENCH.h;
  const back = MeshBuilder.CreateBox('b_back', { width: BENCH.w, height: 0.36, depth: 0.06 }, scene); back.position.set(0, BENCH.h + 0.26, BENCH.d / 2);
  const legs = [-1.3, 1.3].map((x) => { const l = MeshBuilder.CreateBox('b_leg', { width: 0.08, height: BENCH.h, depth: BENCH.d }, scene); l.position.set(x, BENCH.h / 2, 0); return l; });
  const bench = Mesh.MergeMeshes([seat, back, ...legs], true, true)!;
  bench.name = 'venice_bench'; bench.parent = root; bench.isPickable = false;
  const wm = keep(new PBRMaterial('venice_bench_mat', scene)); wm.albedoColor = Color3.FromHexString('#7A5A3A'); wm.metallic = 0; wm.roughness = 0.85;
  bench.material = wm;
  const benchAt: Matrix[] = [];
  for (const s of spots) {
    // along the sideline either side of the ring (the run's court: four, where next-up waits); the length runs north-south, the
    // back to the east (facing the court). Phase 8: clear of the ring, so walking up to a court never runs into a bench.
    for (const [x, z] of benchSpots(s)) benchAt.push(Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, -Math.PI / 2, 0), new Vector3(x, 0, z)));
  }
  bench.thinInstanceAdd(benchAt);

  // ── light poles: thin instances at each court's four corners; the heads glow ──
  const pole = MeshBuilder.CreateCylinder('lp_pole', { diameterTop: 0.12, diameterBottom: 0.2, height: 7.5, tessellation: 8 }, scene); pole.position.y = 3.75;
  const arm = MeshBuilder.CreateBox('lp_arm', { width: 1.2, height: 0.12, depth: 0.12 }, scene); arm.position.set(0.5, 7.4, 0);
  const lpm = Mesh.MergeMeshes([pole, arm], true, true)!;
  lpm.name = 'venice_light_pole'; lpm.parent = root; lpm.isPickable = false; lpm.material = pm;
  const head = MeshBuilder.CreateBox('venice_lamp_head', { width: 0.7, height: 0.18, depth: 0.4 }, scene);
  head.parent = root; head.isPickable = false;
  const hm = keep(new StandardMaterial('venice_lamp_mat', scene)); hm.emissiveColor = Color3.FromHexString('#FFE3A8'); hm.diffuseColor = Color3.Black(); hm.specularColor = Color3.Black(); hm.disableLighting = true;
  head.material = hm;
  const poleAt: Matrix[] = [], headAt: Matrix[] = [];
  for (const s of spots) for (const [x, z] of poleSpots(s)) {
    const sx = x > s.at[0] ? 1 : -1, yaw = sx > 0 ? Math.PI : 0;   // the arm reaches over the court
    poleAt.push(Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, yaw, 0), new Vector3(x, 0, z)));
    headAt.push(Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(0, yaw, 0), new Vector3(x + (sx > 0 ? -1.05 : 1.05), 7.32, z)));
  }
  lpm.thinInstanceAdd(poleAt);
  head.thinInstanceAdd(headAt);

  for (const m of [bench, lpm, head]) m.freezeWorldMatrix();
  return {
    root,
    draws: 6,
    dispose() { for (const o of owned) o.dispose(); root.dispose(false, true); },
  };
}

/** V2 phase 3 (venue.veniceCamCollide): the camera keeps out of the poles, fences, boards, palms, hoops and the boardwalk row.
 *  The hub's camera is the shared CameraDirector, whose occlusion probe already pulls in on anything `isPickable && checkCollisions`
 *  (and swings ±50° round the player when boxed in); nothing in the park carried those flags. Rather than flag the drawn meshes
 *  (thin instances, LOD palms, alpha-tested fence panels: picking them costs triangles every frame), this builds ONE invisible
 *  proxy mesh of boxes from the park's solids (hubSolids: the same footprints the player walks round, low benches left out — the
 *  camera rides above them) and the four name boards. Invisible: no draw; one mesh, a few hundred triangles to pick. No camera
 *  number changes. */
export interface CamBlockPiece { id?: string; minX: number; maxX: number; minZ: number; maxZ: number; y0: number; top: number }
/** `fences`: the chain-link runs too (venue.veniceCamCollide 2). Measured (camfence.mts, the phone profile): with the fences in,
 *  the director's pull-in at a fence jumped 3-5 m in a frame, reversed 2-3 times in 6 s and swung the frame off the player; the
 *  chain-link is see-through and reads from outside. So the shipped level (1) leaves the fences out. */
export function camBlockPieces(solids: readonly CamBlockPiece[], boards = true, fences = false): CamBlockPiece[] {
  const out = solids.filter((p) => p.top - p.y0 >= 1.5 && (fences || !/fence/.test(p.id ?? ''))).map((p) => ({ ...p }));
  if (boards) for (const s of v1Spots()) {
    const z = s.at[1] - FENCE.halfL - 0.62;
    out.push({ minX: s.at[0] - 3, maxX: s.at[0] + 3, minZ: z - 0.1, maxZ: z + 0.1, y0: 4.25, top: 5.75 });
  }
  return out;
}
export function mountCameraBlockers(scene: Scene, parent: TransformNode, pieces: readonly CamBlockPiece[]): Mesh | null {
  if (!pieces.length) return null;
  const boxes = pieces.map((p, i) => {
    const b = MeshBuilder.CreateBox(`venice_camblock_${i}`, { width: Math.max(0.05, p.maxX - p.minX), height: Math.max(0.05, p.top - p.y0), depth: Math.max(0.05, p.maxZ - p.minZ) }, scene);
    b.position.set((p.minX + p.maxX) / 2, (p.y0 + p.top) / 2, (p.minZ + p.maxZ) / 2);
    return b;
  });
  const m = Mesh.MergeMeshes(boxes, true, true);
  if (!m) return null;
  m.name = 'venice_camera_blockers'; m.parent = parent;
  m.isVisible = false; m.isPickable = true; m.checkCollisions = true;
  m.freezeWorldMatrix();
  return m;
}
