// AERO WORLDS — the places the Aero Aces circuits are flown through (2026-09-15, owner: Aero Aces "like diddy Kong
// flyers"; THEMED LAP CIRCUITS through canyons, islands and caves).
//
// The ring courses borrowed a court-sized venue and dressed the path with posts; a circuit flown LOW needs the ground
// itself to be the course. So each world is built FROM the circuit's own functions (aeroCircuits.ts):
//   · TERRAIN — one grid mesh whose heights ARE `floorAt`, so the ground the plane is held above is the ground you see.
//     Coloured per vertex by height and steepness: sand floor → banded red rock in the canyon; seabed → beach → grass →
//     rock on the islands; snow → blue ice walls in the glacier. A detail texture keeps it from reading as flat paint.
//   · the SEA under the islands — the same Gerstner ocean the surf break uses.
//   · ARCHES over the line (rock / ice), the ICE CAVE tube with icicles, a START / FINISH banner.
//   · SCENERY along both edges of the corridor — Kenney rocks, palms and pines, thin-instanced (VenueProps).
//   · a HORIZON ring of mesas / peaks so the world does not end at the terrain's edge.

import { Color3, Color4, DynamicTexture, HemisphericLight, Matrix, Mesh, MeshBuilder, ParticleSystem, Quaternion, TransformNode, Vector3, VertexData, type AbstractMesh } from '@babylonjs/core';
import { PBRMaterial } from '@babylonjs/core';
import type { Camera, Scene } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { groundDetailTexture, type GroundKind } from '../visual/groundTextures';
import { mountOcean, type OceanHandle } from '../visual/OceanSurface';
import { mountVenueProps, type VenuePropsHandle } from '../visual/VenueProps';
import { VENUE_PROP_SETS, type PropPlacement } from '../visual/venuePropSets';
import { locate, pointAlong, type AeroCircuit } from './aeroCircuits';

export interface AeroWorld {
  root: TransformNode;
  ocean: OceanHandle | null;
  update(dt: number, camera: Camera): void;
  dispose(): void;
}

const THEME = {
  canyon: { floor: '#d9a066', low: '#c9602e', high: '#96391d', band: '#e8b27a', top: '#c08050', detail: 'sand' as GroundKind | null },
  island: { floor: '#efdfae', low: '#78c85a', high: '#8a8378', band: '#4f9a3f', top: '#9c958a', detail: 'grass' as GroundKind | null },
  glacier: { floor: '#eef4fb', low: '#b8d6f0', high: '#6fa3d6', band: '#dbeaf7', top: '#ffffff', detail: null },
  // MAP EXPANSION (2026-09-18): black basalt with glowing cracks and a lava lake; a night bay under lit towers
  volcano: { floor: '#3a2a26', low: '#2a1f1c', high: '#15100e', band: '#ff6a2a', top: '#4a3a34', detail: null },
  city: { floor: '#0e1622', low: '#22304a', high: '#141c2a', band: '#ffd27a', top: '#2a3548', detail: 'concrete' as GroundKind | null },
};

const hex = (h: string): Color3 => Color3.FromHexString(h);

/** The terrain grid: heights from the circuit, colours from height + steepness. */
function buildTerrain(scene: Scene, c: AeroCircuit, root: TransformNode): Mesh {
  const xs = c.line.pts.map((p) => p.x), zs = c.line.pts.map((p) => p.z);
  const margin = 300;
  const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin;
  const minZ = Math.min(...zs) - margin, maxZ = Math.max(...zs) + margin;
  const cell = 5;
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell);
  const pal = THEME[c.theme];
  const cFloor = hex(pal.floor), cLow = hex(pal.low), cHigh = hex(pal.high), cBand = hex(pal.band), cTop = hex(pal.top);
  const seabed = c.theme === 'island' ? -6 : c.theme === 'city' ? -6 : c.theme === 'volcano' ? -4 : 0;

  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = minX + i * cell, z = minZ + j * cell;
    let h = c.floorAt(x, z);
    if (c.theme === 'island' && h <= 0.01) h = seabed;          // open water: the seabed sits under the sea
    if (c.theme === 'city' && h <= -5.9) h = seabed;
    heights[j * (nx + 1) + i] = h;
  }
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const col = new Color3();
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i;
    const x = minX + i * cell, z = minZ + j * cell, y = heights[k];
    positions.push(x, y, z);
    uvs.push(x / 6, z / 6);
    const hx = heights[j * (nx + 1) + Math.min(nx, i + 1)] - heights[j * (nx + 1) + Math.max(0, i - 1)];
    const hz = heights[Math.min(nz, j + 1) * (nx + 1) + i] - heights[Math.max(0, j - 1) * (nx + 1) + i];
    const steep = Math.min(1, Math.hypot(hx, hz) / (cell * 2) / 1.2);
    if (c.theme === 'canyon') {
      // sand on the floor, banded red rock up the walls, a paler cap on the top
      const up = Math.min(1, Math.max(0, (y - 4) / 60));
      Color3.LerpToRef(cLow, cHigh, up, col);
      if (Math.sin(y * 0.55) > 0.72) Color3.LerpToRef(col, cBand, 0.45, col);
      Color3.LerpToRef(cFloor, col, Math.min(1, steep * 1.6 + (y > 8 ? 0.6 : 0)), col);
      if (y > 62 && steep < 0.35) Color3.LerpToRef(col, cTop, 0.7, col);
    } else if (c.theme === 'island') {
      if (y < 0.6) Color3.LerpToRef(hex('#5a8fa0'), cFloor, Math.max(0, (y + 6) / 6.6), col);        // seabed → wet sand
      else if (y < 2.5) col.copyFrom(cFloor);                                                          // beach
      else Color3.LerpToRef(cLow, cHigh, Math.min(1, steep * 1.4 + Math.max(0, (y - 18) / 14)), col);  // grass → rock
    } else if (c.theme === 'volcano') {
      // basalt everywhere; the lake bed glows through where it is low and flat, cracks glow up the walls in bands
      Color3.LerpToRef(cFloor, cHigh, Math.min(1, steep * 1.5 + Math.max(0, (y - 10) / 60)), col);
      if (y < -1) Color3.LerpToRef(col, cBand, 0.85, col);
      else if (y < 3 && steep < 0.25) Color3.LerpToRef(col, cBand, 0.35 * (1 - y / 3), col);
      if (Math.sin(y * 0.7 + x * 0.05) > 0.86 && steep > 0.4) Color3.LerpToRef(col, cBand, 0.55, col);
      if (y > 70 && steep < 0.3) Color3.LerpToRef(col, cTop, 0.6, col);
    } else if (c.theme === 'city') {
      // the bay is near-black water; the tower plinths are the buildings' own dark (their lit box stands over them)
      if (y < -3) col.copyFrom(hex('#050a14')); else col.copyFrom(cHigh);
    } else {
      // snow on the valley floor and tops, blue ice where it is steep
      Color3.LerpToRef(cFloor, cHigh, Math.min(1, steep * 1.8), col);
      if (Math.sin(y * 0.4) > 0.8 && steep > 0.3) Color3.LerpToRef(col, cLow, 0.5, col);
      if (steep < 0.2) Color3.LerpToRef(col, cTop, 0.6, col);
    }
    colors.push(col.r, col.g, col.b, 1);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, d = a + (nx + 1), e = d + 1;
    indices.push(a, b, d, b, e, d);   // wound to face UP: the first winding faced down and backface culling hid the whole ground from above
  }
  const vd = new VertexData();
  vd.positions = positions; vd.indices = indices; vd.colors = colors; vd.uvs = uvs;
  const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals); vd.normals = normals;
  const mesh = new Mesh(`aero_terrain_${c.theme}`, scene);
  vd.applyToMesh(mesh, false);
  // NO FLAT EMISSIVE ON THE DARK THEMES (2026-09-18): a 0.22 white emissive was meant to carry the vertex glow, but a
  // PBR emissive is the material's colour, not the vertex's — it washed the basalt to peach and painted the tower
  // plinths grey. The lava glows from the lake and an underlight; the towers from their own window textures.
  const mat = VenueKit.paint(scene, `aero_terrain_mat_${c.theme}`, '#ffffff', 0.03, c.theme === 'glacier' ? 0.55 : c.theme === 'city' ? 0.4 : 0.92);
  mat.environmentIntensity = c.theme === 'glacier' ? 0.7 : c.theme === 'city' ? 0.35 : 0.5;
  try {
    // snow takes no grain texture: the only candidate with no pattern read as TILES under a white vertex colour
    if (!pal.detail) throw new Error('no detail');
    const detail = groundDetailTexture(scene, pal.detail);
    // the SHARED per-scene detail texture, not a clone: a cloned DynamicTexture never reported ready, and a PBR material
    // waiting on it never drew — the canyon's terrain was active, picked, and invisible (isReady false, measured)
    const d = detail;
    // OPAQUE, explicitly: a canvas texture reports an alpha channel, and an albedo with alpha moved the whole terrain into
    // the transparent pass — the ground drew see-through and the sky dome's underside showed through the canyon floor
    d.hasAlpha = false;
    (mat as PBRMaterial).albedoTexture = d;
  } catch { /* headless: vertex colour alone */ }
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  mat.useAlphaFromAlbedoTexture = false;
  mesh.material = mat;
  mesh.receiveShadows = true;
  mesh.isPickable = true;          // the scenery snaps onto it
  mesh.parent = root;
  return mesh;
}

/** A rock / ice arch spanning the corridor at a distance along the line. */
function buildArch(scene: Scene, c: AeroCircuit, a: AeroCircuit['arches'][number], root: TransformNode, i: number): void {
  const { pos, tangent } = pointAlong(c.line, a.dist);
  const right = new Vector3(tangent.z, 0, -tangent.x);
  const half = a.span / 2;
  const top = pos.y + a.height;
  const path: Vector3[] = [];
  for (let k = 0; k <= 20; k++) {
    const t = Math.PI * (k / 20);
    const across = -Math.cos(t) * half;
    const base = c.floorAt(pos.x + right.x * across, pos.z + right.z * across);
    const y = base + (top - base) * Math.sin(t) - 2;
    path.push(new Vector3(pos.x + right.x * across, y, pos.z + right.z * across));
  }
  const arch = MeshBuilder.CreateTube(`aero_arch_${i}`, {
    path, radiusFunction: (k) => 6.5 - 2.2 * Math.sin(Math.PI * (k / 20)), tessellation: 9, cap: Mesh.CAP_ALL,
  }, scene);
  const m = c.theme === 'glacier'
    ? VenueKit.paint(scene, `aero_arch_mat_${i}`, '#a9d3f5', 0.08, 0.3)
    : c.theme === 'city'
      ? VenueKit.paint(scene, `aero_arch_mat_${i}`, c.course.tint, 0.9, 0.35)   // the sky bridge is a neon strip
      : VenueKit.paint(scene, `aero_arch_mat_${i}`, c.theme === 'canyon' ? '#a9482a' : c.theme === 'volcano' ? '#2a1f1c' : '#8a8378', c.theme === 'volcano' ? 0.12 : 0.04, 0.95);
  arch.material = m; arch.parent = root; arch.isPickable = false;
}

/** The glacier's ice cave: a tube along the tunnel section, open at both ends, with icicles. */
function buildTunnel(scene: Scene, c: AeroCircuit, root: TransformNode): void {
  if (!c.tunnel) return;
  const { from, to, clear } = c.tunnel;
  const radius = c.corridor + 8;
  const path: Vector3[] = [];
  for (let d = from - 10; d <= to + 10; d += 6) { const p = pointAlong(c.line, d).pos; path.push(new Vector3(p.x, p.y + clear - radius, p.z)); }
  const tube = MeshBuilder.CreateTube('aero_ice_cave', { path, radius, tessellation: 22, sideOrientation: Mesh.DOUBLESIDE }, scene);
  // DEEP ice, darker than any sky: the first pale blue (#7fb6e6) was the alpine sky's own colour, so from inside the cave
  // the roof read as open air and the icicles hung from nothing (eye frame 2026-09-15)
  const lava = c.theme === 'volcano';
  const ice = lava ? VenueKit.paint(scene, 'aero_lava_tube_mat', '#1a100c', 0.35, 0.6) : VenueKit.paint(scene, 'aero_ice_cave_mat', '#1f4f86', 0.1, 0.3);
  if (lava) ice.emissiveColor = Color3.FromHexString('#7a2a10');   // the tube glows faintly from the rock
  ice.environmentIntensity = 0.55;
  tube.material = ice; tube.parent = root; tube.isPickable = false;
  const icicle = lava ? VenueKit.paint(scene, 'aero_stalactite_mat', '#2a1c18', 0.08, 0.9) : VenueKit.paint(scene, 'aero_icicle_mat', '#e6f4ff', 0.25, 0.2);
  // ONE icicle mesh, thin-instanced: as separate meshes the cave's ~60 icicles pushed the glacier to 1637 draws (budget 1600)
  const master = MeshBuilder.CreateCylinder('aero_icicle', { height: 1, diameterTop: 1.2, diameterBottom: 0, tessellation: 6 }, scene);
  master.material = icicle; master.isPickable = false;
  const mats: Matrix[] = [];
  for (let d = from; d <= to; d += 9) {
    const { pos, tangent } = pointAlong(c.line, d);
    const right = new Vector3(tangent.z, 0, -tangent.x);
    for (const side of [-1, 0.2, 1]) {
      const len = 3 + ((d * 13.7 + side * 7) % 5);
      const at = pos.add(right.scale(side * (c.corridor - 6))).addInPlace(new Vector3(0, clear - len / 2 - 0.5, 0));
      mats.push(Matrix.Compose(new Vector3(1, len, 1), Quaternion.Identity(), at));
    }
  }
  const buf = new Float32Array(mats.length * 16);
  mats.forEach((m, i) => m.copyToArray(buf, i * 16));
  master.thinInstanceSetBuffer('matrix', buf, 16, true);
  master.parent = root;
}

/** A checkered START / FINISH banner on two towers across the line. */
function buildStartBanner(scene: Scene, c: AeroCircuit, root: TransformNode): void {
  const { pos, tangent } = pointAlong(c.line, 0);
  const right = new Vector3(tangent.z, 0, -tangent.x);
  const yaw = Math.atan2(tangent.x, tangent.z);
  const half = c.corridor * 0.8;
  const post = VenueKit.paint(scene, 'aero_start_post', '#f4f1de', 0.08, 0.6);
  for (const s of [-1, 1]) {
    const base = pos.add(right.scale(s * half));
    const g = c.floorAt(base.x, base.z);
    const h = pos.y + 16 - g;
    const tower = MeshBuilder.CreateCylinder('aero_start_tower', { height: h, diameter: 2.2, tessellation: 10 }, scene);
    tower.position.set(base.x, g + h / 2, base.z); tower.material = post; tower.parent = root; tower.isPickable = false;
  }
  // the banner: black and white squares, two rows
  const black = VenueKit.paint(scene, 'aero_check_b', '#15171c', 0.02, 0.8), white = VenueKit.paint(scene, 'aero_check_w', '#f7f7f2', 0.12, 0.8);
  const n = 16, w = (half * 2) / n;
  for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
    const tile = MeshBuilder.CreateBox('aero_check', { width: w, height: 2.2, depth: 0.4 }, scene);
    const across = -half + w * (i + 0.5);
    tile.position.copyFrom(pos.add(right.scale(across))).addInPlace(new Vector3(0, 16 - r * 2.2, 0));
    tile.rotation.y = yaw;
    tile.material = (i + r) % 2 ? black : white; tile.parent = root; tile.isPickable = false;
  }
}

/** The horizon: mesas, island peaks or snow mountains standing well outside the terrain. */
function buildHorizon(scene: Scene, c: AeroCircuit, root: TransformNode): void {
  const color = c.theme === 'canyon' ? '#b0603a' : c.theme === 'island' ? '#4d8a55' : c.theme === 'volcano' ? '#2c2220' : c.theme === 'city' ? '#111827' : '#dfe9f4';
  const m = VenueKit.paint(scene, `aero_horizon_${c.theme}`, color, 0.1, 0.95);
  m.environmentIntensity = 0.35;
  const cap = VenueKit.paint(scene, `aero_horizon_cap_${c.theme}`, c.theme === 'glacier' ? '#ffffff' : c.theme === 'canyon' ? '#d69a64' : c.theme === 'volcano' ? '#ff5a2a' : c.theme === 'city' ? '#ffd27a' : '#6fa860', c.theme === 'volcano' || c.theme === 'city' ? 0.8 : 0.12, 0.9);   // glowing caps: the far volcanoes' craters, the skyline's lit roofs
  const R = 1150;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.05;
    const r = R + ((i * 97) % 260);
    const h = 60 + ((i * 53) % 110);
    const w = 90 + ((i * 31) % 140);
    const shape = c.theme === 'canyon' || c.theme === 'city'
      ? MeshBuilder.CreateCylinder(`aero_mesa_${i}`, { height: c.theme === 'city' ? h * 1.9 : h, diameterTop: w * (c.theme === 'city' ? 0.55 : 0.85), diameterBottom: w * (c.theme === 'city' ? 0.55 : 1), tessellation: c.theme === 'city' ? 4 : 7 }, scene)
      : MeshBuilder.CreateCylinder(`aero_peak_${i}`, { height: h * 1.6, diameterTop: c.theme === 'island' ? w * 0.2 : 0, diameterBottom: w * 1.3, tessellation: 8 }, scene);
    shape.position.set(Math.sin(a) * r, (c.theme === 'canyon' ? h : c.theme === 'city' ? h * 1.9 : h * 1.6) / 2 - (c.theme === 'island' || c.theme === 'city' ? 12 : 0), Math.cos(a) * r);
    shape.material = m; shape.parent = root; shape.isPickable = false;
    if (c.theme !== 'island') {
      const top = MeshBuilder.CreateCylinder(`aero_cap_${i}`, { height: c.theme === 'canyon' ? 4 : c.theme === 'city' ? 3 : h * 0.45, diameterTop: c.theme === 'canyon' ? w * 0.86 : c.theme === 'city' ? w * 0.56 : 0, diameterBottom: c.theme === 'canyon' ? w * 0.86 : c.theme === 'city' ? w * 0.56 : w * 0.45, tessellation: c.theme === 'city' ? 4 : 8 }, scene);
      top.position.set(shape.position.x, c.theme === 'canyon' ? h + 2 : c.theme === 'city' ? h * 1.9 - 12 + 1.5 : h * 1.6 - h * 0.22, shape.position.z);
      top.material = cap; top.parent = root; top.isPickable = false;
    }
  }
}

/**
 * A procedural window grid: dark glass, most windows lit warm, a few cool, a few dark — tiled up a tower. One texture
 * PER TOWER (never cloned: a cloned DynamicTexture never reports ready and its material never draws — see
 * fel-aero-dkr), each with its own seed so no two towers light the same.
 */
function windowTexture(scene: Scene, seed: number): DynamicTexture {
  const tex = new DynamicTexture(`aero_windows_${seed}`, { width: 128, height: 256 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, 128, 256);
  let s = 11 + seed * 97; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 6; y < 256; y += 14) for (let x = 6; x < 128; x += 12) {
    const r = rnd();
    ctx.fillStyle = r < 0.5 ? '#ffd27a' : r < 0.68 ? '#9fd1ff' : r < 0.78 ? '#fff4d6' : '#0a1020';
    ctx.fillRect(x, y, 7, 9);
  }
  tex.update(false);
  tex.hasAlpha = false;
  return tex;
}

/** THE TOWERS (2026-09-18): the city's buildings as lit boxes over their terrain plinths, with roofs and aviation beacons. */
function buildTowers(scene: Scene, c: AeroCircuit, root: TransformNode): void {
  if (!c.towers.length) return;
  const roof = VenueKit.paint(scene, 'aero_tower_roof_m', '#1a2333', 0.02, 0.8);
  const beacon = VenueKit.paint(scene, 'aero_tower_beacon_m', '#ff3b3b', 1.0, 0.4);
  c.towers.forEach(([x, z, hw, top], i) => {
    const w = hw * 2 + 2, h = top + 6.4;
    const box = MeshBuilder.CreateBox(`aero_tower_${i}`, { width: w, height: h, depth: w }, scene);
    box.position.set(x, top + 0.4 - h / 2, z);
    const mat = VenueKit.paint(scene, `aero_tower_glass_m_${i}`, '#0b1220', 0.0, 0.35);
    const tex = windowTexture(scene, i); tex.uScale = w / 9; tex.vScale = h / 18;
    mat.emissiveTexture = tex; mat.emissiveColor = Color3.White(); mat.metallic = 0.15;
    box.material = mat; box.isPickable = false; box.parent = root;
    const cap = MeshBuilder.CreateBox(`aero_tower_roof_${i}`, { width: w - 3, height: 1.2, depth: w - 3 }, scene);
    cap.position.set(x, top + 1, z); cap.material = roof; cap.isPickable = false; cap.parent = root;
    const light = MeshBuilder.CreateSphere(`aero_tower_beacon_${i}`, { diameter: 1.4, segments: 6 }, scene);
    light.position.set(x, top + 2.4, z); light.material = beacon; light.isPickable = false; light.parent = root;
    if (i % 3 === 0) {
      const mast = MeshBuilder.CreateCylinder(`aero_tower_mast_${i}`, { height: 14, diameter: 0.5 }, scene);
      mast.position.set(x, top + 8, z); mast.material = roof; mast.isPickable = false; mast.parent = root;
    }
  });
}

/** Scenery along both corridor edges, as a VenueProps set registered for this circuit. */
function sceneryFor(c: AeroCircuit): PropPlacement[] {
  const out: PropPlacement[] = [];
  const pick = (d: number, list: string[]) => list[Math.abs(Math.floor(d * 0.37)) % list.length];
  const step = c.theme === 'island' ? 26 : 18;   // denser near band (34/26 → 26/18)
  for (let d = 0; d < c.line.length; d += step) {
    const { pos, tangent } = pointAlong(c.line, d);
    const right = new Vector3(tangent.z, 0, -tangent.x);
    for (const side of [-1, 1]) {
      const off = c.corridor + 6 + ((d * 7.3 + side * 11) % 18);
      const at = pos.add(right.scale(side * off));
      // keep scenery off the racing line where the line curls back past this edge
      if (Math.abs(locate(c.line, at.x, at.z).lateral) < c.corridor) continue;
      const yaw = (d * 0.13 + side) % (Math.PI * 2);
      if (c.theme === 'canyon') {
        out.push({ kit: 'nature', model: pick(d + side, ['rock_largeA', 'rock_largeB', 'rock_tallA', 'rock_largeC', 'rock_tallB', 'rock_largeD']), at: [at.x, 0, at.z], yaw, scale: 5 + ((d * 3.1) % 5), tint: '#c9714a' });
      } else if (c.theme === 'island') {
        if (c.floorAt(at.x, at.z) < 1.5) continue;                 // palms stand on land
        out.push({ kit: 'nature', model: pick(d + side, ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall', 'tree_palm']), at: [at.x, 0, at.z], yaw, scale: 5.5 + ((d * 2.3) % 3) });
      } else if (c.theme === 'volcano') {
        if (c.floorAt(at.x, at.z) < 0) continue;                   // nothing stands in the lava
        out.push({ kit: 'nature', model: pick(d + side, ['rock_largeA', 'rock_tallA', 'rock_largeC', 'rock_tallB', 'rock_largeD']), at: [at.x, 0, at.z], yaw, scale: 5 + ((d * 3.1) % 5), tint: '#3a2a26' });
      } else if (c.theme === 'city') {
        if (c.floorAt(at.x, at.z) < 0) continue;                   // the bay: lights stand on the towers' skirts only
        out.push({ kit: 'racing', model: 'lightPostModern', at: [at.x, 0, at.z], yaw, scale: 6 });
      } else {
        out.push({ kit: 'nature', model: pick(d + side, ['tree_pineTallA', 'tree_pineTallB', 'rock_largeB', 'tree_pineRoundA']), at: [at.x, 0, at.z], yaw, scale: 5 + ((d * 2.9) % 4), tint: '#dfeee6' });
      }
    }
  }
  // A WORLD THAT READS FROM ALTITUDE (owner, 2026-09-19: "expand out and add detail to both the karting and aero ace
  // mode"). The band above hugs the corridor, which is all a pilot sees at gate height; from any climb the ground went
  // empty. A FAR BAND carries the same kit out to 60–260 m either side at a coarser step, so the map has depth.
  for (let d = 0; d < c.line.length; d += 62) {
    const { pos, tangent } = pointAlong(c.line, d);
    const right = new Vector3(tangent.z, 0, -tangent.x);
    for (const side of [-1, 1]) {
      for (const ring of [0, 1, 2]) {
        const off = c.corridor + 60 + ring * 70 + ((d * 5.1 + side * 23 + ring * 17) % 34);
        const at = pos.add(right.scale(side * off));
        if (Math.abs(locate(c.line, at.x, at.z).lateral) < c.corridor) continue;
        const h = c.floorAt(at.x, at.z);
        if ((c.theme === 'island' && h < 1.5) || (c.theme === 'volcano' && h < 0) || (c.theme === 'city' && h < 0)) continue;
        const yaw = (d * 0.21 + side * ring) % (Math.PI * 2);
        const scale = 6 + ((d * 3.1 + ring * 13) % 5);
        if (c.theme === 'canyon') out.push({ kit: 'nature', model: pick(d + ring + side, ['rock_largeB', 'rock_tallB', 'rock_largeD', 'rock_largeA']), at: [at.x, 0, at.z], yaw, scale });
        else if (c.theme === 'island') out.push({ kit: 'nature', model: pick(d + ring + side, ['tree_palmTall', 'tree_palmBend', 'tree_palmShort']), at: [at.x, 0, at.z], yaw, scale: scale * 0.8 });
        else if (c.theme === 'volcano') out.push({ kit: 'nature', model: pick(d + ring + side, ['rock_tallA', 'rock_largeC', 'rock_largeD']), at: [at.x, 0, at.z], yaw, scale });
        else if (c.theme === 'city') out.push({ kit: 'racing', model: ring ? 'lightPostLarge' : 'lightPostModern', at: [at.x, 0, at.z], yaw, scale: 7 });
        else out.push({ kit: 'nature', model: pick(d + ring + side, ['tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundB', 'rock_largeB']), at: [at.x, 0, at.z], yaw, scale });
      }
    }
  }
  // THE PYLONS. Air racing is read off the gates, and the gates here were invisible lap logic. A banner tower either
  // side of every checkpoint, just outside the corridor, gives the course its shape from the air — red on the left,
  // green on the right, the way a racecourse is marked.
  for (const g of c.course.gates) {
    const right = new Vector3(g.through.z, 0, -g.through.x);
    for (const side of [-1, 1]) {
      const at = g.at.add(right.scale(side * (c.corridor + 8)));
      if (c.floorAt(at.x, at.z) < 0 && c.theme !== 'canyon') continue;   // no pylon standing in water or lava
      out.push({ kit: 'racing', model: side < 0 ? 'bannerTowerRed' : 'bannerTowerGreen', at: [at.x, 0, at.z], yaw: Math.atan2(g.through.x, g.through.z), scale: 7 });
    }
  }
  if (c.theme === 'island') {
    // palms around every island's beach
    for (let a = 0; a < 90; a++) {
      const x = -380 + ((a * 173) % 760), z = -300 + ((a * 241) % 640);
      const h = c.floorAt(x, z);
      if (h > 2 && h < 14 && Math.abs(locate(c.line, x, z).lateral) > c.corridor) {
        out.push({ kit: 'nature', model: a % 2 ? 'tree_palmShort' : 'tree_palmDetailedShort', at: [x, 0, z], yaw: a, scale: 4.5 });
      }
    }
  }
  return out;
}

export async function buildAeroWorld(scene: Scene, c: AeroCircuit): Promise<AeroWorld> {
  const root = new TransformNode(`aero_world_${c.theme}`, scene);
  buildTerrain(scene, c, root);
  c.arches.forEach((a, i) => buildArch(scene, c, a, root, i));
  buildTunnel(scene, c, root);
  buildStartBanner(scene, c, root);
  buildHorizon(scene, c, root);
  buildTowers(scene, c, root);
  // THE LAVA LIGHTS THE UNDERSIDES: a hemispheric light pointed up lights nothing from above and paints every
  // down-facing surface — wings, the arch soffits, the banks' overhangs — in the lake's orange
  let underlight: HemisphericLight | null = null;
  if (c.theme === 'volcano') {
    underlight = new HemisphericLight('aero_lava_underlight', new Vector3(0, 1, 0), scene);
    underlight.diffuse = new Color3(0.05, 0.03, 0.02); underlight.groundColor = Color3.FromHexString('#ff6a2a'); underlight.specular = Color3.Black(); underlight.intensity = 0.8;
  }

  let ocean: OceanHandle | null = null;
  if (c.theme === 'island') {
    ocean = mountOcean(scene, { deep: '#0c5a78', foam: '#e8fbff', horizon: '#9fd8ea', shoreZ: 6000, swell: 0.55, fade: [500, 2400] });
  } else if (c.theme === 'volcano') {
    // THE LAVA LAKE is the surf break's ocean in another colour: slow, thick, glowing (the caldera floor sits at −4, so
    // the lake fills the middle and the rim stands out of it)
    ocean = mountOcean(scene, { deep: '#c8401a', foam: '#ffd070', horizon: '#ff7a3a', shoreZ: 6000, swell: 0.28, fade: [300, 1800] });
  } else if (c.theme === 'city') {
    ocean = mountOcean(scene, { deep: '#04080f', foam: '#243a5e', horizon: '#0b1424', shoreZ: 6000, swell: 0.4, fade: [400, 2200] });
  }
  // DETAIL: embers rise off the lava round the camera; the skyline hangs neon strips down its corridor edges
  let embers: ParticleSystem | null = null; let emberEmitter: AbstractMesh | null = null;
  if (c.theme === 'volcano') {
    embers = new ParticleSystem('aero_embers', 700, scene);
    const tex = groundDetailTexture(scene, 'sand'); void tex;
    emberEmitter = MeshBuilder.CreateBox('aero_ember_emitter', { size: 0.01 }, scene); emberEmitter.isVisible = false; emberEmitter.isPickable = false;
    embers.emitter = emberEmitter; embers.minEmitBox = new Vector3(-90, -20, -90); embers.maxEmitBox = new Vector3(90, 0, 90);
    embers.color1 = new Color4(1, 0.55, 0.2, 0.9); embers.color2 = new Color4(1, 0.3, 0.1, 0.7); embers.colorDead = new Color4(0.4, 0.1, 0, 0);
    embers.minSize = 0.5; embers.maxSize = 1.3; embers.minLifeTime = 2.5; embers.maxLifeTime = 5; embers.emitRate = 120;
    embers.direction1 = new Vector3(-1, 4, -1); embers.direction2 = new Vector3(1, 9, 1); embers.gravity = new Vector3(0, 0.6, 0);
    embers.blendMode = ParticleSystem.BLENDMODE_ADD; embers.start();
  }
  if (c.theme === 'city') {
    const strip = MeshBuilder.CreateBox('aero_neon_strip', { width: 1.2, height: 0.5, depth: 18 }, scene);
    strip.material = VenueKit.paint(scene, 'aero_neon_strip_mat', c.course.tint, 1.0, 0.4); strip.isPickable = false;
    const mats: Matrix[] = [];
    for (let d = 0; d < c.line.length; d += 26) {
      const { pos, tangent } = pointAlong(c.line, d); const right = new Vector3(tangent.z, 0, -tangent.x);
      const q = Quaternion.FromEulerAngles(0, Math.atan2(tangent.x, tangent.z), 0);
      for (const s of [-1, 1]) { const at = pos.add(right.scale(s * (c.corridor + 2))); at.y = pos.y - 6; mats.push(Matrix.Compose(Vector3.One(), q, at)); }
    }
    const buf = new Float32Array(mats.length * 16); mats.forEach((m, i) => m.copyToArray(buf, i * 16));
    strip.thinInstanceSetBuffer('matrix', buf, 16, true); strip.parent = root;
  }

  const key = `aero-${c.course.id}`;
  VENUE_PROP_SETS[key] = sceneryFor(c);
  let props: VenuePropsHandle | null = null;
  let gone = false;
  void mountVenueProps(scene, key, root, { snapToGround: true }).then((h) => { if (gone) h?.dispose(); else props = h; });

  // THE SKY HAS TO ENCLOSE THE COURSE. The harness's painted dome is 280 m across-radius and centred on the origin; a
  // circuit spans ~1.2 km, so most of the lap sat OUTSIDE the sky and the opaque dome hid the whole world behind a flat
  // wash (measured 2026-09-15: camera 265 m out, terrain enabled and in frustum, the frame all pink). The same failure
  // trackside.ts fixed for the ring courses. Here the dome is grown past the horizon ring and rides the camera, so the
  // sky is always around you and the mesas always stand inside it.
  const dome = scene.getMeshByName('bk_dome');
  const ring = scene.getMeshByName('bk_ring');
  const SKY_SCALE = 2600 / 280;
  if (dome) dome.scaling.setAll(SKY_SCALE);
  if (ring) { ring.scaling.set(SKY_SCALE, SKY_SCALE * 0.6, SKY_SCALE); }

  return {
    root, ocean,
    update(dt, camera) {
      ocean?.update(dt, camera);
      if (emberEmitter) emberEmitter.position.set(camera.position.x, Math.max(-2, Math.min(camera.position.y, 30)) - 6, camera.position.z);
      if (dome) { dome.position.x = camera.position.x; dome.position.z = camera.position.z; }
      if (ring) { ring.position.x = camera.position.x; ring.position.z = camera.position.z; }
    },
    dispose() { gone = true; props?.dispose(); ocean?.dispose(); embers?.dispose(); emberEmitter?.dispose(); underlight?.dispose(); root.dispose(false, true); },
  };
}
