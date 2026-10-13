// THE CONTEST'S RACKS, DRESSED (vis-hoops-dunk, Part B threepoint: "5 lit ball racks with LED trim, a sponsor-style apron"). The
// rack was a dark plank floating at hip height with balls on it. This stands it on legs, runs an LED strip along its underside
// (named `*_led`: the shared glow layer matches it, desktop and high), lays a rubber apron under it printed with the rack's number
// and the house name, and throws a pool of coloured light on the floor. The money rack's strip and pool are gold.
//
// Visual only. The gameplay rack (`rack_N`, its balls, where they sit and which are taken) is the mode's own and is not touched:
// this adds meshes round it, at positions computed from the same stand positions the mode passes in. Merged where it can be (the
// legs and aprons are one draw each); the five LED strips and pools are five meshes each so the money rack can change colour.

import { Color3, DynamicTexture, Engine, Mesh, MeshBuilder, PBRMaterial, StandardMaterial } from '@babylonjs/core';
import type { AbstractMesh, Scene, Vector3 } from '@babylonjs/core';
import { settleEmissive, unlitDiffuse } from '../visual/unlit';

export const LED_HEX = '#22d3ee';
export const MONEY_HEX = '#ffd23f';
/** The stand's plank, as the mode builds it (ThreePointMode: width 0.9, height 0.12, depth 0.34, at y 0.62). */
export const STAND = { w: 0.9, h: 0.12, d: 0.34, y: 0.62 } as const;

/** Pure: the apron's footprint under a stand — a little bigger than the plank, on the floor. */
export function apronSize(): { w: number; d: number } { return { w: STAND.w + 0.9, d: STAND.d + 0.9 }; }

/** Pure: which rack is the money rack's colour — the LED strip's hex for rack `i` given the run's money rack (−1: none). */
export function stripHex(i: number, moneyRack: number): string { return i === moneyRack ? MONEY_HEX : LED_HEX; }

export interface RackDressingHandle {
  /** Light rack `i` (the one in play) brighter than the rest; −1 lights them all evenly. */
  setActive(i: number): void;
  /** Which rack carries the money (its strip and pool go gold); −1 none. */
  setMoneyRack(i: number): void;
  readonly meshes: readonly AbstractMesh[];
  dispose(): void;
}

function aprons(scene: Scene): DynamicTexture | null {
  try {
    const tex = new DynamicTexture('tp_apron_tex', { width: 256, height: 128 }, scene, true);
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    g.fillStyle = '#12161c'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#2c3643'; g.lineWidth = 4; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#22d3ee'; g.fillRect(6, 6, 244, 5); g.fillRect(6, 117, 244, 5);
    g.fillStyle = '#3a4656'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FEL', 128, 64);
    tex.update(true);
    return tex;
  } catch { return null; }
}

function poolTexture(scene: Scene): DynamicTexture | null {
  const existing = scene.getTextureByName('tp_pool_tex');
  if (existing) return existing as DynamicTexture;
  try {
    const tex = new DynamicTexture('tp_pool_tex', { width: 64, height: 64 }, scene, false);
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    g.clearRect(0, 0, 64, 64);
    const rg = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.6, 'rgba(255,255,255,0.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    tex.update(); tex.hasAlpha = true;
    return tex;
  } catch { return null; }
}

/** `stands` are the stand planks' world positions (the mode's `rack_N` meshes), in rack order. */
export function mountRackDressing(scene: Scene, stands: readonly Vector3[], moneyRack = -1): RackDressingHandle {
  const meshes: Mesh[] = [];
  const owned: { dispose(): void }[] = [];
  const keep = <T extends Mesh>(m: T): T => { m.isPickable = false; m.receiveShadows = false; meshes.push(m); return m; };
  const steel = new PBRMaterial('tp_rack_steel', scene);
  steel.albedoColor = Color3.FromHexString('#3a424d'); steel.metallic = 0.7; steel.roughness = 0.45; owned.push(steel);

  // the legs: four posts a rack, one merged mesh for the lot
  const legs: Mesh[] = [];
  for (const p of stands) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = MeshBuilder.CreateBox('tp_rack_leg', { width: 0.045, height: STAND.y - STAND.h / 2, depth: 0.045 }, scene);
    leg.position.set(p.x + sx * (STAND.w / 2 - 0.05), (STAND.y - STAND.h / 2) / 2, p.z + sz * (STAND.d / 2 - 0.04));
    legs.push(leg);
  }
  const legMesh = legs.length ? Mesh.MergeMeshes(legs, true, true) : null;
  if (legMesh) { legMesh.name = 'tp_rack_legs'; legMesh.material = steel; keep(legMesh); }

  // the aprons, one merged draw
  const apronTex = aprons(scene);
  const apronMat = new StandardMaterial('tp_apron_m', scene);
  apronMat.diffuseColor = apronTex ? Color3.White() : Color3.FromHexString('#14181e'); apronMat.specularColor = new Color3(0.08, 0.08, 0.08);
  if (apronTex) { apronMat.diffuseTexture = apronTex; owned.push(apronTex); }
  owned.push(apronMat);
  const A = apronSize();
  const mats: Mesh[] = stands.map((p) => {
    const m = MeshBuilder.CreateGround('tp_apron', { width: A.w, height: A.d }, scene);
    m.position.set(p.x, 0.014, p.z); return m;
  });
  const apronMesh = mats.length ? Mesh.MergeMeshes(mats, true, true) : null;
  if (apronMesh) { apronMesh.name = 'tp_aprons'; apronMesh.material = apronMat; keep(apronMesh); }

  // the LED strips under the planks, and the pools of light they throw on the apron
  const poolTex = poolTexture(scene);
  if (poolTex) owned.push(poolTex);   // one texture for the five pools, taken down with them
  const strips: { mesh: Mesh; mat: StandardMaterial; pool: Mesh; poolMat: StandardMaterial }[] = [];
  stands.forEach((p, i) => {
    const mesh = MeshBuilder.CreateBox(`tp_rack${i}_led`, { width: STAND.w + 0.04, height: 0.035, depth: STAND.d + 0.04 }, scene);
    mesh.position.set(p.x, STAND.y - STAND.h / 2 - 0.02, p.z);
    const mat = new StandardMaterial(`tp_rack${i}_led_m`, scene);
    mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); owned.push(mat);
    mesh.material = mat; keep(mesh);
    const pool = MeshBuilder.CreateGround(`tp_rack${i}_pool`, { width: A.w * 1.25, height: A.d * 1.25 }, scene);
    pool.position.set(p.x, 0.02, p.z);
    const poolMat = new StandardMaterial(`tp_rack${i}_pool_m`, scene);
    poolMat.disableLighting = true; poolMat.diffuseColor = unlitDiffuse(); poolMat.specularColor = Color3.Black(); poolMat.alphaMode = Engine.ALPHA_ADD; poolMat.disableDepthWrite = true; poolMat.zOffset = -3;
    if (poolTex) { poolMat.opacityTexture = poolTex; }
    owned.push(poolMat); pool.material = poolMat; keep(pool);
    strips.push({ mesh, mat, pool, poolMat });
  });

  let money = moneyRack, active = -1;
  const paint = (): void => {
    strips.forEach((s, i) => {
      const hex = Color3.FromHexString(stripHex(i, money));
      const lit = active < 0 || i === active;
      s.mat.emissiveColor = hex.scale(lit ? 1 : 0.35);
      s.poolMat.emissiveColor = hex.scale(lit ? 0.55 : 0.12);
      if (!poolTex) s.poolMat.alpha = lit ? 0.22 : 0.06;
    });
  };
  paint();

  return {
    meshes,
    setActive(i) { if (i !== active) { active = i; paint(); } },
    setMoneyRack(i) { if (i !== money) { money = i; paint(); } },
    dispose() {
      for (let i = meshes.length - 1; i >= 0; i--) meshes[i].dispose();
      for (let i = owned.length - 1; i >= 0; i--) { try { owned[i].dispose(); } catch { /* gone */ } }
      meshes.length = 0; strips.length = 0;
    },
  };
}
