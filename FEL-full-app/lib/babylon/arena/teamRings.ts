// teamRings — a team-colour ring on the ground under every body in the arena's 3v3s (arena.teamRings; lane/physics-arena §9 slice
// 2, the coordinator 2026-11-25). The bodies' kits cannot say whose side a body is on: an NPC's tint only seeds which roster body it
// is (CharacterPipeline.spawnNpc; the roster's baked kit ignores the colour), so in the pictures a team-mate and a rival wear the
// same olive tee. A ring at the feet, in the side's colour, says it at a glance from any camera.
// Cost: ONE mesh a side, its rings thin instances of it (2 draws for every body on the pitch); unlit, never in a shadow map
// (the `__` name keeps the light rig's caster classifier off it), receiving none, unfogged.

import { Color3, Matrix, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import type { Mesh, Scene, TransformNode } from '@babylonjs/core';

/** The sides' colours (the arena's: the player's teal, the rival red). */
export const HOME_RING = '#2EC4B6', AWAY_RING = '#F25F5C';
/** The ring's size (m: outer diameter, tube) and its height over the floor. */
const RING_D = 0.95, RING_T = 0.05, RING_Y = 0.025;

/** A side: its colour and its bodies (null: no ring — the player's man, who has his own). */
export interface RingSide { color: string; nodes: () => Array<TransformNode | null> }
export interface TeamRingsHandle { update(): void; dispose(): void }

export function mountTeamRings(scene: Scene, sides: RingSide[]): TeamRingsHandle {
  const meshes: Mesh[] = sides.map((side, k) => {
    const m = MeshBuilder.CreateTorus(`__arena_ring_${k}`, { diameter: RING_D, thickness: RING_T, tessellation: 28 }, scene);
    m.scaling.y = 0.25; m.position.y = RING_Y;   // flat on the floor (the instances carry x and z only)
    const mat = new StandardMaterial(`__arena_ring_mat_${k}`, scene);
    mat.emissiveColor = Color3.FromHexString(side.color); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black(); mat.disableLighting = true;
    m.material = mat;
    m.isPickable = false; m.receiveShadows = false; m.applyFog = false;
    m.alwaysSelectAsActiveMesh = true;   // the instances move every frame: no bounds to keep
    m.thinInstanceSetBuffer('matrix', new Float32Array(16 * Math.max(1, side.nodes().length)), 16, false);
    return m;
  });
  const mtx = new Matrix();
  const update = () => {
    sides.forEach((side, k) => {
      const nodes = side.nodes(), m = meshes[k];
      nodes.forEach((n, i) => {
        if (n) Matrix.TranslationToRef(n.position.x, 0, n.position.z, mtx); else Matrix.TranslationToRef(0, -1000, 0, mtx);
        m.thinInstanceSetMatrixAt(i, mtx, i === nodes.length - 1);
      });
    });
  };
  update();
  return { update, dispose() { for (const m of meshes) { m.material?.dispose(); m.dispose(); } } };
}
