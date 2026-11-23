/**
 * CHAPTER 1 LOOKS FINISHED (improve pass phase 7, lane/improve-world, 2026-11-22; docs/IMPROVE-10-PHASE-AUDIT.md §2.8, finding #12).
 *
 * Measured before: the story's hub and World 1 were single-colour blocks (world/story/view.ts gave every piece a StandardMaterial of
 * one hex colour, no texture). This dresses them with what ships, VIEW ONLY: no piece's collision, size or place changes (the sim
 * reads the pieces; nothing here is a piece).
 *
 *   surfaces   the flats' tops get the shipped procedural ground textures (visual/groundTextures: grass in World 1, paving in the
 *              hub), their cliff sides and the raised blocks a stone finish, tiled in world metres (box-projected), so a 600 m lane
 *              and a 1 m rim carry the same grain. Each world's palette is kept as the tint.
 *   trims      a darker lip band down each flat's edge (where a void begins), a coping cap on every raised block and run-wall
 *              (flush with its top: nothing to trip on), posts under the rails where there is ground below.
 *   dressing   the shipped Kenney nature kit (CC0, public/models/props/nature, as the Coast uses): low grass, bushes and small
 *              rocks along the lanes' edges, trees only in the wide places' outer margins and the hub's corners — never within
 *              reach of a spawn, a gate, a camp, the rails, the run-wall or the cover (dressPlan's clear rule), one thin-instanced
 *              draw per model part. Loaded after the story can be played (it never lengthens the load).
 * Creature and boss bodies are left alone (owner / art). `story.worldDressed` 0 = the flat colours, as before.
 */

import {
  Color3, Matrix, Mesh, MeshBuilder, MultiMaterial, PBRMaterial, Quaternion, SceneLoader, StandardMaterial, SubMesh, Texture, Vector3, VertexBuffer,
  type Scene, type TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { groundTexture } from '../../visual/groundTextures';
import { buildRailPath } from '../rails/railMath';
import { groundYOf, type GroundPiece } from './pieces';
import type { StoryWorldSpec } from './story/spec';

/** story.worldDressed: 1 = textures, trims and the nature kit; 0 = the plain colours (before this pass). */
export const STORY_WORLD_DRESSED = 1;

// ── the plan (pure) ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type DressModel = 'grass' | 'bush' | 'rockFlat' | 'rockSmall' | 'pine' | 'oak' | 'tree' | 'pineTall';
/** The kit files, and which are tall (a tall prop keeps further from where you play). */
export const DRESS_MODELS: Readonly<Record<DressModel, { file: string; tall: boolean }>> = {
  grass: { file: 'grass_large.glb', tall: false },
  bush: { file: 'plant_bush.glb', tall: false },
  rockFlat: { file: 'rock_smallFlatA.glb', tall: false },
  rockSmall: { file: 'rock_smallG.glb', tall: false },
  pine: { file: 'tree_pineRoundA.glb', tall: true },
  oak: { file: 'tree_oak.glb', tall: true },
  tree: { file: 'tree_default.glb', tall: true },
  pineTall: { file: 'tree_pineTallA.glb', tall: true },
};
export interface DressProp { model: DressModel; x: number; y: number; z: number; yaw: number; scale: number }

/** The clear rule: how far a prop keeps from what you play with (m). [TUNE] new numbers, this pass */
export const CLEAR = {
  /** From a flat's edge: low props sit between `edgeMin` and `edgeMax` inside it; tall ones between `tallMin` and `tallMax`. */
  edgeMin: 0.7, edgeMax: 2.6, tallMin: 1.2, tallMax: 3.2,
  /** A tall prop needs this much flat between it and the lane's middle (the wide places only). */
  tallFromMiddle: 12,
  spawn: 5, gate: 6, monster: 5, boss: 12, rail: 3.5, block: 2.5, tallBlock: 5,
  /** One prop per this many metres of edge, on average. */
  every: 7,
} as const;

/** How much further in a prop tries when the edge band is taken (a rim, a wall), m. */
const EDGE_STEP = 2.5;

/** A fixed pseudo-random value in [0, 1) (no generator: the world is the same every load). */
export function hash01(a: number, b: number, c = 0): number {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

function distToSegXZ(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
function distToBox(px: number, pz: number, p: { minX: number; maxX: number; minZ: number; maxZ: number }): number {
  const dx = Math.max(p.minX - px, 0, px - p.maxX), dz = Math.max(p.minZ - pz, 0, pz - p.maxZ);
  return Math.hypot(dx, dz);
}

/** Why a spot is not clear for a prop (null = clear). The tests hold every placed prop to it. */
export function blockedBy(w: StoryWorldSpec, x: number, z: number, tall: boolean): string | null {
  for (const s of Object.values(w.spawns)) if (Math.hypot(x - s.pos.x, z - s.pos.z) < CLEAR.spawn) return 'spawn';
  for (const g of w.gates) if (Math.hypot(x - g.pos.x, z - g.pos.z) < g.radius + CLEAR.gate) return 'gate';
  for (const e of w.encounters) {
    for (const m of e.monsters) if (Math.hypot(x - m.pos.x, z - m.pos.z) < CLEAR.monster) return 'monster';
    if (e.boss && Math.hypot(x - e.boss.pos.x, z - e.boss.pos.z) < CLEAR.boss) return 'boss';
  }
  for (const r of w.rails) for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1], b = r.points[i];
    if (distToSegXZ(x, z, a.x, a.z, b.x, b.z) < CLEAR.rail) return 'rail';
  }
  for (const wall of w.walls) if (distToSegXZ(x, z, wall.a.x, wall.a.z, wall.b.x, wall.b.z) < (tall ? CLEAR.tallBlock : CLEAR.block) + 3) return 'wall';
  for (const p of w.pieces) if (p.kind === 'block' && distToBox(x, z, p) < (tall ? CLEAR.tallBlock : CLEAR.block)) return 'block';
  for (const d of w.decor ?? []) if (distToBox(x, z, { minX: d.x - d.w / 2, maxX: d.x + d.w / 2, minZ: d.z - d.d / 2, maxZ: d.z + d.d / 2 }) < CLEAR.block) return 'decor';
  return null;
}

/** The props for one world: along each flat's long edges, inside it, only on that flat's own top, only where clear. */
export function dressPlan(w: StoryWorldSpec): DressProp[] {
  const out: DressProp[] = [];
  const flats = w.pieces.filter((p): p is Extract<GroundPiece, { kind: 'flat' }> => p.kind === 'flat');
  const isHub = w.id === 'hub';
  flats.forEach((f, fi) => {
    const width = f.maxX - f.minX, depth = f.maxZ - f.minZ;
    // the edges a prop lines: the two long sides (x edges for a lane running in z), and all four on a square (the hub, the arena)
    const sides: Array<{ along: 'x' | 'z'; at: number; inward: 1 | -1; from: number; to: number }> = [];
    if (depth >= width * 0.8) { sides.push({ along: 'z', at: f.minX, inward: 1, from: f.minZ, to: f.maxZ }, { along: 'z', at: f.maxX, inward: -1, from: f.minZ, to: f.maxZ }); }
    if (width >= depth * 0.8) { sides.push({ along: 'x', at: f.minZ, inward: 1, from: f.minX, to: f.maxX }, { along: 'x', at: f.maxZ, inward: -1, from: f.minX, to: f.maxX }); }
    const halfAcross = (s: (typeof sides)[number]) => (s.along === 'z' ? width : depth) / 2;
    sides.forEach((s, si) => {
      const n = Math.max(1, Math.floor((s.to - s.from) / CLEAR.every));
      for (let k = 0; k < n; k++) {
        const h = (c: number) => hash01(fi * 31 + si, k, c);
        const t = s.from + ((k + 0.2 + 0.6 * h(1)) / n) * (s.to - s.from);
        // tall where the place is wide enough to keep it off the middle (and in the hub's square), every third spot at most
        const tall = halfAcross(s) - CLEAR.tallMax >= CLEAR.tallFromMiddle && h(2) < (isHub ? 0.45 : 0.4);
        // the edge band first; where a rim or a wall stands on the edge, one or two steps further in (the hub's rim)
        let x = 0, z = 0, ok = false;
        for (let step = 0; step < 3 && !ok; step++) {
          const inset = (tall ? CLEAR.tallMin + h(3) * (CLEAR.tallMax - CLEAR.tallMin) : CLEAR.edgeMin + h(3) * (CLEAR.edgeMax - CLEAR.edgeMin)) + step * EDGE_STEP;
          if (tall && halfAcross(s) - inset < CLEAR.tallFromMiddle) break;
          x = s.along === 'z' ? s.at + s.inward * inset : t; z = s.along === 'z' ? t : s.at + s.inward * inset;
          // only on this flat's own top (nothing higher over it), only where clear
          const y = groundYOf(w.pieces, x, z);
          ok = y !== null && Math.abs(y - f.y) <= 1e-6 && !blockedBy(w, x, z, tall);
        }
        if (!ok) continue;
        const r = h(4);
        const model: DressModel = tall
          ? (isHub ? (r < 0.5 ? 'oak' : 'tree') : r < 0.4 ? 'pine' : r < 0.75 ? 'pineTall' : 'oak')
          : r < 0.45 ? 'grass' : r < 0.7 ? 'bush' : r < 0.85 ? 'rockSmall' : 'rockFlat';
        const scale = tall ? 3.6 + h(5) * 1.4 : model === 'grass' ? 2.2 + h(5) : model === 'bush' ? 1.6 + h(5) * 0.6 : 1.4 + h(5) * 0.8;
        out.push({ model, x, y: f.y, z, yaw: h(6) * Math.PI * 2, scale });
      }
    });
  });
  return out;
}

/** The lip bands: one per flat edge (x0, z0, x1, z1 along the edge at the flat's height), outward normal. */
export function lipsOf(w: StoryWorldSpec): Array<{ x: number; z: number; len: number; alongX: boolean; y: number; nx: number; nz: number }> {
  const out: Array<{ x: number; z: number; len: number; alongX: boolean; y: number; nx: number; nz: number }> = [];
  for (const p of w.pieces) {
    if (p.kind !== 'flat') continue;
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2, wx = p.maxX - p.minX, dz = p.maxZ - p.minZ;
    out.push({ x: cx, z: p.minZ, len: wx, alongX: true, y: p.y, nx: 0, nz: -1 }, { x: cx, z: p.maxZ, len: wx, alongX: true, y: p.y, nx: 0, nz: 1 });
    out.push({ x: p.minX, z: cz, len: dz, alongX: false, y: p.y, nx: -1, nz: 0 }, { x: p.maxX, z: cz, len: dz, alongX: false, y: p.y, nx: 1, nz: 0 });
  }
  return out;
}

/** The rail posts: every POST_EVERY metres along each rail, where there is ground under it (no post hangs into a void). */
export const POST_EVERY = 6;
export function railPostsOf(w: StoryWorldSpec): Array<{ x: number; z: number; top: number; bottom: number }> {
  const out: Array<{ x: number; z: number; top: number; bottom: number }> = [];
  for (const r of w.rails) {
    const p = buildRailPath(r);
    // walk the path, a post every POST_EVERY metres (the first half a spacing in), interpolated within a stretch
    let next = POST_EVERY / 2, run = 0;
    for (let i = 1; i < p.xs.length; i++) {
      const len = Math.hypot(p.xs[i] - p.xs[i - 1], p.zs[i] - p.zs[i - 1]);
      while (len > 0 && next <= run + len) {
        const t = (next - run) / len;
        const x = p.xs[i - 1] + t * (p.xs[i] - p.xs[i - 1]), y = p.ys[i - 1] + t * (p.ys[i] - p.ys[i - 1]), z = p.zs[i - 1] + t * (p.zs[i] - p.zs[i - 1]);
        next += POST_EVERY;
        const g = groundYOf(w.pieces, x, z);
        if (g === null || y - g < 0.3) continue;
        out.push({ x, z, top: y - 0.06, bottom: g });
      }
      run += len;
    }
  }
  return out;
}

// ── the view (Babylon) ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Per world: what the tops are (a ground texture), the tints (the old palette, lifted so the texture shows). [PLACEHOLDER] look */
const DRESS_LOOK: Readonly<Record<string, { top: 'grass' | 'concrete'; topTint: string; side: string; block: string; wall: string; lip: string; cap: string }>> = {
  hub: { top: 'concrete', topTint: '#c9c6cf', side: '#7c766e', block: '#a8a29e', wall: '#d6d3d1', lip: '#57534e', cap: '#e7e5e4' },
  w1: { top: 'grass', topTint: '#ffffff', side: '#8a7a66', block: '#9c958c', wall: '#cfc8bd', lip: '#4a3f33', cap: '#d6d0c4' },
};
const DEFAULT_DRESS = DRESS_LOOK.w1;
/** The textures' anisotropic filtering in the story (groundTextures paints them at 8, for the courts' long grazing views). A phone
 *  pays for every tap of it on a full-screen floor: the measured rig frame cost (World 1 p95 +27 % at 8) is the reason. [TUNE] */
export const DRESS_ANISO = 1;
/** Metres one tile of a texture covers on the tops and on the stone. */
const TOP_TILE_M = { grass: 4, concrete: 6 } as const;
const STONE_TILE_M = 5;

/** A matte material tinted `hex`; `tex` (one shared texture per kind, cached per scene) tiles through the mesh's world-metre UVs. */
function tinted(scene: Scene, name: string, tex: Texture | null, hex: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = Color3.Black();   // matte: no specular term to shade
  if (tex) m.diffuseTexture = tex;
  m.freeze();   // nothing on it changes after the build
  return m;
}

/** World-metre UVs on a merged mesh (its vertices are in world space): tops tile x / z, faces facing x tile z / y, others x / y. */
export function boxProjectUVs(mesh: Mesh, tileTop: number, tileSide: number): void {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind), nor = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!pos || !nor) return;
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    const ax = Math.abs(nor[i]), ay = Math.abs(nor[i + 1]), az = Math.abs(nor[i + 2]);
    if (ay >= ax && ay >= az) { uv[j] = pos[i] / tileTop; uv[j + 1] = pos[i + 2] / tileTop; }
    else if (ax >= az) { uv[j] = pos[i + 2] / tileSide; uv[j + 1] = pos[i + 1] / tileSide; }
    else { uv[j] = pos[i] / tileSide; uv[j + 1] = pos[i + 1] / tileSide; }
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uv, false);
}

/** Split a merged mesh's triangles into its tops (sub-mesh 0) and its sides (sub-mesh 1), for a two-material look. */
export function splitTopsAndSides(mesh: Mesh): void {
  const idx = mesh.getIndices(), nor = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!idx || !nor) return;
  const tops: number[] = [], sides: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ny = (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) / 3;
    (ny > 0.7 ? tops : sides).push(a, b, c);
  }
  mesh.setIndices([...tops, ...sides]);
  const n = mesh.getTotalVertices();
  mesh.subMeshes = [];
  new SubMesh(0, 0, n, 0, tops.length, mesh);
  new SubMesh(1, 0, n, tops.length, sides.length, mesh);
}

/** What the dressing found to restyle in a built story view (world/story/view.ts names its merged meshes `story_<world>_<group>`). */
export interface WorldDress {
  /** Start loading the nature kit (once; the mode calls it after the first played second, so it never lengthens the load). Resolves
   *  with the props drawn once it has landed (or failed: the textures and trims stay either way). */
  loadProps(): Promise<number>;
  dispose(): void;
}

/**
 * Dress the story's worlds. `restyle` the view's merged meshes (by name); add the trims and the props. Cheap and synchronous but
 * for the props, which load in the background.
 */
export function mountWorldDress(scene: Scene, worlds: readonly StoryWorldSpec[], natureUrl = '/models/props/nature/'): WorldDress {
  const owned: { dispose(): void }[] = [];
  const stone = groundTexture(scene, 'concrete');
  if (stone) stone.anisotropicFilteringLevel = DRESS_ANISO;
  for (const w of worlds) {
    const L = DRESS_LOOK[w.id] ?? DEFAULT_DRESS;
    const topTex = groundTexture(scene, L.top);
    if (topTex) topTex.anisotropicFilteringLevel = DRESS_ANISO;
    // the surfaces: the ground (tops textured, sides stone), the blocks and the walls (stone), all in world metres
    const ground = scene.getMeshByName(`story_${w.id}_ground`) as Mesh | null;
    if (ground) {
      boxProjectUVs(ground, TOP_TILE_M[L.top], STONE_TILE_M);
      splitTopsAndSides(ground);
      const mm = new MultiMaterial(`dress_${w.id}_ground`, scene);
      mm.subMaterials.push(tinted(scene, `dress_${w.id}_top`, topTex, L.topTint), tinted(scene, `dress_${w.id}_side`, stone, L.side));
      owned.push(...(mm.subMaterials.filter(Boolean) as StandardMaterial[]), mm);
      ground.material = mm;
    }
    for (const [g, hex] of [['block', L.block], ['wall', L.wall]] as const) {
      const m = scene.getMeshByName(`story_${w.id}_${g}`) as Mesh | null;
      if (!m) continue;
      boxProjectUVs(m, STONE_TILE_M, STONE_TILE_M);
      const mat = tinted(scene, `dress_${w.id}_${g}`, stone, hex);
      owned.push(mat);
      m.material = mat;
    }
    // the trims: the lip band down each flat's edge, a coping cap on each block, the rail posts — one merged mesh each
    const lips = lipsOf(w).map((l, i) => {
      const b = MeshBuilder.CreateBox(`dress_lip_${i}`, l.alongX ? { width: l.len + 0.12, height: 0.35, depth: 0.06 } : { width: 0.06, height: 0.35, depth: l.len + 0.12 }, scene);
      b.position.set(l.x + l.nx * 0.03, l.y - 0.175, l.z + l.nz * 0.03);
      return b;
    });
    const caps = w.pieces.filter((p) => p.kind === 'block').map((p, i) => {
      const q = p as Extract<GroundPiece, { kind: 'block' }>;
      const b = MeshBuilder.CreateBox(`dress_cap_${i}`, { width: q.maxX - q.minX + 0.16, height: 0.13, depth: q.maxZ - q.minZ + 0.16 }, scene);
      b.position.set((q.minX + q.maxX) / 2, q.top - 0.055, (q.minZ + q.maxZ) / 2);
      return b;
    });
    const posts = railPostsOf(w).map((p, i) => {
      const h = p.top - p.bottom;
      const c = MeshBuilder.CreateCylinder(`dress_post_${i}`, { diameter: 0.12, height: h, tessellation: 8 }, scene);
      c.position.set(p.x, p.bottom + h / 2, p.z);
      return c;
    });
    for (const [name, parts, hex] of [['lip', lips, L.lip], ['cap', caps, L.cap], ['post', posts, '#94a3b8']] as const) {
      if (!parts.length) continue;
      const m = parts.length > 1 ? Mesh.MergeMeshes(parts as Mesh[], true, true) : parts[0];
      if (!m) continue;
      m.name = `dress_${w.id}_${name}`;
      const mat = tinted(scene, `dress_${w.id}_${name}_mat`, name === 'cap' ? stone : null, hex);
      if (name === 'cap') boxProjectUVs(m, STONE_TILE_M, STONE_TILE_M);
      m.material = mat; m.isPickable = false; m.receiveShadows = true; m.freezeWorldMatrix();
      owned.push(m, mat);
    }
  }
  // the nature kit, in the background, when asked
  let disposed = false;
  let props: Promise<number> | null = null;
  const load = async (): Promise<number> => {
    const plan = worlds.flatMap((w) => dressPlan(w));
    const used = [...new Set(plan.map((p) => p.model))];
    let drawn = 0;
    for (const id of used) {
      if (disposed || scene.isDisposed) return drawn;
      const masters = await loadKitMasters(scene, id, natureUrl).catch(() => [] as Mesh[]);
      if (disposed || scene.isDisposed) { for (const m of masters) m.dispose(); return drawn; }
      const mine = plan.filter((p) => p.model === id);
      const mats = mine.map((p) => Matrix.Compose(new Vector3(p.scale, p.scale, p.scale), Quaternion.RotationYawPitchRoll(p.yaw, 0, 0), new Vector3(p.x, p.y, p.z)));
      for (const m of masters) {
        for (const x of mats) m.thinInstanceAdd(x, false);
        m.thinInstanceBufferUpdated('matrix');
        m.thinInstanceRefreshBoundingInfo(false);
        m.setEnabled(true);
        m.freezeWorldMatrix();
        m.receiveShadows = false;   // small props on a lit floor: their own shading reads, a shadow lookup per pixel is not worth it
        m.material?.freeze();
        owned.push(m);
      }
      drawn += mine.length;
    }
    return drawn;
  };
  return {
    loadProps: () => (props ??= load().catch(() => 0)),
    dispose(): void { disposed = true; for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch { /* gone */ } } },
  };
}

/** The Kenney kit's metallic-with-no-map materials read as dark gems under image light: matte, leaves green (the Coast's fix). */
const KIT_PALETTE: Record<string, string> = { leafsGreen: '#3F9A55', leafsDark: '#2F7A45', grass: '#4C9E58', woodBark: '#8B5E3C', woodBarkDark: '#6E4A30', dirt: '#8A7A66', stone: '#9a958c' };
function normaliseKit(mat: PBRMaterial): void {
  if (mat.unlit) mat.unlit = false;
  if (!mat.metallicTexture && (mat.metallic ?? 0) > 0.5) { mat.metallic = 0; mat.roughness = 0.9; }
  const hex = KIT_PALETTE[mat.name]; if (hex && !mat.albedoTexture) mat.albedoColor = Color3.FromHexString(hex);
}

/** One kit model's parts, baked to model space and merged by material, parked at the origin (thin-instance masters). */
async function loadKitMasters(scene: Scene, id: DressModel, natureUrl: string): Promise<Mesh[]> {
  const r = await SceneLoader.ImportMeshAsync('', natureUrl, DRESS_MODELS[id].file, scene);
  const root = (r.meshes.find((x) => !x.parent) as TransformNode | undefined) ?? null;
  if (!root || scene.isDisposed) return [];
  root.computeWorldMatrix(true);
  const groups = new Map<number, Mesh[]>();
  for (const part of root.getChildMeshes(false) as Mesh[]) {
    if (!(part.getTotalVertices?.() > 0) || !part.material) continue;
    if (part.material instanceof PBRMaterial) normaliseKit(part.material);
    part.computeWorldMatrix(true);
    const c = part.clone(`${part.name}_dress`, null, true, false) as Mesh;
    c.parent = null;
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
    one.name = `dress_prop_${id}_${masters.length}`;
    one.material = mat; one.isPickable = false; one.receiveShadows = true;
    one.setEnabled(false);
    masters.push(one);
  }
  for (const n of [root, ...r.transformNodes]) { try { n.dispose(false, false); } catch { /* gone */ } }
  return masters;
}
