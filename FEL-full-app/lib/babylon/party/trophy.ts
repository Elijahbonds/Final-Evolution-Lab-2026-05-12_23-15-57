// A TROPHY — the cup a won match raises from the court (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md Part B, tiebreak: "a
// trophy end scene"). A gold lathe on a dark plinth that rises from the floor with a small overshoot and stands, lit by the
// court's own rig. The rise is a pure function of the time since the win (`trophyRise`); the profile is a pure list of points
// (`trophyProfile`), so a test can hold both to their rules. One mesh for the cup, one for the plinth, two PBR materials.

import { Color3, Mesh, MeshBuilder, PBRMaterial, TransformNode, Vector3, type Scene } from '@babylonjs/core';

/** TUNED (new): the trophy's rise: seconds to come up, and the overshoot above its resting height. */
export const TROPHY_RISE_SEC = 0.9;
export const TROPHY_OVERSHOOT = 0.12;
/** 0..1(+overshoot): how far up the cup is `age` seconds after the win — easeOutBack, settling to exactly 1. Pure. */
export function trophyRise(age: number): number {
  const k = Math.min(1, Math.max(0, age / TROPHY_RISE_SEC));
  const c1 = 1.70158 * (1 + TROPHY_OVERSHOOT * 6), c3 = c1 + 1;   // an easeOutBack whose overshoot scales with TROPHY_OVERSHOOT
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

/** The cup's profile for a lathe (x = radius, y = height, metres): a foot, a stem, a bowl. Pure. */
export function trophyProfile(): { x: number; y: number }[] {
  return [
    { x: 0.0, y: 0.0 }, { x: 0.22, y: 0.0 }, { x: 0.24, y: 0.05 }, { x: 0.16, y: 0.09 },     // the foot
    { x: 0.07, y: 0.14 }, { x: 0.05, y: 0.3 }, { x: 0.09, y: 0.38 },                          // the stem and its knuckle
    { x: 0.2, y: 0.46 }, { x: 0.3, y: 0.62 }, { x: 0.32, y: 0.82 }, { x: 0.27, y: 0.94 },      // the bowl
    { x: 0.25, y: 0.94 }, { x: 0.0, y: 0.5 },                                                  // the inside, closed at the base
  ];
}

/** Where the cup stands: on the player's half of the court, in the camera's line (the net is at z = 0). */
export const TROPHY_AT = { x: 0, z: 3 };

export interface TrophyHandle {
  root: TransformNode;
  /** Set how far up the cup is, 0..1(+overshoot): 0 is sunk under the floor, 1 stands on it. */
  setRise(k: number): void;
  dispose(): void;
}

export function buildTrophy(scene: Scene, at = TROPHY_AT): TrophyHandle {
  const root = new TransformNode('tb_trophy', scene);
  root.position.set(at.x, 0, at.z);
  const gold = new PBRMaterial('tb_trophy_gold', scene);
  gold.albedoColor = Color3.FromHexString('#f2c14e'); gold.metallic = 0.95; gold.roughness = 0.22;
  gold.emissiveColor = Color3.FromHexString('#7a5a12').scale(0.25);
  const dark = new PBRMaterial('tb_trophy_plinth', scene);
  dark.albedoColor = Color3.FromHexString('#14102e'); dark.metallic = 0.4; dark.roughness = 0.45;
  const cup = MeshBuilder.CreateLathe('tb_trophy_cup', { shape: trophyProfile().map((p) => new Vector3(p.x, p.y, 0)), tessellation: 40, sideOrientation: Mesh.DOUBLESIDE }, scene);
  cup.parent = root; cup.position.y = 0.55; cup.material = gold; cup.isPickable = false;
  const plinth = MeshBuilder.CreateCylinder('tb_trophy_base', { height: 0.55, diameterTop: 0.7, diameterBottom: 0.85, tessellation: 32 }, scene);
  plinth.parent = root; plinth.position.y = 0.275; plinth.material = dark; plinth.isPickable = false;
  const sink = 1.7;   // total height ≈ 1.55 m: sunk this far below the floor at rise 0
  root.position.y = -sink;
  return {
    root,
    setRise(k) { root.position.y = -sink * (1 - k); },
    dispose() { cup.dispose(false, false); plinth.dispose(false, false); gold.dispose(); dark.dispose(); root.dispose(); },
  };
}
