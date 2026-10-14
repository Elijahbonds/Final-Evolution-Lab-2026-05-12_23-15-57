// THE JUDGES' TABLE (vis-hoops-dunk, Part B dunk and dunkduel: "a judges' table with 3D score cards flipping"). The five judges'
// cards were only a row of DOM chips over the picture. This puts the table in the court: a long table at the sideline with five
// card stands, and each judge's card swings up from edge-on as the panel reveals it (the same beat the HUD chip lands on), in the
// judge's own score. A card is a plane on its own post, repainted when it flips; nothing is drawn until the first reveal.
//
// Display only. The mode already has each judge's card (name, 6..10) when it flips the chip; it passes the same to `flip`.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, StandardMaterial } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { settleEmissive, unlitDiffuse } from '../visual/unlit';
import { paintCard, paintCardBlank } from './boardPaint';
import { yawToward } from './faceToward';

/** How long a card takes to swing up, and how far it overshoots (a flip, not a fade). */
export const FLIP_SEC = 0.3, FLIP_OVERSHOOT = 0.12, FLIP_SETTLE_SEC = 0.2;

/** Pure: a card's height scale `t` seconds after its flip started (0 edge-on, overshoots a hair, settles at 1). */
export function flipScale(t: number): number {
  if (!(t > 0)) return 0.0001;
  const k = Math.min(1, t / FLIP_SEC);
  return Math.max(0.0001, k < 1 ? Math.sin(k * Math.PI * 0.5) * (1 + FLIP_OVERSHOOT) : 1 + FLIP_OVERSHOOT * Math.max(0, 1 - (t - FLIP_SEC) / FLIP_SETTLE_SEC));
}

/** Pure: a judge's 6..10 card as a fraction of the range the colour reads (6 → 0.2, 10 → 1). */
export function cardRead(score: number): number {
  return Number.isFinite(score) ? Math.max(0, Math.min(1, (score - 5) / 5)) : 0;
}

export interface JudgesTableHandle {
  /** Flip judge `i`'s card up: `label` (the judge's name), `score` (6..10). */
  flip(i: number, label: string, score: number): void;
  /** Put every card down (the next attempt). */
  clear(): void;
  /** Every frame, on the mode's clock. */
  update(dt: number): void;
  /** How many cards are up (tests, probes). */
  readonly up: number;
  readonly meshes: readonly AbstractMesh[];
  dispose(): void;
}

/** Where the table stands and the way it faces: `at` is the table's centre on the floor, `toward` the point its cards face. */
export function mountJudgesTable(scene: Scene, at: { x: number; z: number }, toward: { x: number; z: number }, n = 5): JudgesTableHandle {
  const yaw = yawToward(at, toward);
  const meshes: Mesh[] = [];
  const owned: { dispose(): void }[] = [];
  const keep = <T extends Mesh>(m: T): T => { m.isPickable = false; m.receiveShadows = false; meshes.push(m); return m; };
  // the table's own frame: local x runs along it, local z toward the court's back (its face is −z, toward `toward`)
  const place = (m: Mesh, lx: number, y: number, lz: number): void => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    m.position.set(at.x + lx * c + lz * s, y, at.z - lx * s + lz * c);
    m.rotation.y = yaw;
  };

  const wood = new PBRMaterial('jt_wood', scene);
  wood.albedoColor = Color3.FromHexString('#a06a3c'); wood.emissiveColor = Color3.FromHexString('#3a2412'); wood.metallic = 0; wood.roughness = 0.7; owned.push(wood);   // (a little self-light: the table faces away from the low sun, and a dark one read as a black slab on the rig)
  const cloth = new StandardMaterial('jt_cloth', scene);
  cloth.diffuseColor = Color3.FromHexString('#2a56c6'); cloth.emissiveColor = Color3.FromHexString('#12306e'); cloth.specularColor = Color3.Black(); owned.push(cloth);
  const steel = new PBRMaterial('jt_steel', scene);
  steel.albedoColor = Color3.FromHexString('#2b3138'); steel.metallic = 0.6; steel.roughness = 0.5; owned.push(steel);

  const GAP = 0.86;
  const W = GAP * n + 0.4;
  // the table is three meshes (the top, the cloth, the steel: the legs and the card posts merged), so with the cards it is n + 3 draws —
  // a phone's budget counts every mesh
  const top = MeshBuilder.CreateBox('jt_top', { width: W, height: 0.07, depth: 1.0 }, scene); place(top, 0, 0.78, 0); top.material = wood; keep(top);
  const front = MeshBuilder.CreateBox('jt_front', { width: W - 0.1, height: 0.74, depth: 0.05 }, scene); place(front, 0, 0.37, -0.45); front.material = cloth; keep(front);
  const steelParts: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const leg = MeshBuilder.CreateBox('jt_leg', { width: 0.07, height: 0.78, depth: 0.9 }, scene); place(leg, sx * (W / 2 - 0.08), 0.39, 0); steelParts.push(leg);
  }

  const cards: { mesh: Mesh; mat: StandardMaterial; tex: DynamicTexture | null; g: CanvasRenderingContext2D | null; t: number; show: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * GAP;
    const post = MeshBuilder.CreateBox('jt_post', { width: 0.05, height: 0.62, depth: 0.05 }, scene); place(post, lx, 1.1, -0.1); steelParts.push(post);
    const mesh = MeshBuilder.CreatePlane(`jt_card_${i}`, { width: 0.74, height: 0.56 }, scene);
    place(mesh, lx, 1.62, -0.14);
    const mat = new StandardMaterial(`jt_card_m_${i}`, scene);
    mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.emissiveColor = new Color3(0.9, 0.92, 0.95); mat.backFaceCulling = false;
    let tex: DynamicTexture | null = null, g: CanvasRenderingContext2D | null = null;
    try {
      tex = new DynamicTexture(`jt_card_tex_${i}`, { width: 256, height: 192 }, scene, false);
      g = tex.getContext() as unknown as CanvasRenderingContext2D; paintCardBlank(g, 256, 192); tex.update(true);
      mat.emissiveTexture = tex; settleEmissive(mat); owned.push(tex);
    } catch { tex = null; g = null; }
    mesh.material = mat; owned.push(mat); keep(mesh);
    mesh.scaling.y = 0.0001;
    cards.push({ mesh, mat, tex, g, t: 9, show: false });
  }
  const steelMesh = Mesh.MergeMeshes(steelParts, true, true);
  if (steelMesh) { steelMesh.name = 'jt_steel'; steelMesh.material = steel; keep(steelMesh); }

  return {
    meshes,
    get up() { return cards.filter((c) => c.show).length; },
    flip(i, label, score) {
      const c = cards[i]; if (!c) return;
      if (c.g && c.tex) { paintCard(c.g, 256, 192, label.toUpperCase(), Number.isFinite(score) ? String(Math.round(score)) : '-', cardRead(score)); c.tex.update(true); }
      c.show = true; c.t = 0;
    },
    clear() { for (const c of cards) { c.show = false; c.t = 9; c.mesh.scaling.y = 0.0001; } },
    update(dt) {
      for (const c of cards) {
        if (!c.show) continue;
        c.t += dt; c.mesh.scaling.y = flipScale(c.t);
      }
    },
    dispose() {
      for (let i = meshes.length - 1; i >= 0; i--) meshes[i].dispose();
      for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch { /* gone */ } }
      meshes.length = 0; cards.length = 0;
    },
  };
}
