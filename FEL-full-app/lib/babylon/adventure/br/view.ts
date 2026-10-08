/**
 * The BR, drawn (Babylon; the sim never sees this file). The map from its pieces — merged by material, so the whole
 * 320 m map is a handful of draw calls — the rails (A1's merged rail mesh), the storm (a translucent wall at the
 * circle's edge up to its ceiling, and a lid at the ceiling), the next circle (a thin ring on the ground), the chests
 * and the loot (thin instances: one draw per loot kind, however many items lie on the map).
 *
 * Budget (plan: ≤ 450 draws / ≤ 300 active meshes on a phone): the static map ~8 merged meshes, the rails 1, the storm
 * 3, the loot 7 thin-instanced meshes, the chests 2. Placeholder art throughout ([PLACEHOLDER]: the owner decides the
 * look); generic colours, no franchise palette.
 */

import {
  Color3, Matrix, Mesh, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Material, type Scene,
} from '@babylonjs/core';
import { VenueKit } from '../../visual/VenueKit';
import type { GroundPiece } from '../world/pieces';
import { buildRailMeshes } from '../rails/view';
import type { BRMap } from './map';
import type { ZoneState } from './zone';
import type { LootField } from './lootField';
import { LOOT_KINDS, lootById, type LootKind } from './loot';

export const LOOT_TINT: Readonly<Record<LootKind, string>> = {
  ability: '#f472b6', spell: '#38bdf8', shard: '#facc15', weapon: '#e2e8f0', armour: '#94a3b8', charm: '#a78bfa', boots: '#34d399',
};
const TILE_TINT: Readonly<Record<string, string>> = {
  plaza: '#a8a29e', tower: '#78716c', mesa: '#b45309', ruins: '#8b8478', grove: '#3f6212', field: '#6b705c', rim: '#57534e',
};

/**
 * A lit surface is the house paint (VenueKit.paint: PBR — the venues light for PBR and a StandardMaterial clips to white
 * under it); only the storm's unlit glow is a StandardMaterial with its lighting off.
 */
function mat(scene: Scene, name: string, hex: string, o: { emissive?: number; alpha?: number; unlit?: boolean } = {}): Material {
  if (!o.unlit) {
    const p = VenueKit.paint(scene, name, hex, o.emissive ?? 0.06);
    if (o.alpha !== undefined) { p.alpha = o.alpha; p.backFaceCulling = false; }
    return p;
  }
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  if (o.emissive) m.emissiveColor = Color3.FromHexString(hex).scale(o.emissive);
  if (o.unlit) { m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex); }
  if (o.alpha !== undefined) { m.alpha = o.alpha; m.backFaceCulling = false; }
  return m;
}

function pieceMesh(scene: Scene, p: GroundPiece): Mesh | null {
  const w = p.maxX - p.minX, d = p.maxZ - p.minZ, cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
  if (p.kind === 'block') {
    const h = Math.max(0.05, p.top - p.y0);
    const m = MeshBuilder.CreateBox(`br_${p.id}`, { width: w, height: h, depth: d }, scene);
    m.position.set(cx, p.y0 + h / 2, cz);
    return m;
  }
  if (p.kind === 'ramp') {
    const along = p.axis === 'z' ? d : w, rise = p.y1 - p.y0;
    const len = Math.hypot(along, rise), ang = Math.atan2(rise, along);
    const m = MeshBuilder.CreateBox(`br_${p.id}`, p.axis === 'z' ? { width: w, height: 0.3, depth: len } : { width: len, height: 0.3, depth: d }, scene);
    m.position.set(cx, (p.y0 + p.y1) / 2 - 0.15, cz);
    if (p.axis === 'z') m.rotation.x = -ang; else m.rotation.z = ang;
    return m;
  }
  return null;
}

export interface BRMapView { dispose(): void; readonly meshes: number }

/** The static map: ground, the tiles' pieces merged by tile kind, the rim, the rails. */
export function buildBRMapView(scene: Scene, map: BRMap): BRMapView {
  const owned: { dispose(): void }[] = [];
  const H = map.bounds.maxX + 2;
  const ground = MeshBuilder.CreateGround('br_ground', { width: H * 2, height: H * 2, subdivisions: 1 }, scene);
  ground.material = mat(scene, 'br_ground_mat', '#4d5b3f');
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();
  owned.push(ground, ground.material);
  // the streets: a lighter band under every rail line, so the routes read from the air
  const streets: Mesh[] = [];
  for (const seg of map.rails.segments) {
    const a = seg.points[0], b = seg.points[seg.points.length - 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 2) continue;
    const s = MeshBuilder.CreateGround(`br_street_${seg.id}`, { width: 3.5, height: len }, scene);
    s.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
    s.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    streets.push(s);
  }
  const groups = new Map<string, Mesh[]>();
  const add = (k: string, m: Mesh) => { let g = groups.get(k); if (!g) { g = []; groups.set(k, g); } g.push(m); };
  for (const p of map.pieces) {
    if (p.kind === 'flat') continue;
    const m = pieceMesh(scene, p);
    if (!m) continue;
    const kind = p.id.startsWith('br.rim') ? 'rim' : map.tiles.find((t) => p.id.startsWith(`${t.id}.`))?.kind ?? 'rim';
    add(kind, m);
  }
  if (streets.length) groups.set('street', streets);
  for (const [k, ms] of groups) {
    const merged = ms.length === 1 ? ms[0] : Mesh.MergeMeshes(ms, true, true);
    if (!merged) continue;
    merged.name = `br_${k}`;
    merged.material = mat(scene, `br_${k}_mat`, k === 'street' ? '#7c7a6e' : TILE_TINT[k] ?? '#78716c');
    merged.isPickable = false;
    merged.freezeWorldMatrix();
    owned.push(merged, merged.material!);
  }
  const rails = buildRailMeshes(scene, map.rails, { diameter: 0.14, color: '#e2e8f0' });
  if (rails) owned.push(rails);
  return { meshes: owned.length, dispose: () => { for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose(); } };
}

export interface ZoneView { sync(z: ZoneState): void; dispose(): void }

/** The storm wall at the circle's edge up to the ceiling, a lid at the ceiling, and the next circle's ring. */
export function buildZoneView(scene: Scene): ZoneView {
  const wallMat = mat(scene, 'br_storm_mat', '#7c3aed', { unlit: true, alpha: 0.22 });
  const wall = MeshBuilder.CreateCylinder('br_storm', { diameter: 2, height: 1, tessellation: 64, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, scene);
  wall.material = wallMat; wall.isPickable = false;
  const lidMat = mat(scene, 'br_lid_mat', '#a78bfa', { unlit: true, alpha: 0.08 });
  const lid = MeshBuilder.CreateDisc('br_lid', { radius: 1, tessellation: 64, sideOrientation: Mesh.DOUBLESIDE }, scene);
  lid.rotation.x = Math.PI / 2; lid.material = lidMat; lid.isPickable = false;
  const ringMat = mat(scene, 'br_next_mat', '#f8fafc', { unlit: true, alpha: 0.75 });
  const ring = MeshBuilder.CreateTorus('br_next', { diameter: 2, thickness: 0.02, tessellation: 64 }, scene);
  ring.material = ringMat; ring.isPickable = false;
  const owned = [wall, wallMat, lid, lidMat, ring, ringMat];
  return {
    sync(z: ZoneState): void {
      const c = z.cur;
      const r = Math.max(0.01, c.r);
      wall.position.set(c.x, c.ceilingY / 2, c.z);
      wall.scaling.set(r, c.ceilingY, r);
      lid.position.set(c.x, c.ceilingY, c.z);
      lid.scaling.set(r, r, 1);
      const n = z.circles[Math.min(z.index + 1, z.circles.length - 1)];
      const show = z.stage !== 'closed' && n.r > 0.5;
      if (ring.isEnabled() !== show) ring.setEnabled(show);
      if (show) {
        ring.position.set(n.x, 0.15, n.z);
        // a ring's thickness scales with it: keep the band about 0.4 m whatever the radius
        ring.scaling.set(n.r, 1, n.r);
      }
    },
    dispose() { for (const o of owned) o.dispose(); },
  };
}

export interface LootView { sync(field: LootField): void; dispose(): void }

/** Loot as thin instances (one draw per kind), and the chests (shut and open). Re-filled only when the field changes. */
export function buildLootView(scene: Scene): LootView {
  const owned: { dispose(): void }[] = [];
  const masters = new Map<LootKind, Mesh>();
  for (const k of LOOT_KINDS) {
    const m = k === 'spell' ? MeshBuilder.CreateCylinder(`br_loot_${k}`, { diameter: 0.35, height: 0.6, tessellation: 8 }, scene)
      : k === 'shard' ? MeshBuilder.CreatePolyhedron(`br_loot_${k}`, { type: 1, size: 0.3 }, scene)
        : k === 'weapon' ? MeshBuilder.CreateBox(`br_loot_${k}`, { width: 0.12, height: 0.9, depth: 0.12 }, scene)
          : MeshBuilder.CreateBox(`br_loot_${k}`, { size: 0.45 }, scene);
    m.material = mat(scene, `br_loot_${k}_mat`, LOOT_TINT[k], { emissive: 0.55 });
    m.isPickable = false;
    m.thinInstanceCount = 0;
    masters.set(k, m);
    owned.push(m, m.material!);
  }
  const chestMat = mat(scene, 'br_chest_mat', '#b45309', { emissive: 0.2 });
  const openMat = mat(scene, 'br_chest_open_mat', '#57534e');
  const chest = MeshBuilder.CreateBox('br_chest', { width: 1.2, height: 0.8, depth: 0.8 }, scene);
  chest.material = chestMat; chest.isPickable = false; chest.thinInstanceCount = 0;
  const opened = MeshBuilder.CreateBox('br_chest_open', { width: 1.2, height: 0.5, depth: 0.8 }, scene);
  opened.material = openMat; opened.isPickable = false; opened.thinInstanceCount = 0;
  owned.push(chest, opened, chestMat, openMat);
  let lastKey = '';
  const tmp = Matrix.Identity(), q = Quaternion.Identity(), one = new Vector3(1, 1, 1), at = new Vector3();
  const fill = (m: Mesh, ps: { x: number; y: number; z: number }[], lift: number) => {
    const buf = new Float32Array(Math.max(1, ps.length) * 16);
    ps.forEach((p, i) => { at.set(p.x, p.y + lift, p.z); Matrix.ComposeToRef(one, q, at, tmp); tmp.copyToArray(buf, i * 16); });
    m.thinInstanceSetBuffer('matrix', buf, 16, false);
    m.thinInstanceCount = ps.length;
  };
  return {
    sync(field: LootField): void {
      const items = field.items, chests = field.chests;
      // the key changes only when an item or a chest changed (uids are never reused)
      let key = `${items.length}:${items.length ? items[items.length - 1].uid : 0}:`;
      for (const c of chests) key += c.open ? '1' : '0';
      if (items.length) key += `:${items[0].uid}`;
      if (key === lastKey) return;
      lastKey = key;
      const by = new Map<LootKind, { x: number; y: number; z: number }[]>();
      for (const it of items) {
        const d = lootById(it.lootId);
        if (!d) continue;
        let a = by.get(d.kind); if (!a) { a = []; by.set(d.kind, a); }
        a.push(it.pos);
      }
      for (const [k, m] of masters) fill(m, by.get(k) ?? [], 0.6);
      fill(chest, chests.filter((c) => !c.open).map((c) => c.pos), 0.4);
      fill(opened, chests.filter((c) => c.open).map((c) => c.pos), 0.25);
    },
    dispose() { for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose(); },
  };
}
