// FLOODLIGHT TOWERS (vis-court, wave 2, 2026-10-13) — a lit stadium's four towers, as real fixtures.
//
// The audit asked football and penalty (and the derby's night game) for "real floodlight towers: clustered lights, glow,
// player shadows". The foundation did the lights: FixtureLights finds any mesh named `flood_…` with an emissive material and
// plants a clustered spot light under it aimed at the play area; EmissiveGlow gives the same mesh a halo. What was missing was
// a tower to hang them on — the gridiron's floods were camera-facing glow planes floating over the sideline. This builds the
// tower: a steel mast and head frame, and a lamp bank (one box with a painted grid of lamp cells) turned to face the field.
//
// Naming is the contract:
//   flood_court_tower_<i>   the lamp bank — `flood_` is what FixtureLights and EmissiveGlow read; `court` is in LightRig's
//                           RECEIVER_HINTS, so the bank only receives shadows and never casts one into the pitch's map
//   court_tower_mast_<i>    the mast and the frame — same reason, a receiver only
// Three draws a tower. Visual only.

import { Color3, MeshBuilder, PBRMaterial, StandardMaterial, Texture } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';

export interface TowerSpot { x: number; z: number; /** yaw the lamp bank faces (towards the pitch centre) */ yaw: number }
export interface TowerOpts {
  /** mast height (m) */ height?: number;
  /** lamp colour */ color?: string;
  /** bank size (m) */ bank?: { w: number; h: number };
  /** only the towers of this list (a phone builds two) */ max?: number;
}

/**
 * Pure: where a pitch's towers stand — one at each corner, `margin` metres outside the touchlines, `ends` metres outside the
 * goal lines — each facing the centre of the pitch. `count` 2 gives the two on the far side (the broadcast side).
 */
export function towerLayout(halfW: number, halfL: number, margin = 6, count = 4, cz = 0): TowerSpot[] {
  const x = halfW + margin, z = halfL + margin;
  const all: [number, number][] = [[-x, z], [x, z], [-x, -z], [x, -z]];
  const picked = count >= 4 ? all : count === 2 ? all.slice(0, 2) : all.slice(0, Math.max(0, count));
  return picked.map(([px, pz]) => ({ x: px, z: pz + cz, yaw: Math.atan2(-px, -pz) }));
}

/** The painted lamp grid: a dark frame, `cols × rows` lamp cells that read as lit. */
export function paintLampBank(g: CanvasRenderingContext2D, W: number, H: number, cols: number, rows: number): void {
  g.fillStyle = '#10141c'; g.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cx = c * cw + cw / 2, cy = r * ch + ch / 2;
    const gr = g.createRadialGradient(cx, cy, 1, cx, cy, Math.min(cw, ch) * 0.46);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#fff6df'); gr.addColorStop(1, '#a8a089');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Math.min(cw, ch) * 0.4, 0, Math.PI * 2); g.fill();
  }
}

export interface TowersHandle { meshes: readonly Mesh[]; dispose(): void }

export function buildFloodTowers(scene: Scene, spots: readonly TowerSpot[], opts: TowerOpts = {}): TowersHandle {
  const H = opts.height ?? 16, bank = opts.bank ?? { w: 5.2, h: 2.4 };
  const made: Mesh[] = [];
  const tex = makeTexture(scene, 'flood_court_tower_tex', 256, 128, (g) => paintLampBank(g, 256, 128, 6, 3));   // null headless: a plain lit bank
  if (tex) { tex.wrapU = Texture.CLAMP_ADDRESSMODE; tex.wrapV = Texture.CLAMP_ADDRESSMODE; }
  const lamp = new StandardMaterial('flood_court_tower_m', scene);
  lamp.disableLighting = true; lamp.diffuseColor = Color3.Black(); lamp.specularColor = Color3.Black();
  lamp.emissiveColor = Color3.FromHexString(opts.color ?? '#fff3d6'); if (tex) lamp.emissiveTexture = tex;
  const steel = new PBRMaterial('court_tower_steel_m', scene);
  steel.albedoColor = Color3.FromHexString('#7b828c'); steel.metallic = 0.7; steel.roughness = 0.5;
  (opts.max != null ? spots.slice(0, opts.max) : spots).forEach((s, i) => {
    const mast = MeshBuilder.CreateCylinder(`court_tower_mast_${i}`, { height: H, diameterTop: 0.45, diameterBottom: 0.8, tessellation: 10 }, scene);
    mast.position.set(s.x, H / 2, s.z); mast.material = steel;
    const frame = MeshBuilder.CreateBox(`court_tower_frame_${i}`, { width: bank.w + 0.5, height: bank.h + 0.5, depth: 0.35 }, scene);
    frame.position.set(s.x, H + bank.h / 2 - 0.2, s.z); frame.rotation.y = s.yaw; frame.rotation.x = 0.28; frame.material = steel;
    const face = MeshBuilder.CreateBox(`flood_court_tower_${i}`, { width: bank.w, height: bank.h, depth: 0.12 }, scene);
    face.position.copyFrom(frame.position); face.rotation.y = s.yaw; face.rotation.x = 0.28; face.material = lamp;
    // the bank sits a hand in front of its frame, on the pitch side
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    face.position.x += fx * 0.24; face.position.z += fz * 0.24; face.position.y -= 0.07;
    for (const m of [mast, frame, face]) { m.isPickable = false; m.receiveShadows = true; m.freezeWorldMatrix(); made.push(m); }
  });
  return { meshes: made, dispose() { for (const m of made) m.dispose(); lamp.dispose(); steel.dispose(); tex?.dispose(); } };
}
