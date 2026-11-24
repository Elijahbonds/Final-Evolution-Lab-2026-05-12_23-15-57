// PHYSICS ARENA — what is drawn: the half court, its lines, the hoop, the walls. The hoop is drawn from hoopGeometry, the same
// numbers its colliders are built from (arenaPhysics.ts), so the iron the ball bounces off is the iron on screen.
//
// A new place with its own look (a lab court: dark floor, bright lines, glass walls), not a copy of any shipped court or of any
// other game's. Light on a phone: one painted floor texture, a dozen plain meshes, no models.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { ARC_M, ARENA_RIM, ARENA_RIM_RADIUS, NET, RIM_TUBE_R, armBox, boardBox, bracketBox, poleBox } from './hoopGeometry';
import { arenaSetOn } from './arenaConfig';
import { mountArenaSet } from './arenaSet';

/** The painted court (m): sidelines at ±HALF_W, the baseline under the glass, the half-court line. */
export const LINES = Object.freeze({ halfW: 7.5, baselineZ: -2.2, midZ: 11.8, keyHalfW: 2.45, ftZ: 3.6, ftR: 1.8, cornerX: 6.6 });

const pbr = (scene: Scene, name: string, hex: string, emissive = 0.06, roughness = 0.8, alpha = 1): PBRMaterial => {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex);
  m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  m.metallic = 0; m.roughness = roughness;
  if (alpha < 1) { m.alpha = alpha; m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND; }
  return m;
};

export interface ArenaCourt { root: TransformNode; dispose(): void }

/** Court metres → texture pixels on a ground of w × l centred at (cx, cz). */
function painter(W: number, H: number, w: number, l: number, cx: number, cz: number) {
  return {
    x: (m: number) => ((m - (cx - w / 2)) / w) * W,
    // the ground's v runs along -z: the far end of the court is the top of the texture
    y: (m: number) => (1 - (m - (cz - l / 2)) / l) * H,
    s: (m: number) => (m / w) * W,
  };
}

export function mountArenaCourt(scene: Scene, o: { cage?: boolean } = {}): ArenaCourt {
  const root = new TransformNode('arena_court', scene);
  const w = 24, l = 24, cx = 0, cz = 4.6;   // square, so a painted circle stays round
  const ground = MeshBuilder.CreateGround('arena_ground', { width: w, height: l }, scene);
  ground.position.set(cx, 0, cz);
  ground.parent = root;
  const TW = 1024, TH = 1024;
  const tex = new DynamicTexture('arena_ground_tex', { width: TW, height: TH }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const P = painter(TW, TH, w, l, cx, cz);
  g.fillStyle = '#161b26'; g.fillRect(0, 0, TW, TH);                       // the apron
  g.fillStyle = '#23324a';                                                   // the court
  g.fillRect(P.x(-LINES.halfW), P.y(LINES.midZ), P.s(LINES.halfW * 2), P.y(LINES.baselineZ) - P.y(LINES.midZ));
  g.fillStyle = '#1f6f8b';                                                   // the key
  g.fillRect(P.x(-LINES.keyHalfW), P.y(LINES.ftZ), P.s(LINES.keyHalfW * 2), P.y(LINES.baselineZ) - P.y(LINES.ftZ));
  g.strokeStyle = '#e8f6ff'; g.lineWidth = 5;
  g.strokeRect(P.x(-LINES.halfW), P.y(LINES.midZ), P.s(LINES.halfW * 2), P.y(LINES.baselineZ) - P.y(LINES.midZ));
  g.strokeRect(P.x(-LINES.keyHalfW), P.y(LINES.ftZ), P.s(LINES.keyHalfW * 2), P.y(LINES.baselineZ) - P.y(LINES.ftZ));
  g.beginPath(); g.arc(P.x(0), P.y(LINES.ftZ), P.s(LINES.ftR), Math.PI, 0); g.stroke();
  // the arc: straight from the baseline at the corners, then round the ring's floor point
  const rz = ARENA_RIM.z;
  const meetZ = rz + Math.sqrt(ARC_M * ARC_M - LINES.cornerX * LINES.cornerX);
  g.strokeStyle = '#ffd166'; g.lineWidth = 6;
  g.beginPath();
  g.moveTo(P.x(-LINES.cornerX), P.y(LINES.baselineZ)); g.lineTo(P.x(-LINES.cornerX), P.y(meetZ));
  const a0 = Math.atan2(-(meetZ - rz), -LINES.cornerX), a1 = Math.atan2(-(meetZ - rz), LINES.cornerX);
  g.arc(P.x(0), P.y(rz), P.s(ARC_M), a0, a1, false);
  g.lineTo(P.x(LINES.cornerX), P.y(LINES.baselineZ));
  g.stroke();
  // the restricted arc and a centre mark
  g.strokeStyle = '#e8f6ff'; g.lineWidth = 4;
  g.beginPath(); g.arc(P.x(0), P.y(rz), P.s(1.25), Math.PI, 0); g.stroke();
  g.beginPath(); g.arc(P.x(0), P.y(LINES.midZ), P.s(1.8), 0, Math.PI); g.stroke();
  tex.update();
  const gm = new PBRMaterial('arena_ground_mat', scene);
  gm.albedoTexture = tex; gm.metallic = 0; gm.roughness = 0.55;
  gm.emissiveColor = new Color3(0.05, 0.06, 0.08);
  ground.material = gm;

  // the walls: low glass panels round the court, lit edges on top (a lab, not a gym)
  const wallMat = pbr(scene, 'arena_wall', '#2b3a55', 0.15, 0.3, 0.55);
  const edgeMat = pbr(scene, 'arena_edge', '#3ee0ff', 0.9, 0.4);
  const wall = (name: string, x: number, z: number, len: number, alongX: boolean) => {
    const b = MeshBuilder.CreateBox(name, { width: alongX ? len : 0.12, height: 1.1, depth: alongX ? 0.12 : len }, scene);
    b.position.set(x, 0.55, z); b.material = wallMat; b.parent = root; b.isPickable = false;
    const e = MeshBuilder.CreateBox(`${name}_edge`, { width: alongX ? len : 0.14, height: 0.05, depth: alongX ? 0.14 : len }, scene);
    e.position.set(x, 1.12, z); e.material = edgeMat; e.parent = root; e.isPickable = false;
  };
  wall('arena_wall_back', 0, cz - l / 2 + 0.3, w - 0.6, true);
  wall('arena_wall_l', -w / 2 + 0.3, cz, l - 0.6, false);
  wall('arena_wall_r', w / 2 - 0.3, cz, l - 0.6, false);

  // the hoop, from the colliders' own numbers
  const iron = pbr(scene, 'arena_iron', '#ff6a3d', 0.35, 0.35);
  const rim = MeshBuilder.CreateTorus('arena_rim', { diameter: (ARENA_RIM_RADIUS + RIM_TUBE_R) * 2, thickness: RIM_TUBE_R * 2, tessellation: 40 }, scene);
  rim.position.set(ARENA_RIM.x, ARENA_RIM.y, ARENA_RIM.z); rim.material = iron; rim.parent = root;
  const box = (name: string, b: { centre: { x: number; y: number; z: number }; half: { x: number; y: number; z: number } }, m: PBRMaterial): Mesh => {
    const mesh = MeshBuilder.CreateBox(name, { width: b.half.x * 2, height: b.half.y * 2, depth: b.half.z * 2 }, scene);
    mesh.position.set(b.centre.x, b.centre.y, b.centre.z); mesh.material = m; mesh.parent = root;
    return mesh;
  };
  box('arena_board', boardBox(), pbr(scene, 'arena_glass', '#d8f3ff', 0.25, 0.1, 0.42));
  // the shooter's square on the glass (a thin frame in front of the board)
  const bb = boardBox();
  const sq = MeshBuilder.CreateBox('arena_square', { width: 0.59, height: 0.45, depth: 0.004 }, scene);
  sq.position.set(0, ARENA_RIM.y + 0.15 + 0.225, bb.centre.z + bb.half.z + 0.003);
  const sqMat = new StandardMaterial('arena_square_mat', scene);
  sqMat.emissiveColor = new Color3(1, 1, 1); sqMat.disableLighting = true; sqMat.wireframe = true;
  sq.material = sqMat; sq.parent = root;
  box('arena_bracket', bracketBox(), iron);
  const steel = pbr(scene, 'arena_pole_mat', '#3a4150', 0.08, 0.5);
  box('arena_pole', poleBox(), steel);
  box('arena_arm', armBox(), steel);
  const net = MeshBuilder.CreateCylinder('arena_net', { height: NET.h, diameterTop: NET.topR * 2, diameterBottom: NET.bottomR * 2, tessellation: 16, cap: Mesh.NO_CAP }, scene);
  net.position.set(ARENA_RIM.x, ARENA_RIM.y - NET.h / 2, ARENA_RIM.z);
  const netMat = new StandardMaterial('arena_net_mat', scene);
  netMat.diffuseColor = new Color3(1, 1, 1); netMat.emissiveColor = new Color3(0.6, 0.6, 0.6); netMat.wireframe = true; netMat.backFaceCulling = false;
  net.material = netMat; net.parent = root; net.isPickable = false;

  // the set round it (arena.setV1: the shipped streetball cage and an apron to the horizon; 0 = the court alone, as before)
  const set = arenaSetOn() ? mountArenaSet(scene, o) : null;
  return { root, dispose: () => { set?.dispose(); root.dispose(false, true); } };
}

/** A point on the floor (for the camera's objective). */
export const RIM_VEC = (): Vector3 => new Vector3(ARENA_RIM.x, ARENA_RIM.y, ARENA_RIM.z);
