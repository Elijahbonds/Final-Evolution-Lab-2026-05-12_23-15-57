// THE NIGHT PARK'S FLOODLIGHTS (vis-board, visual wave 2, 2026-10-13) — Part B snowboard_slalom: "Night Park: clustered
// floodlights down the course, glow on the gate tops."
//
// "Floodlit kickers, everything else is dark" was the venue's own line, and the frame was a bright blue afternoon. This stands
// the lamps the line promises: a pole either side of the groom every few gates the whole way down, each with a head the shared
// rig reads as a lamp — the mesh is NAMED `lhead_*` on a `lampHead_*` material, so the EmissiveGlow layer draws its halo and
// FixtureLights puts a clustered point light under it that lands on the snow (desktop/high). A point light under the head, not
// an aimed flood: FixtureLights aims its floods at where the player stood when the venue loaded, which on a 600 m run is the
// wrong place for every lamp but the first. The glow halo is what carries the lamps further down; the light is local.
// Poles are one thin-instanced draw; the heads are one small mesh each (the rig matches by mesh name). Phones get every other
// pole and no halo (the glow is desktop-only). Pure placement is in `lampSpots`, tested without a scene.

import { Color3, Matrix, MeshBuilder, PBRMaterial, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { unlitDiffuse } from './unlit';

/** Lamp height above the snow under it, metres. */
export const LAMP_H = 6.4;
/** A pole every this many gates, a lamp on each side of the groom. */
export const GATE_EVERY = 4;

export interface SlopeLampSpot { x: number; y: number; z: number; side: -1 | 1; gate: number }

/** Pure: where the poles stand — beside the groom (half-width `half`, +2 m outside the rider's clamp), at every `every`-th gate,
 *  on the snow under that gate. `markers` are the gates' centres on the snow (the run's own). */
export function lampSpots(markers: readonly { x: number; y: number; z: number }[], half: number, every: number = GATE_EVERY): SlopeLampSpot[] {
  const out: SlopeLampSpot[] = [];
  const step = Math.max(1, Math.floor(every));
  for (let i = 0; i < markers.length; i += step) {
    for (const side of [-1, 1] as const) out.push({ x: side * (half + 2), y: markers[i].y, z: markers[i].z, side, gate: i });
  }
  return out;
}

/** Pure: a phone stands every other pole (and has no halo or fixture light to show for the rest). */
export function lampsForTier(spots: readonly SlopeLampSpot[], tier: string | null | undefined): SlopeLampSpot[] {
  return tier === 'mobile' ? spots.filter((s) => (s.gate / GATE_EVERY) % 2 < 1) : [...spots];
}

/** Build the lamps; returns every mesh made (the caller's world disposes them). */
export function buildSlopeLamps(scene: Scene, markers: readonly Vector3[], half: number, tier: string | null | undefined): AbstractMesh[] {
  const spots = lampsForTier(lampSpots(markers, half), tier);
  if (!spots.length) return [];
  const made: AbstractMesh[] = [];
  const steel = new PBRMaterial('slopeLampPoleM', scene);
  steel.albedoColor = new Color3(0.14, 0.16, 0.2); steel.metallic = 0.6; steel.roughness = 0.5;
  const pole = MeshBuilder.CreateCylinder('slope_lamp_pole', { diameterTop: 0.12, diameterBottom: 0.2, height: LAMP_H, tessellation: 8 }, scene);
  pole.material = steel; pole.isPickable = false;
  const buf: number[] = [];
  for (const s of spots) buf.push(...Matrix.Translation(s.x, s.y + LAMP_H / 2, s.z).asArray());
  pole.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
  made.push(pole);
  const head = new StandardMaterial('lampHead_slope', scene);
  head.emissiveColor = new Color3(0.82, 0.92, 1); head.diffuseColor = unlitDiffuse(); head.specularColor = Color3.Black(); head.disableLighting = true;
  spots.forEach((s, i) => {
    const h = MeshBuilder.CreateBox(`lhead_slope_${i}`, { width: 1.1, height: 0.22, depth: 0.7 }, scene);
    // the head hangs over the groom: tilted a little toward the middle of the run
    h.position.set(s.x - s.side * 0.45, s.y + LAMP_H + 0.05, s.z);
    h.rotation.z = s.side * 0.22;
    h.material = head; h.isPickable = false; h.receiveShadows = false;
    made.push(h);
  });
  for (const m of made) m.freezeWorldMatrix();
  return made;
}
