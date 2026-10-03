// VEHICLE LIGHT — 10-phase pass, phase 7 (2026-10-03): the vehicles read as one lit world.
//
// What was measured flat: the kart and the toy plane each hand-set their PBR environment intensity
// (0.4/0.3/0.5 on the kart, 0.55 across the plane) with no reference to the mood the venue is lit
// with, and the primitive vehicles never set receiveShadows — the gantry and the forest shadows fell
// THROUGH the kart (the GLB bodies dressVehicle mounts already receive; the primitives did not).
// Under the flat-light moods (overcast sun 0.9, alpine sun 1.6) a vehicle loses the sun's modelling
// and reads as a cutout against a lit road.
//
// The venue-global numbers (MOODS, LightRig) are the owner's tuned values and are NOT touched. This
// module owns the VEHICLE-local half: one env scale per mood, and — only where the mood leaves a
// vehicle flat — a low fill light restricted to the vehicles (includedOnlyMeshes), so the road, the
// verge and the scenery keep exactly the light they had.

import { Color3, DirectionalLight, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, PBRMaterial, Scene, TransformNode } from '@babylonjs/core';
import { MOODS, type VenueMood } from '../scene/moods';

/**
 * The kart's signed-off environment intensities (VelocityKartMode, 2026-09-13) as the BASE the mood
 * scale multiplies: paint 0.4, dark trim 0.3, bright metal 0.5. The toy plane's flat 0.55 folds into
 * the same scale as paint ×1.35 — one table, both vehicles, no per-mode drift.
 */
export const VEHICLE_ENV_BASE = { paint: 0.4, dark: 0.3, chrome: 0.5 } as const;
export const PLANE_ENV_BASE = 0.55;

/**
 * How much the mood's IBL a vehicle takes, relative to the base. The flat-light moods lean harder on
 * the environment because the weak sun is not modelling the bodywork; the hard-sun moods stay at 1 —
 * the base values were tuned under goldenHour.
 */
export const VEHICLE_ENV_SCALE: Record<VenueMood, number> = {
  goldenHour: 1.0,
  daylight: 1.0,
  dojoWarm: 1.0,
  nightGame: 1.1,   // stadium sky is dim; a notch keeps the paint from going matte-black between the lamps
  alpine: 1.15,
  overcast: 1.3,    // sun 0.9 by design: the environment IS the key light here
};

/**
 * The per-mood VEHICLE FILL: a weak second sun, restricted to the vehicles, from the azimuth opposite
 * the key — it lifts the shaded flank a low sun leaves dead. 0 where the venue's own sun already
 * models a vehicle (goldenHour 2.4, daylight 2.6). These are look numbers, tuned against the
 * before/after frames; the venue's own lights never change.
 */
export const SUN_FILL: Record<VenueMood, number> = {
  goldenHour: 0,
  daylight: 0,
  dojoWarm: 0,
  nightGame: 0.3,   // a white night key at 2.2 still leaves the off-camera flank black under the lights
  alpine: 0.35,
  overcast: 0.55,   // the flattest light in the game; the fill is what separates bodywork from sky
};

/** The environment intensity one vehicle material should carry under a mood. */
export function vehicleEnvFor(base: number, mood: VenueMood): number {
  return Math.round(base * (VEHICLE_ENV_SCALE[mood] ?? 1) * 100) / 100;
}

/** The fill a mood's vehicles get (0 = none — no light is mounted at all). */
export function sunFillFor(mood: VenueMood): number {
  return SUN_FILL[mood] ?? 0;
}

export interface VehicleLightHandle {
  /** Extend the fill's coverage — the dressed GLB body arrives after the primitives (dressVehicle). */
  include(meshes: readonly AbstractMesh[]): void;
  dispose(): void;
}

/**
 * Put a mood's vehicle light on a set of roots: every mesh RECEIVES shadows (a kart drives under the
 * gantry and the trees; before this the venue's shadows passed through the bodywork), and a mood that
 * leaves a vehicle flat gets a weak fill sun pointed at the vehicles and nothing else.
 */
export function fitVehicleLight(scene: Scene, mood: VenueMood, roots: readonly TransformNode[], name: string): VehicleLightHandle {
  const meshes: AbstractMesh[] = [];
  for (const r of roots) for (const m of r.getChildMeshes()) { m.receiveShadows = true; meshes.push(m); }

  const fill = sunFillFor(mood);
  let light: DirectionalLight | null = null;
  if (fill > 0) {
    const M = MOODS[mood];
    light = new DirectionalLight(`vehicle_fill_${name}`, new Vector3(-M.sunDir[0], M.sunDir[1], -M.sunDir[2]).normalize(), scene);
    light.intensity = fill;
    light.diffuse = Color3.FromHexString(M.sun).scale(0.7).add(Color3.FromHexString(M.sky).scale(0.3));
    light.includedOnlyMeshes = meshes;
  }
  return {
    include(extra: readonly AbstractMesh[]) {
      for (const m of extra) { m.receiveShadows = true; meshes.push(m); }
      if (light) light.includedOnlyMeshes = meshes;
    },
    dispose() { light?.dispose(); light = null; },
  };
}
