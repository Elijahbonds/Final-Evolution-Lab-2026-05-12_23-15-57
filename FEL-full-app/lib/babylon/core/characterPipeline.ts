// characterPipeline (M31) — ONE identity pipe for the player character, everywhere.
// scan proportions (M17 AvatarSpec) + face (Closet FaceConfig, M20) + wardrobe
// (equipped Wearables / card skin, M20)  ->  PlayerIdentity  ->  applied at spawn.
// Modes MUST spawn the player via CharacterPipeline.spawnPlayer(); NPCs via spawnNpc().
//
// Adapted to the REAL FEL schema: FaceConfig is the flat string config from
// lib/closet/wearable-catalog; body proportions come from the stored AvatarSpec
// (lib/workout/avatar-builder). Everything fails soft to defaults so a spawn can
// never throw just because a scan/look hasn't been created yet.

import { Color3 } from '@babylonjs/core';
import type { Scene, Material } from '@babylonjs/core';

// A material we can read/write a base color on, regardless of PBR vs Standard.
// (The PBR & Standard *intersection* collapses to `never` due to private-field
// clashes, so we use a structural type instead.)
type TintMat = Material & { albedoColor?: Color3; diffuseColor?: Color3 };
import { CharacterLibrary, type SpawnedCharacter, type SpawnOpts } from './CharacterLibrary';
import type { AvatarSpec } from '../../workout/avatar-builder';
import { boneNode } from '../anim/boneLookup';
import {
  defaultFace, getWearable, type FaceConfig, type WearableSlot,
} from '../../closet/wearable-catalog';

// The identity machinery lives in ./playerIdentity (extracted so the shared
// spawn layer can apply it without an import cycle). Re-exported here so the
// sanctioned spawn paths keep their stable public API.
export {
  resolveIdentity, invalidateIdentity, applyIdentity, type PlayerIdentity,
} from './playerIdentity';
import { resolveIdentity, applyIdentity } from './playerIdentity';

// ── The only sanctioned spawn paths ──────────────────────────────────────

export const CharacterPipeline = {
  /** Player-controlled character: identity ALWAYS applied. */
  async spawnPlayer(scene: Scene, url: string, opts: SpawnOpts = {}): Promise<SpawnedCharacter> {
    const [spawn, id] = await Promise.all([
      // identity: false — the pipeline applies it below; the library layer
      // would apply it a second time (measured: two jersey plates on Spine2).
      CharacterLibrary.spawn(scene, url, { ...opts, identity: false }),
      resolveIdentity(),
    ]);
    try { applyIdentity(spawn, id); } catch (e) { console.error('[FEL-IDENTITY] applyIdentity failed', e); }
    return spawn;
  },
  /** NPCs/mobs: variety (tint/scale), never the player's identity. */
  spawnNpc(scene: Scene, url: string, opts: SpawnOpts = {}): Promise<SpawnedCharacter> {
    return CharacterLibrary.spawn(scene, url, opts);
  },
};
