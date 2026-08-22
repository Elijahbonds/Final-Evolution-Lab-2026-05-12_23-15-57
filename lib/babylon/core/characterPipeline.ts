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
import {
  defaultFace, getWearable, type FaceConfig, type WearableSlot,
} from '../../closet/wearable-catalog';

export interface PlayerIdentity {
  proportions: AvatarSpec | null;                 // null until a body scan exists
  face: FaceConfig;
  /** jersey/shorts/shoes/accent hex derived from equipped wearables + card skin. */
  palette: { jersey: string; shorts: string; shoes: string; accent: string };
}

const FALLBACK_PALETTE = { jersey: '#00E5FF', shorts: '#0b1220', shoes: '#A855F7', accent: '#FFD700' };

let cached: PlayerIdentity | null = null;

/** Fetch + merge the user's identity once per session. Fail soft to defaults. */
export async function resolveIdentity(force = false): Promise<PlayerIdentity> {
  if (cached && !force) return cached;
  const [closet, scan] = await Promise.all([
    fetch('/api/v1/closet').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/v1/workout/scan').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const face: FaceConfig = { ...defaultFace(), ...(closet?.look?.face ?? {}) };
  const equipped: Partial<Record<WearableSlot, string | null>> = closet?.look?.equipped ?? {};
  const cardAccent: string | undefined = closet?.skins?.find(
    (s: { id: string; accent?: string }) => s.id === closet?.look?.skinCardId,
  )?.accent;

  const accentOf = (slot: WearableSlot, fallback: string): string => {
    const id = equipped[slot];
    return (id && getWearable(id)?.accent) || fallback;
  };
  const palette = {
    jersey: accentOf('tops', FALLBACK_PALETTE.jersey),
    shorts: accentOf('shorts', FALLBACK_PALETTE.shorts),
    shoes: accentOf('shoes', FALLBACK_PALETTE.shoes),
    accent: cardAccent || accentOf('accessory', FALLBACK_PALETTE.accent),
  };

  const proportions: AvatarSpec | null = scan?.scans?.[0]?.avatarSpec ?? null;

  cached = { proportions, face, palette };
  return cached;
}

/** Call on Closet save / new scan so the next spawn picks up changes. */
export function invalidateIdentity(): void { cached = null; }

// ── Application layers ──────────────────────────────────────────────────

const TORSO_BONES = ['Spine', 'Spine1', 'Spine2', 'Chest'];
const ARM_BONES = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];

export function applyIdentity(spawn: SpawnedCharacter, id: PlayerIdentity): void {
  // 1) Proportions (scan AvatarSpec) — height on root, build on torso, reach on arms.
  if (id.proportions) {
    const p = id.proportions;
    spawn.root.scaling.scaleInPlace(p.heightScale || 1);
    scaleBones(spawn, TORSO_BONES, p.buildScale || 1);
    scaleBones(spawn, ARM_BONES, p.reachScale || 1);
  }
  // 2) Face — skin tone on skin materials (the model has no blendshapes today;
  //    the flat FaceConfig preset variety is handled by the Closet preview rig).
  applySkinTone(spawn, id.face.skinTone);
  // 3) Wardrobe palette — jersey/shorts/shoes tints by mesh/material slot name.
  tintSlot(spawn, ['jersey', 'top', 'shirt', 'tee'], id.palette.jersey);
  tintSlot(spawn, ['shorts', 'pants', 'bottom'], id.palette.shorts);
  tintSlot(spawn, ['shoe', 'sneaker', 'boot'], id.palette.shoes);
}

function scaleBones(spawn: SpawnedCharacter, names: string[], s: number): void {
  if (s === 1) return;
  for (const n of names) {
    spawn.skeleton.bones.find((b) => b.name === n)?.getTransformNode()?.scaling.setAll(s);
  }
}
function matColor(m: TintMat): Color3 | undefined {
  return m.albedoColor ?? m.diffuseColor;
}
function applySkinTone(spawn: SpawnedCharacter, hex: string): void {
  const tone = Color3.FromHexString(hex);
  for (const mesh of spawn.meshes) {
    const m = mesh.material as TintMat | null;
    const c = m && matColor(m);
    if (!c) continue;
    const isSkin = c.r > 0.45 && c.g > 0.25 && c.b > 0.15 && c.r > c.b && c.g > c.b * 0.9;
    if (!isSkin) continue;
    const clone = m!.clone(`${m!.name}_skin`) as TintMat | null;
    if (clone) { matColor(clone)?.copyFrom(tone); mesh.material = clone; }
  }
}
function tintSlot(spawn: SpawnedCharacter, keys: string[], hex: string): void {
  const tint = Color3.FromHexString(hex);
  for (const mesh of spawn.meshes) {
    const m = mesh.material as TintMat | null;
    if (!m) continue;
    const name = `${mesh.name} ${m.name}`.toLowerCase();
    if (!keys.some((k) => name.includes(k))) continue;
    const clone = m.clone(`${m.name}_wear`) as TintMat | null;
    if (clone) { matColor(clone)?.copyFrom(tint); mesh.material = clone; }
  }
}

// ── The only sanctioned spawn paths ──────────────────────────────────────

export const CharacterPipeline = {
  /** Player-controlled character: identity ALWAYS applied. */
  async spawnPlayer(scene: Scene, url: string, opts: SpawnOpts = {}): Promise<SpawnedCharacter> {
    const [spawn, id] = await Promise.all([
      CharacterLibrary.spawn(scene, url, opts),
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
