// Avatar system types. See AvatarSkeletonSpec.md — bone names are
// UNPREFIXED (`Hips`, `LeftArm`), NOT `mixamorig:`-prefixed. Every type here
// that touches the rig depends on that spec.

/** Slots an avatar can equip. One mesh per slot, all bound to one skeleton. */
export type AvatarSlot = 'head' | 'hair' | 'torso' | 'lower' | 'feet' | 'accessory';

/** Body archetypes ship as SEPARATE skinned meshes, not morph targets —
 *  Meshy doesn't generate morphs, garments would need matching morphs
 *  authored by hand or they tear, and morphs duplicate vertex data. */
export type BodyArchetype = 'lean' | 'athletic' | 'powerful';

/** The three tintable zones carried by an RGB mask texture. */
export interface TintSet {
  primary: string;      // hex — mask RED channel
  secondary: string;    // hex — mask GREEN channel
  accent: string;       // hex — mask BLUE channel
}

export interface DecalConfig {
  textureUrl: string;
  /** Bone the decal parents to, so it rides the skin instead of swimming. */
  boneTarget: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
}

/** Everything needed to reconstruct an avatar. This is what persists. */
export interface AvatarConfig {
  archetype: BodyArchetype;
  /** Uniform scale on the `Hips` root bone. Clamped to HEIGHT_RANGE. */
  height: number;
  skinTone: string;                       // hex, applied through the tint system
  slots: Partial<Record<AvatarSlot, string>>;   // slot → item id
  colors: TintSet;
  decals: DecalConfig[];
}

export const HEIGHT_RANGE: [number, number] = [0.92, 1.08];
export const MAX_DECALS = 3;

export const DEFAULT_AVATAR: AvatarConfig = {
  archetype: 'athletic',
  height: 1,
  skinTone: '#8d5a3b',
  slots: {},
  colors: { primary: '#22d3ee', secondary: '#1b2b3a', accent: '#ffd75e' },
  decals: [],
};

/** One equippable item in the manifest. */
export interface SlotItem {
  id: string;
  slot: AvatarSlot;
  name: string;
  glbUrl: string;
  /** RGB mask texture. Absent = untintable (e.g. a fixed-color accessory). */
  maskUrl?: string;
  /** Which archetypes this mesh is authored to fit. */
  archetypes: BodyArchetype[];
  /** Which of the three zones this item actually uses. */
  zones: Array<keyof TintSet>;
  /** Cosmetic ownership — the SERVER decides; this is display metadata only. */
  premium: boolean;
}

export interface BodyItem {
  archetype: BodyArchetype;
  glbUrl: string;
  maskUrl?: string;
}

export interface AvatarManifest {
  version: string;
  bodies: BodyItem[];
  items: SlotItem[];
}

/** Server-authoritative ownership. NEVER trust a client-side copy of this. */
export interface OwnershipState {
  ownedItemIds: string[];
}

/** Result of the Phase-0 rig validation harness. */
export interface RigReport {
  boneCount: number;
  missingRequired: string[];
  hasPrefixedNames: boolean;
  bindPose: 'T-pose' | 'A-pose' | 'unknown';
  skinnedMeshCount: number;
  triangleCount: number;
  conforms: boolean;
  notes: string[];
}

/** The bone names FEL code resolves directly. A rig missing any of these
 *  cannot play the shipped clip library. See AvatarSkeletonSpec.md. */
export const REQUIRED_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
] as const;
