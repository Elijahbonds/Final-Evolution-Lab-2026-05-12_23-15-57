// THE WAREHOUSE'S LIGHT (vis-board, visual wave 2, 2026-10-13) — Part B skateboard: "Warehouse look: sodium-vapour clustered
// lights, a dust haze with light shafts, glowing fixtures."
//
// The Warehouse was a night park with nothing lit in it: a dark slab under a moon that did not exist, the ramps a darker
// shade of the floor. This hangs the light the room should have had — two rows of sodium-vapour lamps off a steel gantry —
// and lets the shared rig do the rest:
//   · each lamp head is NAMED `lhead_*` on a `lampHead_*` material, which is exactly what the shared systems look for: the
//     EmissiveGlow layer draws its halo, and FixtureLights puts a clustered point light under it (desktop/high), so the
//     light falls on the slab and on the rider;
//   · under each head, a cone of light — an additive, vertically-fading cylinder (one draw per lamp, no shadow, never
//     pickable): the shaft you only see because there is haze in the room;
//   · the haze itself: a few dozen slow dust motes hanging in the shafts.
// Phones get half the lamps and a third of the motes (the fixture lights and the glow are desktop-only anyway).
// Built once at load; the handle's dispose() takes everything down. Nothing here knows about scoring or the run.

import { Color3, Color4, DynamicTexture, Engine, FresnelParameters, MeshBuilder, ParticleSystem, PBRMaterial, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { lookFeatureOff } from '../scene/graphicsSetting';   // vis-board: ?lookoff=… switches one feature off for a one-build A/B

/** The sodium lamp's colour: low-pressure vapour is a saturated amber. */
export const SODIUM = { r: 1, g: 0.62, b: 0.2 } as const;
/** Lamp height above the slab, and the gantry the lamps hang from. */
export const LAMP_Y = 9.5;
export const GANTRY_Y = 12.4;

/** Pure: where the lamps hang for a venue of half-extent `bound`: two rows of `perRow` along x, each row a third of the way in. */
export function lampSpots(bound: number, perRow: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const n = Math.max(1, Math.floor(perRow));
  for (const rz of [-0.36, 0.36]) {
    for (let i = 0; i < n; i++) {
      const fx = n === 1 ? 0 : -0.62 + (1.24 * i) / (n - 1);
      out.push({ x: fx * bound, z: rz * bound });
    }
  }
  return out;
}

/** Pure: lamps and dust motes by tier (the glow and the clustered lights are desktop-only; a phone gets a lighter room). */
export function warehouseBudget(tier: string | null | undefined): { perRow: number; motes: number } {
  return tier === 'mobile' ? { perRow: 2, motes: 40 } : { perRow: 4, motes: 130 };
}

export interface DressingHandle { readonly lamps: number; dispose(): void }

/** The shaft's fade, painted: null on a canvas-less runtime (a headless scene), where the shaft is a plain faint cone. */
function shaftTexture(scene: Scene): DynamicTexture | null {
  try {
    const tex = new DynamicTexture('wh_shaft_tex', { width: 4, height: 64 }, scene, false);
    const g = tex.getContext() as unknown as CanvasRenderingContext2D;
    // v runs bottom (0) to top (1) on a Babylon cylinder: bright under the lamp, gone by the floor
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    tex.update(false);
    tex.hasAlpha = true;
    return tex;
  } catch { return null; }
}

export function mountWarehouseDressing(scene: Scene, bound: number, tier: string | null | undefined): DressingHandle {
  if (lookFeatureOff('dress')) return { lamps: 0, dispose() { /* nothing was built */ } };
  const { perRow, motes } = warehouseBudget(tier);
  const spots = lampSpots(bound, perRow);
  const meshes: AbstractMesh[] = [];
  const owned: { dispose(): void }[] = [];

  const steel = new PBRMaterial('wh_steel', scene);
  steel.albedoColor = new Color3(0.1, 0.1, 0.12); steel.metallic = 0.7; steel.roughness = 0.5; owned.push(steel);
  // the lamp head: an emissive the glow layer and the fixture lights both read (material name lampHead_*, mesh name lhead_*)
  const head = new StandardMaterial('lampHead_warehouse', scene);
  head.emissiveColor = new Color3(SODIUM.r, SODIUM.g, SODIUM.b); head.diffuseColor = Color3.Black(); head.specularColor = Color3.Black(); head.disableLighting = true;
  owned.push(head);
  const shaftTex = shaftTexture(scene);
  const shaftM = new StandardMaterial('wh_shaft_m', scene);
  shaftM.emissiveColor = new Color3(SODIUM.r, SODIUM.g * 0.85, SODIUM.b * 0.6); shaftM.diffuseColor = Color3.Black(); shaftM.specularColor = Color3.Black();
  shaftM.disableLighting = true; if (shaftTex) shaftM.opacityTexture = shaftTex; shaftM.alpha = shaftTex ? 0.16 : 0.05; shaftM.backFaceCulling = false;
  shaftM.alphaMode = Engine.ALPHA_ADD; shaftM.disableDepthWrite = true;
  // a shaft of light has no edge: opaque where the cone faces the eye, gone where its skin turns away
  const soft = new FresnelParameters(); soft.bias = 0.05; soft.power = 1.4; soft.leftColor = Color3.White(); soft.rightColor = Color3.Black();
  shaftM.opacityFresnelParameters = soft;
  owned.push(shaftM); if (shaftTex) owned.push(shaftTex);

  // the gantry: two long beams across the room and the cross-ties the lamps hang from
  for (const z of [-0.36, 0.36]) {
    const beam = MeshBuilder.CreateBox('wh_gantry_beam', { width: bound * 1.7, height: 0.5, depth: 0.5 }, scene);
    beam.position.set(0, GANTRY_Y, z * bound); beam.material = steel; beam.isPickable = false; meshes.push(beam);
  }
  spots.forEach((s, i) => {
    const cable = MeshBuilder.CreateCylinder(`wh_cable_${i}`, { diameter: 0.07, height: GANTRY_Y - LAMP_Y - 0.4, tessellation: 5 }, scene);
    cable.position.set(s.x, (GANTRY_Y + LAMP_Y + 0.4) / 2, s.z); cable.material = steel; cable.isPickable = false; meshes.push(cable);
    const shade = MeshBuilder.CreateCylinder(`wh_shade_${i}`, { diameterTop: 0.35, diameterBottom: 1.7, height: 0.75, tessellation: 14 }, scene);
    shade.position.set(s.x, LAMP_Y + 0.5, s.z); shade.material = steel; shade.isPickable = false; meshes.push(shade);
    const bulb = MeshBuilder.CreateSphere(`lhead_wh_${i}`, { diameter: 0.62, segments: 8 }, scene);
    bulb.position.set(s.x, LAMP_Y, s.z); bulb.material = head; bulb.isPickable = false; meshes.push(bulb);
    const shaft = MeshBuilder.CreateCylinder(`wh_shaft_${i}`, { diameterTop: 0.9, diameterBottom: 7.2, height: LAMP_Y - 0.2, tessellation: 20, cap: 0 }, scene);
    shaft.position.set(s.x, (LAMP_Y - 0.2) / 2 + 0.05, s.z); shaft.material = shaftM; shaft.isPickable = false; shaft.renderingGroupId = 0; meshes.push(shaft);
  });
  for (const m of meshes) { m.receiveShadows = false; m.freezeWorldMatrix(); }

  // the haze: slow motes hanging in the room, brightest where a shaft crosses them
  let dust: ParticleSystem | null = null;
  let mote: DynamicTexture | null = null;
  try {
    mote = new DynamicTexture('wh_mote', { width: 16, height: 16 }, scene, false);
    const mg = mote.getContext() as unknown as CanvasRenderingContext2D;
    const rg = mg.createRadialGradient(8, 8, 1, 8, 8, 8); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    mg.fillStyle = rg; mg.fillRect(0, 0, 16, 16); mote.update(); mote.hasAlpha = true; owned.push(mote);
  } catch { mote = null; /* a headless scene: no haze */ }
  if (mote) {
    dust = new ParticleSystem('wh_dust', motes, scene);
    dust.particleTexture = mote;
    dust.emitter = new Vector3(0, 4.5, 0);
    dust.minEmitBox = new Vector3(-bound * 0.7, -4.2, -bound * 0.45); dust.maxEmitBox = new Vector3(bound * 0.7, 4.2, bound * 0.45);
    dust.color1 = new Color4(1, 0.78, 0.45, 0.5); dust.color2 = new Color4(1, 0.7, 0.4, 0.28); dust.colorDead = new Color4(1, 0.7, 0.4, 0);
    dust.minSize = 0.03; dust.maxSize = 0.075; dust.minLifeTime = 7; dust.maxLifeTime = 12;
    dust.emitRate = motes / 9; dust.gravity = new Vector3(0.02, -0.03, 0.015); dust.minEmitPower = 0.02; dust.maxEmitPower = 0.08;
    dust.blendMode = ParticleSystem.BLENDMODE_ADD;
    dust.preWarmCycles = 160; dust.preWarmStepOffset = 4;
    dust.start();
  }

  return {
    lamps: spots.length,
    dispose() {
      dust?.dispose();
      for (let i = meshes.length - 1; i >= 0; i--) meshes[i].dispose();
      for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();
    },
  };
}
