// START LIGHTS (vis-race, visual wave 2, 2026-10-13) — the gantry's three lamps count the grid down with the beats.
//
// Part B, velocitykart: "a start-light gantry with glow". The start / finish gantry (kartDressing.buildGantry) has carried a
// checkered banner since the detail pass; the countdown was a number on the HUD and nothing in the world. This hangs a light
// bar under the banner on the road's side of it, turned to the grid: one red lamp lights on each of the three beats (3 · 2 · 1),
// all three go green on GO and stay a moment, then go dark. It reads RaceStart's own clock (the beat the HUD says); it keeps no
// clock of its own and changes nothing about the start.
//
// The lamps are named `__kart_startlight_neon_N` (the `__` keeps them out of the shadow casters: a draw a cascade each on desktop): the glow's include list matches "neon" (a halo round a lit lamp), and they are
// NOT named like a lantern or a bulb — the fixture lights would read a lit red lamp at mount and keep a red point light on the
// road for the whole race. They are built LIT, so the glow, which decides at mount which meshes emit, includes them; the
// first set() puts them dark.

import { Color3, Mesh, MeshBuilder, PBRMaterial, TransformNode } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { pointAlong, type RacingLine } from './racingLine';

export type Lamp = 'off' | 'red' | 'green';
/** How long the green holds after GO, seconds. */
export const GREEN_HOLD_SEC = 1.6;

/**
 * Pure: the three lamps for the countdown's `beat` (3, 2, 1 → 1, 2, 3 red; 0 = GO; −1 = before the first beat) and the seconds
 * since GO (null before it). Green for GREEN_HOLD_SEC after GO, then dark.
 */
export function lampStates(beat: number, sinceGo: number | null): [Lamp, Lamp, Lamp] {
  if (sinceGo !== null) return sinceGo < GREEN_HOLD_SEC ? ['green', 'green', 'green'] : ['off', 'off', 'off'];
  if (beat < 1) return ['off', 'off', 'off'];
  const lit = Math.max(0, Math.min(3, 4 - beat));
  return [0, 1, 2].map((i) => (i < lit ? 'red' : 'off')) as [Lamp, Lamp, Lamp];
}

const COLOR: Record<Lamp, Color3> = { off: new Color3(0.07, 0.05, 0.05), red: new Color3(1, 0.1, 0.08), green: new Color3(0.1, 1, 0.3) };

export interface StartLightsHandle {
  /** Set the lamps from the start clock: the beat on screen, and seconds since GO (null while the count runs). */
  set(beat: number, sinceGo: number | null): void;
  readonly lamps: readonly Mesh[];
  dispose(): void;
}

export function buildStartLights(scene: Scene, line: RacingLine, halfWidth: number, parent: TransformNode | null): StartLightsHandle {
  const root = new TransformNode('kart_startlights', scene);
  if (parent) root.parent = parent;
  const at = pointAlong(line, 0);
  const yaw = Math.atan2(at.tangent.x, at.tangent.z);
  root.position.copyFrom(at.pos); root.rotation.y = yaw;   // local +z = down the road, local +x = across it
  const mats: PBRMaterial[] = [];
  const housingMat = VenueKit.paint(scene, 'kart_startlight_housing', '#14171d', 0.02, 0.6);
  mats.push(housingMat);
  const housing = MeshBuilder.CreateBox('__kart_startlight_housing', { width: 5.2, height: 1.3, depth: 0.45 }, scene);
  housing.material = housingMat; housing.isPickable = false; housing.parent = root; housing.position.set(0, 4.35, -0.45);
  const lamps: Mesh[] = [];
  const state: Lamp[] = ['red', 'red', 'red'];
  for (let i = 0; i < 3; i++) {
    const m = new PBRMaterial(`kart_startlight_neon_mat_${i}`, scene);
    m.albedoColor = new Color3(0.04, 0.04, 0.04); m.emissiveColor = COLOR.red.clone(); m.metallic = 0; m.roughness = 0.3;
    mats.push(m);
    const lamp = MeshBuilder.CreateCylinder(`__kart_startlight_neon_${i}`, { diameter: 0.95, height: 0.18, tessellation: 20 }, scene);
    lamp.rotation.x = Math.PI / 2;   // the disc faces back down the road, toward the grid
    lamp.position.set((i - 1) * 1.6, 4.35, -0.72);
    lamp.material = m; lamp.isPickable = false; lamp.parent = root;
    lamps.push(lamp);
  }
  void halfWidth;
  return {
    set(beat, sinceGo) {
      const next = lampStates(beat, sinceGo);
      next.forEach((s, i) => {
        if (s === state[i]) return;
        state[i] = s;
        (lamps[i].material as PBRMaterial).emissiveColor.copyFrom(COLOR[s]);
      });
    },
    lamps,
    dispose() { for (const l of lamps) l.dispose(); housing.dispose(); root.dispose(); for (const m of mats) m.dispose(); },
  };
}
