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
import { DEFAULT_HERO_URL, normalizeHeroUrl } from './athleteRoster';

/** Rival colours that double as roster seeds: a different roster body per NPC in a scene, the same bodies every session. */
const NPC_SEEDS = ['#F25F5C', '#2EC4B6', '#FFBF47', '#5B8DEF', '#B07CF5', '#7BD389'];
let npcSeq = 0;
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
  /** NPCs/mobs: variety (tint/scale), never the player's identity. Owner decision 2026-09-05 (Ship Pass 6): the hero is
   *  the owner's scan, so an NPC asked to wear the hero slot without a tint would be a clone of the owner — it takes a
   *  roster body instead (the tint seeds CharacterLibrary's deterministic roster pick; the roster's baked kit ignores it). */
  spawnNpc(scene: Scene, url: string, opts: SpawnOpts = {}): Promise<SpawnedCharacter> {
    const wantsHero = normalizeHeroUrl(url) === DEFAULT_HERO_URL;
    const tint = opts.tint ?? (wantsHero ? NPC_SEEDS[npcSeq++ % NPC_SEEDS.length] : undefined);
    return CharacterLibrary.spawn(scene, url, tint ? { ...opts, tint } : opts);
  },
};
