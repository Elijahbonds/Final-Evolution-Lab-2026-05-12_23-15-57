// PHYSICS ARENA — soccer's pitch: what is drawn and what the ball hits, both from soccerGeometry's numbers (the hoop's pattern:
// the post the ball rings off is the post on screen). Plan §9.
//
//   THE PITCH   a turf texture with the lines (halfway, centre circle, a small box at each goal), inside boards 1 m high: the ball
//               plays off them (a cage game). Each end board has a gap the goal stands in.
//   THE GOALS   two posts and a bar as Havok capsules (iron: they ring), the net as walls behind and beside the mouth (soft: they
//               catch) and a drag volume (a shot slows in the net and drops).
// Light on a phone: one painted texture, plain meshes, no models.

import { Color3, DynamicTexture, MeshBuilder, PBRMaterial, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { ArenaPhysics } from './arenaPhysics';
import { BOARD, GOAL, PITCH, goalFrame, goalLineZ, inGoalNet, type End } from './soccerGeometry';

export interface SoccerPitch { root: TransformNode; dispose(): void }

/** The posts and bar keep this much of a ball's speed (a struck ball rings off the iron); the net and the boards keep less. */
export const POST_BOUNCE = 0.5, BOARD_BOUNCE_SOCCER = 0.55, NET_BOUNCE = 0.08;
/** The net takes this share of a ball's speed a second (a shot is caught, then drops). */
export const NET_DRAG_PER_SEC = 9;

/** The colliders: boards (with a goal-mouth gap at each end), the frames, the nets' walls and drag. */
export function buildSoccerColliders(world: ArenaPhysics): void {
  const { halfW, halfL } = PITCH, t = BOARD.t / 2, hb = 2.2;   // the boards' colliders stand taller than drawn: a chipped ball stays in
  world.addStaticBox('soccer_board_w', { x: -halfW - t, y: hb / 2, z: 0 }, { x: t, y: hb / 2, z: halfL + BOARD.t }, BOARD_BOUNCE_SOCCER, 0.4, 'boards');
  world.addStaticBox('soccer_board_e', { x: halfW + t, y: hb / 2, z: 0 }, { x: t, y: hb / 2, z: halfL + BOARD.t }, BOARD_BOUNCE_SOCCER, 0.4, 'boards');
  const sideW = (halfW - GOAL.halfW - GOAL.postR * 2) / 2;   // each end board either side of the mouth
  for (const end of ['north', 'south'] as const) {
    const z = goalLineZ(end) + (end === 'north' ? t : -t), sx = GOAL.halfW + GOAL.postR * 2 + sideW;
    world.addStaticBox(`soccer_board_${end}_l`, { x: -sx, y: hb / 2, z }, { x: sideW, y: hb / 2, z: t }, BOARD_BOUNCE_SOCCER, 0.4, 'boards');
    world.addStaticBox(`soccer_board_${end}_r`, { x: sx, y: hb / 2, z }, { x: sideW, y: hb / 2, z: t }, BOARD_BOUNCE_SOCCER, 0.4, 'boards');
    // above the mouth, the board goes on up (nothing over the bar gets out of the cage)
    world.addStaticBox(`soccer_board_${end}_top`, { x: 0, y: GOAL.h + 0.3 + (hb + 1.2) / 2, z }, { x: GOAL.halfW + GOAL.postR * 2, y: (hb + 1.2) / 2, z: t }, BOARD_BOUNCE_SOCCER, 0.4, 'boards');
    world.addStaticCapsules(`soccer_frame_${end}`, goalFrame(end), GOAL.postR, POST_BOUNCE, 0.3, 'post');
    // the net: a back wall, two sides and a roof
    const back = goalLineZ(end) + (end === 'north' ? GOAL.depth : -GOAL.depth), mid = (goalLineZ(end) + back) / 2, nt = 0.04;
    world.addStaticBox(`soccer_net_${end}_back`, { x: 0, y: GOAL.h / 2, z: back + (end === 'north' ? nt : -nt) }, { x: GOAL.halfW + 0.1, y: GOAL.h / 2, z: nt }, NET_BOUNCE, 0.9, 'net');
    for (const sx2 of [-1, 1]) world.addStaticBox(`soccer_net_${end}_side${sx2}`, { x: sx2 * (GOAL.halfW + 0.1 + nt), y: GOAL.h / 2, z: mid }, { x: nt, y: GOAL.h / 2, z: GOAL.depth / 2 }, NET_BOUNCE, 0.9, 'net');
    world.addStaticBox(`soccer_net_${end}_roof`, { x: 0, y: GOAL.h + nt, z: mid }, { x: GOAL.halfW + 0.1, y: nt, z: GOAL.depth / 2 }, NET_BOUNCE, 0.9, 'net');
    world.nets.push({ inside: (p) => inGoalNet(p, end), dragPerSec: NET_DRAG_PER_SEC });
  }
}

const pbr = (scene: Scene, name: string, hex: string, emissive = 0.06, roughness = 0.8): PBRMaterial => {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex); m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  m.metallic = 0; m.roughness = roughness;
  return m;
};

/** What is drawn. */
export function mountSoccerPitch(scene: Scene): SoccerPitch {
  const root = new TransformNode('soccer_pitch', scene);
  const { halfW, halfL } = PITCH;
  const w = halfW * 2 + 6, l = halfL * 2 + 6;
  const ground = MeshBuilder.CreateGround('soccer_ground', { width: w, height: l }, scene);
  ground.parent = root;
  const TW = 512, TH = Math.round((512 * l) / w);
  const tex = new DynamicTexture('soccer_ground_tex', { width: TW, height: TH }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const X = (m: number) => ((m + w / 2) / w) * TW, Y = (m: number) => (1 - (m + l / 2) / l) * TH, S = (m: number) => (m / w) * TW;
  g.fillStyle = '#16232b'; g.fillRect(0, 0, TW, TH);                                   // outside the boards: the arena's dark floor
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1f7a4d' : '#238a57'; g.fillRect(X(-halfW), Y(-halfL + (i + 1) * (halfL * 2) / 8), S(halfW * 2), Y(-halfL + i * (halfL * 2) / 8) - Y(-halfL + (i + 1) * (halfL * 2) / 8)); }
  g.strokeStyle = '#e8f6ff'; g.lineWidth = 3;
  g.strokeRect(X(-halfW), Y(halfL), S(halfW * 2), Y(-halfL) - Y(halfL));
  g.beginPath(); g.moveTo(X(-halfW), Y(0)); g.lineTo(X(halfW), Y(0)); g.stroke();
  g.beginPath(); g.arc(X(0), Y(0), S(3), 0, Math.PI * 2); g.stroke();
  for (const zl of [halfL, -halfL]) {
    const into = zl > 0 ? -4 : 4;
    g.strokeRect(X(-4), Y(Math.max(zl, zl + into)), S(8), Math.abs(Y(zl + into) - Y(zl)));
  }
  g.fillStyle = '#e8f6ff'; g.beginPath(); g.arc(X(0), Y(0), 3, 0, Math.PI * 2); g.fill();
  tex.update();
  const gm = new PBRMaterial('soccer_ground_mat', scene);
  gm.albedoTexture = tex; gm.metallic = 0; gm.roughness = 0.9; gm.emissiveColor = new Color3(0.04, 0.05, 0.05);
  ground.material = gm;

  // the boards (drawn 1 m: the colliders stand taller, unseen)
  const boardMat = pbr(scene, 'soccer_board_mat', '#2b3a55', 0.15, 0.4);
  const edgeMat = pbr(scene, 'soccer_board_edge', '#3ee0ff', 0.9, 0.4);
  const board = (name: string, x: number, z: number, lx: number, lz: number) => {
    const b = MeshBuilder.CreateBox(name, { width: lx, height: BOARD.h, depth: lz }, scene);
    b.position.set(x, BOARD.h / 2, z); b.material = boardMat; b.parent = root; b.isPickable = false;
    const e = MeshBuilder.CreateBox(`${name}_edge`, { width: lx + 0.02, height: 0.05, depth: lz + 0.02 }, scene);
    e.position.set(x, BOARD.h + 0.02, z); e.material = edgeMat; e.parent = root; e.isPickable = false;
  };
  board('soccer_board_w', -halfW - BOARD.t / 2, 0, BOARD.t, halfL * 2 + BOARD.t * 2);
  board('soccer_board_e', halfW + BOARD.t / 2, 0, BOARD.t, halfL * 2 + BOARD.t * 2);
  const sideW = halfW - GOAL.halfW - GOAL.postR * 2;
  for (const end of ['north', 'south'] as End[]) {
    const z = goalLineZ(end) + (end === 'north' ? BOARD.t / 2 : -BOARD.t / 2), cx = GOAL.halfW + GOAL.postR * 2 + sideW / 2;
    board(`soccer_board_${end}_l`, -cx, z, sideW, BOARD.t);
    board(`soccer_board_${end}_r`, cx, z, sideW, BOARD.t);
    // the frame
    const iron = pbr(scene, `soccer_frame_${end}_mat`, '#f4f7fb', 0.35, 0.35);
    for (const sg of goalFrame(end)) {
      const a = new Vector3(sg.a.x, sg.a.y, sg.a.z), b = new Vector3(sg.b.x, sg.b.y, sg.b.z);
      const len = Vector3.Distance(a, b);
      const c = MeshBuilder.CreateCylinder(`soccer_post_${end}`, { height: len, diameter: GOAL.postR * 2, tessellation: 10 }, scene);
      c.position.copyFrom(a.add(b).scale(0.5)); c.material = iron; c.parent = root; c.isPickable = false;
      if (Math.abs(a.y - b.y) < 1e-6) c.rotation.z = Math.PI / 2;
    }
    // the net: thin translucent panels
    const netMat = new StandardMaterial(`soccer_net_${end}_mat`, scene);
    netMat.diffuseColor = new Color3(0.9, 0.93, 0.97); netMat.emissiveColor = new Color3(0.35, 0.37, 0.4); netMat.alpha = 0.28; netMat.specularColor = Color3.Black();
    netMat.backFaceCulling = false;
    const back = goalLineZ(end) + (end === 'north' ? GOAL.depth : -GOAL.depth), mid = (goalLineZ(end) + back) / 2;
    const panel = (name: string, x: number, y: number, zz: number, lx: number, ly: number, lz: number) => {
      const p = MeshBuilder.CreateBox(name, { width: lx, height: ly, depth: lz }, scene);
      p.position.set(x, y, zz); p.material = netMat; p.parent = root; p.isPickable = false;
    };
    panel(`soccer_net_${end}_back`, 0, GOAL.h / 2, back, GOAL.halfW * 2 + 0.2, GOAL.h, 0.02);
    panel(`soccer_net_${end}_l`, -GOAL.halfW - 0.1, GOAL.h / 2, mid, 0.02, GOAL.h, GOAL.depth);
    panel(`soccer_net_${end}_r`, GOAL.halfW + 0.1, GOAL.h / 2, mid, 0.02, GOAL.h, GOAL.depth);
    panel(`soccer_net_${end}_roof`, 0, GOAL.h, mid, GOAL.halfW * 2 + 0.2, 0.02, GOAL.depth);
  }
  return { root, dispose: () => root.dispose(false, true) };
}
