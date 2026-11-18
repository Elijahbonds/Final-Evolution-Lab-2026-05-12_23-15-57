/**
 * THE COAST ZONE, drawn (lane/coast-islands, phase A; docs/COAST-ISLANDS-PLAN.md).
 *
 * Every surface reads zoneLayout, the same data the sim stands on. Art: procedural surfaces (the shipped sand tile,
 * visual/groundTextures) and the shipped Kenney nature kit (CC0, public/models/props/nature). Nothing new is downloaded or
 * commissioned. (The loader also takes the owner's Meshy props, for the sports spots of phase D.)
 *
 *   the sea         ONE plane round the camera (it travels with it, snapped to the wave tile so the waves never swim),
 *                   see-through over the sea floor, so the shallows read turquoise and the deep reads dark
 *   the sea floor   one plane under everything (the open sea's floor)
 *   the terrain     one mesh per 64 m piece that has land or shallows (the sea pieces draw nothing of their own):
 *                   a FINE mesh (2 m) in the full ring, a COARSE one (8 m) everywhere else. A fine mesh is built when its
 *                   piece reaches the LOD ring (ready before you arrive) and dropped when the piece falls to far. Piece edges
 *                   are drawn at the coarse spacing on both, so a fine piece and a coarse one meet with no crack.
 *   the dressing    palms, bushes and rocks (Kenney): each model loaded once, its parts baked and
 *                   merged by material, drawn as thin instances of the pieces that want them — every prop in the full ring,
 *                   only the tall ones (palms, sea stacks) in the LOD ring, none further out. The buffers are rebuilt only
 *                   when a piece changes tier (a walk of 64 m), never per frame.
 *   the dock        the arrival jetty and the boardwalk bridge (one mesh: decks and rails), their posts (one thin-instanced
 *                   mesh), the boat from Venice (one mesh, vertex colours), and the boat spot's ring and sign.
 *
 * perf: `coast.streamOn` 1 streams (new); 0 draws every piece fine with every prop: the measuring control, not a way to play.
 */

import {
  Color3, Color4, DynamicTexture, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, SceneLoader, StandardMaterial, Texture,
  TransformNode, Vector3, VertexBuffer, VertexData, type AbstractMesh, type Scene,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { groundTextureFor, TILE_M } from '@/lib/babylon/visual/groundTextures';
import { spawnMeshyProp, type MeshyPropKey } from '@/lib/babylon/visual/meshyProps';
import {
  BOAT_AT, DECKS, ISLANDS, deckSurfaceY, PIECE_M, PROP_MODELS, SEA_Y, SEABED_Y, ZONE_SPOTS, propsDrawnAt, terrainY, zoneProps, zonePieces,
  type Piece, type PropModel, type Tier,
} from './zoneLayout';

/** coast.streamOn: 1 = stream the 64 m pieces (new); 0 = every piece at full detail (the control). */
export const COAST_STREAM_ON = 1;
/** Terrain spacing (m) in the full ring and elsewhere. 64 / 32 and 64 / 8: the coarse edge points are the fine ones' subset. */
export const FINE_DIV = 32;
export const COARSE_DIV = 8;
/** The sea and sea-floor planes' size (m): inside the harness's 280 m sky dome, which travels with the camera too. */
export const SEA_PLANE_M = 520;
const WAVE_TILE_M = 8;

export interface ZoneViewStats { fineMeshes: number; coarseMeshes: number; props: number; propMasters: number }
export interface ZoneView {
  root: TransformNode;
  /** Every model has loaded (or failed and been skipped). */
  ready: Promise<void>;
  /** Draw the pieces at these tiers (only `changed` keys are touched; all of them on the first call). */
  stream(tiers: ReadonlyMap<string, Tier>, changed: readonly string[]): void;
  /** Once per frame: the sea and the sky travel with the camera; the waves and the boat move. */
  frame(camX: number, camZ: number, dt: number): void;
  stats(): ZoneViewStats;
  dispose(): void;
}

// ── colours ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const C_DEEP = new Color3(0.42, 0.5, 0.5), C_WET = new Color3(0.8, 0.72, 0.56), C_DRY = new Color3(1, 1, 1);
const C_GRASS = new Color3(0.46, 0.74, 0.36), C_ROCK = new Color3(0.72, 0.68, 0.62);
const reef = ISLANDS.find((i) => i.look === 'rocks');
const TMP_C = new Color3();

/** The terrain's colour (a multiply over the sand tile) at a height, with the rocky island greyer on top. */
export function terrainColor(y: number, x: number, z: number, out: Color3 = TMP_C): Color3 {
  if (y < -0.2) Color3.LerpToRef(C_WET, C_DEEP, Math.min(1, (-0.2 - y) / 5), out);
  else if (y < 0.35) out.copyFrom(C_WET);
  else if (y < 1.9) Color3.LerpToRef(C_WET, C_DRY, Math.min(1, (y - 0.35) / 0.5), out);
  else Color3.LerpToRef(C_DRY, C_GRASS, Math.min(1, (y - 1.9) / 0.6), out);
  if (reef && y > 1.6 && Math.hypot(x - reef.at[0], z - reef.at[1]) < reef.radius + 2) Color3.LerpToRef(out, C_ROCK, Math.min(1, (y - 1.6) / 1.5), out);
  return out;
}

/** The height a terrain vertex is drawn at: the true height inside a piece; on its edge, the coarse spacing's line (no cracks). */
export function drawnY(x: number, z: number, rect: Piece['rect']): number {
  const step = PIECE_M / COARSE_DIV, e = 1e-6;
  const onX = Math.abs(x - rect.minX) < e || Math.abs(x - rect.maxX) < e;
  const onZ = Math.abs(z - rect.minZ) < e || Math.abs(z - rect.maxZ) < e;
  if (onX && !onZ) {
    const k = Math.floor((z - rect.minZ) / step), z0 = rect.minZ + k * step, t = (z - z0) / step;
    return t < e ? terrainY(x, z0) : terrainY(x, z0) * (1 - t) + terrainY(x, z0 + step) * t;
  }
  if (onZ && !onX) {
    const k = Math.floor((x - rect.minX) / step), x0 = rect.minX + k * step, t = (x - x0) / step;
    return t < e ? terrainY(x0, z) : terrainY(x0, z) * (1 - t) + terrainY(x0 + step, z) * t;
  }
  return terrainY(x, z);
}

// ── procedural textures ──────────────────────────────────────────────────────────────────────────────────────────────

function lcg(seed: number): () => number { let v = seed >>> 0; return () => ((v = (v * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** A tiling wave normal map (whole cycles per tile: no seam), painted once. A headless canvas leaves it flat. */
function waveNormals(scene: Scene): DynamicTexture {
  const N = 256, tex = new DynamicTexture('coast_sea_waves', N, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  const img = c.getImageData?.(0, 0, N, N);
  if (img) {
    const r = lcg(0xc0a57), terms = Array.from({ length: 8 }, (_, i) => ({ kx: Math.round((r() - 0.5) * (4 + i * 3)), ky: Math.round(1 + r() * (3 + i * 2)), a: 1 / (1 + i * 0.7), p: r() * Math.PI * 2 }));
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (const w of terms) v += w.a * Math.sin(((w.kx * x + w.ky * y) / N) * Math.PI * 2 + w.p); h[y * N + x] = v; }
    const d = img.data, k = 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const nx = -dx * k, ny = -dy * k, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      d[i] = Math.round((nx / l * 0.5 + 0.5) * 255); d[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); d[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  } else { c.fillStyle = 'rgb(128,128,255)'; c.fillRect(0, 0, N, N); }
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Planks across a deck: a small tile. */
function plankTexture(scene: Scene): DynamicTexture {
  const N = 128, tex = new DynamicTexture('coast_planks', N, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D, r = lcg(0x91a);
  c.fillStyle = '#8a6a4a'; c.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y += 16) {
    c.fillStyle = `rgb(${120 + Math.round(r() * 30)},${92 + Math.round(r() * 20)},${64 + Math.round(r() * 14)})`; c.fillRect(0, y + 1, N, 14);
    c.fillStyle = 'rgba(40,28,18,0.7)'; c.fillRect(0, y, N, 1.5);
  }
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

// ── the dressing's models ────────────────────────────────────────────────────────────────────────────────────────────

/** The Kenney kits export every material fully metallic with no metal map: under image light they read as dark gems. The
 *  shipped fix (visual/VenueProps normaliseKitMaterial), applied the same way here: matte, and the kit's teal leaves green. */
const KIT_PALETTE: Record<string, string> = { leafsGreen: '#3F9A55', leafsDark: '#2F7A45', grass: '#4C9E58', woodBark: '#8B5E3C', woodBarkDark: '#6E4A30', dirt: '#8A7A66' };
function normaliseKit(mat: PBRMaterial): void {
  if (mat.unlit) mat.unlit = false;
  if (!mat.metallicTexture && (mat.metallic ?? 0) > 0.5) { mat.metallic = 0; mat.roughness = 0.9; }
  const hex = KIT_PALETTE[mat.name]; if (hex && !mat.albedoTexture) mat.albedoColor = Color3.FromHexString(hex);
}

/** One model's drawable masters: its parts baked to model space and merged by material, parked at the origin. */
export async function loadMasters(scene: Scene, m: PropModel, natureUrl = '/models/props/nature/'): Promise<Mesh[]> {
  let root: TransformNode | null = null;
  const extra: TransformNode[] = [];
  if (m.kit === 'meshy') {
    root = await spawnMeshyProp(scene, m.file.replace(/\.glb$/, '') as MeshyPropKey, null, `coast_${m.id}`);
  } else {
    const r = natureUrl.startsWith('data:')
      ? await SceneLoader.ImportMeshAsync('', '', natureUrl, scene, undefined, '.glb')
      : await SceneLoader.ImportMeshAsync('', natureUrl, m.file, scene);
    root = (r.meshes.find((x) => !x.parent) as TransformNode | undefined) ?? null;
    extra.push(...r.transformNodes);
  }
  if (!root || scene.isDisposed) return [];
  root.computeWorldMatrix(true);
  const groups = new Map<number, Mesh[]>();
  for (const part of root.getChildMeshes(false) as Mesh[]) {
    if (!(part.getTotalVertices?.() > 0) || !part.material) continue;
    if (part.material instanceof PBRMaterial) normaliseKit(part.material);
    part.computeWorldMatrix(true);
    const c = part.clone(`${part.name}_coast`, null, true, false) as Mesh;
    c.parent = null;   // a clone keeps its source's parent; this one must not die with the import's root (disposed below)
    c.makeGeometryUnique();
    c.position.setAll(0); c.rotation.setAll(0); c.rotationQuaternion = null; c.scaling.setAll(1);
    c.bakeTransformIntoVertices(part.getWorldMatrix());
    const list = groups.get(part.material.uniqueId) ?? [];
    list.push(c); groups.set(part.material.uniqueId, list);
  }
  const masters: Mesh[] = [];
  for (const parts of groups.values()) {
    const mat = parts[0].material;
    const one = parts.length > 1 ? Mesh.MergeMeshes(parts, true, true) : parts[0];
    if (!one) continue;
    one.name = `coast_prop_${m.id}_${masters.length}`;
    one.material = mat; one.isPickable = false; one.receiveShadows = true; one.alwaysSelectAsActiveMesh = false;
    one.thinInstanceCount = 0;
    one.setEnabled(false);
    masters.push(one);
  }
  // the imported originals are not drawn: their geometry lives on in the masters
  for (const n of [root, ...extra]) { try { n.dispose(false, false); } catch { /* gone */ } }
  return masters;
}

// ── the view ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function mountZoneView(scene: Scene, opts: { streamOn: boolean }): ZoneView {
  const root = new TransformNode('coast_zone', scene);
  const mats: (StandardMaterial | PBRMaterial)[] = [], texs: Texture[] = [];

  // the sea floor and the sea
  const floorMat = new StandardMaterial('coast_floor_mat', scene);
  floorMat.diffuseColor = new Color3(0.3, 0.42, 0.44); floorMat.specularColor = Color3.Black(); mats.push(floorMat);
  const floor = MeshBuilder.CreateGround('coast_floor', { width: SEA_PLANE_M, height: SEA_PLANE_M }, scene);
  floor.material = floorMat; floor.position.y = SEABED_Y - 0.05; floor.isPickable = false; floor.parent = root;

  const waves = waveNormals(scene); texs.push(waves);
  waves.uScale = SEA_PLANE_M / WAVE_TILE_M; waves.vScale = SEA_PLANE_M / WAVE_TILE_M;
  const seaMat = new PBRMaterial('coast_sea_mat', scene);
  seaMat.albedoColor = Color3.FromHexString('#1C6F88'); seaMat.metallic = 0; seaMat.roughness = 0.12;
  seaMat.alpha = 0.8; seaMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND; seaMat.bumpTexture = waves; seaMat.environmentIntensity = 0.9;
  seaMat.backFaceCulling = false;
  mats.push(seaMat);
  const sea = MeshBuilder.CreateGround('coast_sea', { width: SEA_PLANE_M, height: SEA_PLANE_M }, scene);
  sea.material = seaMat; sea.position.y = SEA_Y; sea.isPickable = false; sea.parent = root;

  // the terrain pieces
  const sand = groundTextureFor(scene, 'sand', PIECE_M / TILE_M.sand, PIECE_M / TILE_M.sand); texs.push(sand);
  const terrainMat = new StandardMaterial('coast_terrain_mat', scene);
  terrainMat.diffuseTexture = sand; terrainMat.specularColor = Color3.Black(); mats.push(terrainMat);
  const landPieces = zonePieces().filter((p) => p.kind !== 'sea');
  const coarse = new Map<string, Mesh>(), fine = new Map<string, Mesh>();
  const buildTerrain = (p: Piece, div: number): Mesh => {
    const g = MeshBuilder.CreateGround(`coast_t_${div === FINE_DIV ? 'f' : 'c'}_${p.key}`, { width: PIECE_M, height: PIECE_M, subdivisions: div, updatable: false }, scene);
    const cx = (p.rect.minX + p.rect.maxX) / 2, cz = (p.rect.minZ + p.rect.maxZ) / 2;
    const pos = g.getVerticesData(VertexBuffer.PositionKind)!;
    const col = new Float32Array((pos.length / 3) * 4);
    for (let v = 0; v < pos.length; v += 3) {
      const x = cx + pos[v], z = cz + pos[v + 2];
      const y = drawnY(x, z, p.rect);
      pos[v + 1] = y;
      const c = terrainColor(y, x, z);
      const k = (v / 3) * 4; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; col[k + 3] = 1;
    }
    const idx = g.getIndices()!;
    const nrm: number[] = [];
    VertexData.ComputeNormals(pos, idx, nrm);
    g.setVerticesData(VertexBuffer.PositionKind, pos, false);
    g.setVerticesData(VertexBuffer.NormalKind, nrm, false);
    g.setVerticesData(VertexBuffer.ColorKind, col, false);
    g.position.set(cx, 0, cz);
    g.material = terrainMat; g.isPickable = false; g.receiveShadows = true; g.parent = root;
    g.refreshBoundingInfo();
    g.freezeWorldMatrix();
    return g;
  };
  for (const p of landPieces) coarse.set(p.key, buildTerrain(p, COARSE_DIV));

  // the dock, the bridge, their rails and posts
  const planks = plankTexture(scene); texs.push(planks);
  const woodMat = new StandardMaterial('coast_wood_mat', scene);
  woodMat.diffuseTexture = planks; woodMat.specularColor = Color3.Black(); mats.push(woodMat);
  const postMat = new StandardMaterial('coast_post_mat', scene);
  postMat.diffuseColor = Color3.FromHexString('#5E4630'); postMat.specularColor = Color3.Black(); mats.push(postMat);
  const deckParts: Mesh[] = [];
  const postMats: Matrix[] = [];
  // each deck in 1 m segments along its length, each at the deck's walking surface there (zoneLayout deckSurfaceY: on the sand,
  // rising through the shallows, level over the water), so the boards are where the feet are; one merged mesh for all of them
  const zMid = (d: (typeof DECKS)[number]) => (d.minZ + d.maxZ) / 2;
  for (const d of DECKS) {
    const l = d.maxZ - d.minZ, n = Math.ceil(d.maxX - d.minX), seg = (d.maxX - d.minX) / n;
    for (let k = 0; k < n; k++) {
      const x = d.minX + (k + 0.5) * seg, y = deckSurfaceY(d, terrainY(x, zMid(d)));
      const deck = MeshBuilder.CreateBox(`coast_deck_${d.id}_${k}`, { width: seg + 0.02, height: 0.24, depth: l }, scene);
      deck.position.set(x, y - 0.12, zMid(d));
      deckParts.push(deck);
      for (const side of [d.minZ + 0.08, d.maxZ - 0.08]) {
        const rail = MeshBuilder.CreateBox(`coast_rail_${d.id}_${k}`, { width: seg + 0.02, height: 0.12, depth: 0.12 }, scene);
        rail.position.set(x, y + 0.95, side); deckParts.push(rail);
      }
    }
    for (const side of [d.minZ + 0.08, d.maxZ - 0.08]) {
      for (let x = d.minX + 0.3; x <= d.maxX - 0.2; x += 3.2) {
        const y = deckSurfaceY(d, terrainY(x, zMid(d)));
        const bottom = Math.min(terrainY(x, side), y) - 0.3, top = y + 1.0, h = top - bottom;
        postMats.push(Matrix.Compose(new Vector3(0.22, h, 0.22), Quaternion.Identity(), new Vector3(x, bottom + h / 2, side)));
      }
    }
  }
  const deckMesh = Mesh.MergeMeshes(deckParts, true, true)!;
  deckMesh.name = 'coast_decks'; deckMesh.material = woodMat; deckMesh.isPickable = false; deckMesh.receiveShadows = true; deckMesh.parent = root;
  // the plank tile: one tile a segment along, two across (the box UVs run 0..1 per face)
  planks.uScale = 1; planks.vScale = 2;
  const post = MeshBuilder.CreateBox('coast_posts', { size: 1 }, scene);
  post.material = postMat; post.isPickable = false; post.parent = null;
  const pbuf = new Float32Array(postMats.length * 16); postMats.forEach((m, i) => m.copyToArray(pbuf, i * 16));
  post.thinInstanceSetBuffer('matrix', pbuf, 16, true);

  // the boat from Venice, moored at the dock's seaward end, its bow out to sea (west)
  const boat = buildBoat(scene);
  boat.parent = root; boat.position.set(BOAT_AT[0] - 2, SEA_Y, BOAT_AT[1] + 3.4);
  const boatMat = new StandardMaterial('coast_boat_mat', scene); boatMat.specularColor = new Color3(0.2, 0.2, 0.2); mats.push(boatMat);
  boat.material = boatMat;

  // the boat spot: a ring on the dock and a sign
  const spot = ZONE_SPOTS[0];
  const ringMat = new StandardMaterial('coast_ring_mat', scene);
  ringMat.diffuseColor = Color3.FromHexString('#FFD166'); ringMat.emissiveColor = Color3.FromHexString('#FFD166').scale(0.55); ringMat.specularColor = Color3.Black(); mats.push(ringMat);
  const ring = MeshBuilder.CreateTorus('coast_ring', { diameter: spot.radius * 1.4, thickness: 0.18, tessellation: 40 }, scene);
  ring.material = ringMat; ring.isPickable = false; ring.parent = root; ring.position.set(spot.at[0], DECKS[0].y + 0.06, spot.at[1]);
  const sign = MeshBuilder.CreatePlane('coast_sign', { width: 4.2, height: 1.1, sideOrientation: Mesh.DOUBLESIDE }, scene);
  sign.parent = root; sign.position.set(spot.at[0] - 1, DECKS[0].y + 3.4, spot.at[1]); sign.billboardMode = Mesh.BILLBOARDMODE_Y; sign.isPickable = false;
  const st = new DynamicTexture('coast_sign_tex', { width: 512, height: 128 }, scene, false); texs.push(st);
  const sg = st.getContext() as CanvasRenderingContext2D;
  sg.fillStyle = 'rgba(8,10,16,0.9)'; sg.fillRect(0, 0, 512, 128);
  sg.fillStyle = '#FFD166'; sg.font = 'bold 54px sans-serif'; sg.textBaseline = 'middle';
  sg.fillText(spot.label.replace('[PLACEHOLDER] ', '').slice(0, 18), 20, 66);
  st.update();
  const sm = new StandardMaterial('coast_sign_mat', scene); sm.disableLighting = true; sm.emissiveTexture = st; sign.material = sm; mats.push(sm);

  // the dressing: models load in the background; the first stream() after they land fills their buffers
  const props = zoneProps();
  const masters = new Map<string, Mesh[]>();
  let tiersNow: ReadonlyMap<string, Tier> = new Map();
  const fill = (model: PropModel): number => {
    const list = masters.get(model.id);
    if (!list || !list.length) return 0;
    const at = props.filter((p) => p.model === model.id && (!opts.streamOn || propsDrawnAt(tiersNow.get(p.piece) ?? 'far', model)));
    const buf = new Float32Array(Math.max(1, at.length) * 16);
    const m = new Matrix(), q = new Quaternion(), s = new Vector3(), t = new Vector3();
    at.forEach((p, i) => { Quaternion.RotationYawPitchRollToRef(p.yaw, 0, 0, q); s.setAll(p.scale); t.set(p.x, p.y, p.z); Matrix.ComposeToRef(s, q, t, m); m.copyToArray(buf, i * 16); });
    for (const mesh of list) {
      mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
      mesh.thinInstanceCount = at.length;
      mesh.setEnabled(at.length > 0);
      mesh.thinInstanceRefreshBoundingInfo(false);
    }
    return at.length;
  };
  const jobs = PROP_MODELS.map((m) => loadMasters(scene, m).then((list) => { masters.set(m.id, list); fill(m); }).catch((e) => console.warn(`[COAST] ${m.file}`, e)));

  let seaT = 0, bob = 0;
  const sky: AbstractMesh[] = [];
  const view: ZoneView = {
    root,
    ready: Promise.allSettled(jobs).then(() => undefined),
    stream(tiers, changed) {
      tiersNow = tiers;
      for (const key of changed) {
        const p = landPieces.find((x) => x.key === key);
        if (!p) continue;
        const t = opts.streamOn ? tiers.get(key) ?? 'far' : 'full';
        // the fine mesh: built from the LOD ring in (load ahead), shown in the full ring, dropped when the piece is far
        let f = fine.get(key);
        if (t !== 'far' && !f) { f = buildTerrain(p, FINE_DIV); fine.set(key, f); }
        if (t === 'far' && f) { f.dispose(); fine.delete(key); f = undefined; }
        f?.setEnabled(t === 'full');
        coarse.get(key)!.setEnabled(t !== 'full');
      }
      if (changed.length) for (const m of PROP_MODELS) fill(m);
    },
    frame(camX, camZ, dt) {
      // the sea and its floor travel with the camera, snapped to the wave tile (the pattern stays put on the water)
      const sx = Math.round(camX / WAVE_TILE_M) * WAVE_TILE_M, sz = Math.round(camZ / WAVE_TILE_M) * WAVE_TILE_M;
      sea.position.x = sx; sea.position.z = sz; floor.position.x = sx; floor.position.z = sz;
      seaT += dt; waves.uOffset = (seaT * 0.012) % 1; waves.vOffset = (seaT * 0.007) % 1;
      // the harness's painted sky is a 280 m dome round the origin: it travels with the camera (AdventureMode's rule)
      if (!sky.length) for (const n of ['bk_dome', 'bk_ring']) { const m = scene.getMeshByName(n); if (m) sky.push(m); }
      for (const m of sky) { m.position.x = camX; m.position.z = camZ; }
      bob += dt; boat.position.y = SEA_Y + Math.sin(bob * 1.3) * 0.06; boat.rotation.z = Math.sin(bob * 0.9) * 0.015;
    },
    stats() {
      let props = 0, propMasters = 0;
      for (const list of masters.values()) for (const m of list) { if (m.isEnabled()) { propMasters++; props += m.thinInstanceCount; } }
      let f = 0, c = 0;
      for (const m of fine.values()) if (m.isEnabled()) f++;
      for (const m of coarse.values()) if (m.isEnabled()) c++;
      return { fineMeshes: f, coarseMeshes: c, props, propMasters };
    },
    dispose() {
      for (const list of masters.values()) for (const m of list) m.dispose();
      for (const m of fine.values()) m.dispose();
      post.dispose();
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
      root.dispose(false, true);
    },
  };
  return view;
}

/** The boat: a white hull with a blue band, a pointed bow, a cabin. One mesh, its colours in the vertices. */
function buildBoat(scene: Scene): Mesh {
  const paint = (m: Mesh, hex: string): Mesh => {
    const c = Color4.FromHexString(`${hex}FF`), n = m.getTotalVertices(), a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { a[i * 4] = c.r; a[i * 4 + 1] = c.g; a[i * 4 + 2] = c.b; a[i * 4 + 3] = 1; }
    m.setVerticesData(VertexBuffer.ColorKind, a, false);
    return m;
  };
  const hull = paint(MeshBuilder.CreateBox('coast_boat_hull', { width: 8, height: 1.5, depth: 3.2 }, scene), '#F4F1EA');
  hull.position.set(0.5, 0.35, 0);
  const bow = paint(MeshBuilder.CreateBox('coast_boat_bow', { width: 2.26, height: 1.5, depth: 2.26 }, scene), '#F4F1EA');
  bow.rotation.y = Math.PI / 4; bow.position.set(-3.5, 0.35, 0);
  const band = paint(MeshBuilder.CreateBox('coast_boat_band', { width: 8.05, height: 0.32, depth: 3.26 }, scene), '#1F4E8C');
  band.position.set(0.5, 0.0, 0);
  const cabin = paint(MeshBuilder.CreateBox('coast_boat_cabin', { width: 3.2, height: 1.5, depth: 2.4 }, scene), '#E9E4D8');
  cabin.position.set(1.6, 1.85, 0);
  const roof = paint(MeshBuilder.CreateBox('coast_boat_roof', { width: 3.8, height: 0.18, depth: 2.9 }, scene), '#1F4E8C');
  roof.position.set(1.6, 2.68, 0);
  const one = Mesh.MergeMeshes([hull, bow, band, cabin, roof], true, true)!;
  one.name = 'coast_boat'; one.isPickable = false; one.receiveShadows = true;
  return one;
}
