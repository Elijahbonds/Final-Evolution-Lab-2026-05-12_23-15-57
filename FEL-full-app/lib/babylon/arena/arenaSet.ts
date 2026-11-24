// PHYSICS ARENA — the set (look pass 2026-11-24, docs/LOOK-PASS-AUDIT.md finding 12: "a court in a void"; knob arena.setV1).
// Shipped kits only, no new art (the audit's routed plan, (a)): the streetball cage the shipped 3v3 stands in
// (court/streetballDressing.ts, read, never edited: the posts and rail, the lamp poles, the benches; on desktop also the chain-link
// wire and the two graffiti walls), round the arena's own court, and an asphalt apron out to the horizon in the court's own apron
// colour, so the court stands somewhere instead of on a square in the sky. The arena keeps its own floor, lines, hoop, glass walls
// and sky (a different sky is a palette call: the owner's).
// Visual only: nothing here has a collider; the play area (hoopGeometry COURT, |x| <= 7.3, z -2..11.6) is inside the cage's clamp
// (|x| <= 8, the rim at z -0.6: the same half court the shipped 3v3 plays).

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { mountStreetball } from '../court/streetballDressing';
import { ARENA_RIM } from './hoopGeometry';

export interface ArenaSet { dispose(): void }

/** The apron: this far each way from the court's centre (m), a hair under the court's floor. */
export const APRON_M = 160;

/** `cage: false` for a mode whose camera stands at the fence line (the 3-point contest shoots from the racks, 7 m out at the
 *  corners: a cage post would stand in the shooter's view). */
export function mountArenaSet(scene: Scene, o: { cage?: boolean } = {}): ArenaSet {
  const tier = (scene.metadata as { felTier?: string } | null)?.felTier ?? 'desktop';
  const cage = o.cage === false ? null : mountStreetball(scene, { tier, rim: new Vector3(ARENA_RIM.x, ARENA_RIM.y, ARENA_RIM.z) });
  const apron = MeshBuilder.CreateGround('arena_set_apron', { width: APRON_M * 2, height: APRON_M * 2 }, scene);
  apron.position.set(0, -0.015, 4.6);
  // matte and dark: a PBR floor at a grazing angle mirrors the bright sky and the far apron read as a pale grey wall (the A/B)
  const m = new StandardMaterial('arena_set_apron_m', scene);
  m.diffuseColor = Color3.FromHexString('#161b26');   // the court texture's own apron colour
  m.specularColor = Color3.Black();
  m.emissiveColor = new Color3(0.05, 0.06, 0.08);    // the court floor's emissive: one surface
  apron.material = m;
  apron.isPickable = false;
  apron.applyFog = false;   // fogged, 160 m of it read as a pale band under the sky (the first A/B)
  return {
    dispose() { cage?.dispose(); apron.dispose(); m.dispose(); },
  };
}
