// CREATOR DOC v1 — the look a player builds with the Creator's tools (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 1).
//
// WHAT THIS IS. One versioned JSON document for everything the Creator adds on top of the Closet's FaceConfig: parts
// placed on bones, paint layers, per-slot colours, shape values and flags. It is stored INSIDE `AvatarLook.face`
// (`face.creator`, saved characters in `face.creatorSlots`), which is already a Json column, so there is no schema
// change and no migration. Phase 1 defines and stores all of it; colours apply now; parts (phase 2), paint (phase 3)
// and shape (phase 4) render later through the one hook in playerIdentity.applyIdentity.
//
// WHAT IT IS NOT. Not a second FaceConfig: skin, hair, eyes and the face presets stay in FaceConfig, where every mode
// already reads them. Not a store for a name, an email or face-scan data: the scan writes FaceConfig.sliders, never
// this doc, and the share code (shareCode.ts) carries only this doc and the categorical presets.
//
// SHIP TOOLS, NOT CHARACTERS. Every id below is a generic shape, pattern or stamp. No preset, name or logo of anyone's
// character belongs in these lists.
//
// THE LISTS ARE THE ALLOW-LIST. The sanitiser (sanitize.ts) drops any id not named here, so adding a shape is adding a
// name to a list (backwards compatible: an older client drops what it does not know). Removing or renaming one breaks
// saved docs and share codes; bump CREATOR_DOC_VERSION and migrate instead.
//
// KEY NAMES MATTER. lookPrivacy.payloadHasImage refuses any save whose keys mention image/photo/png/texture/pixels, so
// none of the keys below may (a paint layer is a `pattern` or a `stamp`, never a texture).

export const CREATOR_DOC_VERSION = 1 as const;

/** Budgets (CREATOR-PLAN: 64 parts). Past these the sanitiser keeps the first N. */
export const MAX_PARTS = 64;
export const MAX_PAINT_LAYERS = 24;
export const MAX_SLOTS = 5;
/** Serialised size cap of one sanitised doc, in characters of JSON. A doc at every budget, every field at its longest,
 *  is under this (look.test.ts measures it), so the cap only bites if the budgets and the cap drift apart. */
export const MAX_DOC_CHARS = 24_000;

/** Procedural part shapes (phase 2 builds each in code; no art needed). */
export const PART_SHAPES = [
  'spike', 'cone', 'horn', 'blade', 'plate', 'disc', 'ring', 'sphere', 'capsule', 'box', 'visor', 'lens', 'fin', 'wing',
  'strap', 'capeStrip', 'shoulderPad', 'belt', 'maskShell', 'torus', 'tube',
] as const;
export type PartShape = typeof PART_SHAPES[number];

/** The kit rig's 22 joints (fel-kit-male/female.glb skin, read 2026-10-06). Parts hang on these bones' nodes. */
export const PART_BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
] as const;
export type PartBone = typeof PART_BONES[number];

export const FINISHES = ['matte', 'gloss', 'metal', 'glow'] as const;
export type Finish = typeof FINISHES[number];

export const PAINT_TYPES = ['fill', 'pattern', 'stamp', 'text'] as const;
export type PaintType = typeof PAINT_TYPES[number];

/** Body regions (phase 3 derives each mask from the skin weights, not a hand-drawn map). */
export const PAINT_REGIONS = [
  'all', 'head', 'face', 'torsoFront', 'torsoBack', 'armLeft', 'armRight', 'handLeft', 'handRight',
  'legLeft', 'legRight', 'footLeft', 'footRight',
] as const;
export type PaintRegion = typeof PAINT_REGIONS[number];

/** What a layer paints: the skin, the garments over it, or both. */
export const PAINT_SURFACES = ['skin', 'garments', 'both'] as const;
export type PaintSurface = typeof PAINT_SURFACES[number];

export const PAINT_PATTERNS = [
  'web', 'radial', 'stripes', 'chevrons', 'gradient', 'camo', 'dots', 'scales', 'checks', 'carbon', 'lines',
] as const;
export type PaintPattern = typeof PAINT_PATTERNS[number];

/** Generic stamp shapes. Text is its own layer type, through the jersey plate's sanitiser. */
export const PAINT_STAMPS = [
  'circle', 'ring', 'star', 'bolt', 'triangle', 'diamond', 'heart', 'cross', 'eye', 'eyeSharp', 'flame', 'wing',
  'tribalCurve', 'tribalSpike', 'chevron', 'drop',
] as const;
export type PaintStamp = typeof PAINT_STAMPS[number];

/** Colour slots the doc can override. Skin, hair and eyes stay in FaceConfig. */
export const COLOUR_SLOTS = ['jersey', 'shorts', 'shoes', 'accent'] as const;
export type ColourSlot = typeof COLOUR_SLOTS[number];

/** Face morph values the doc may carry: the forge's seven today (faceMorphs.FACE_MORPH_NAMES). Phase 4 makes this
 *  list data-driven so phase 5's baked morphs are picked up by name. */
export const SHAPE_FACE_KEYS = ['faceLong', 'faceRound', 'faceSquare', 'faceHeart', 'faceDiamond', 'jawOpen', 'browRaise'] as const;
export type ShapeFaceKey = typeof SHAPE_FACE_KEYS[number];

/**
 * Cosmetic body proportions, as multipliers on the bind length (phase 4: counter-scaled bones, nothing compounds).
 * NO ARMS: arm length is frozen for gameplay (REACH-FREEZE, playFrame.ts), and ranked / STANDARD_FRAME_MODES spawn 1.0.
 * assumption: these ranges are a first guess for phase 4 to tune by eye; nothing reads them in phase 1.
 */
export const PROPORTION_RANGES = {
  legs: [0.9, 1.1], torso: [0.9, 1.1], shoulders: [0.9, 1.12], neck: [0.85, 1.2], head: [0.9, 1.12],
  hands: [0.9, 1.15], feet: [0.9, 1.15],
} as const satisfies Record<string, readonly [number, number]>;
export type ProportionKey = keyof typeof PROPORTION_RANGES;
export const PROPORTION_KEYS = Object.keys(PROPORTION_RANGES) as ProportionKey[];

/** Numeric ranges the sanitiser clamps to. Positions are bone-local metres (before the rig scale). */
export const RANGES = {
  partPos: [-0.6, 0.6],
  partRot: [-180, 180],      // degrees
  partScale: [0.05, 8],      // multiplier on the shape's base size (phase 2 sets base sizes near 10 cm)
  paintXY: [0, 1],           // position inside the region, 0..1
  paintRot: [-180, 180],
  paintScale: [0.02, 4],
  paintStretch: [0.2, 5],    // width / height
  opacity: [0, 1],
} as const;

export type Vec3 = [number, number, number];

export interface CreatorPart {
  /** Short id, unique in the doc ([a-z0-9], 1–8). The editor's handle for selection and undo. */
  id: string;
  shape: PartShape;
  bone: PartBone;
  pos: Vec3;
  rot: Vec3;
  /** Non-uniform scale is the "squash". */
  scale: Vec3;
  colour: string;
  finish: Finish;
  /** Also place the mirror image on the opposite side's bone. */
  mirror: boolean;
}

export interface PaintTransform { x: number; y: number; rot: number; scale: number; stretch: number }

export interface PaintLayer {
  id: string;
  type: PaintType;
  region: PaintRegion;
  surface: PaintSurface;
  /** type 'pattern' only */
  pattern?: PaintPattern;
  /** type 'stamp' only */
  stamp?: PaintStamp;
  /** type 'text' only — through sanitizeJersey's name rule (A–Z, 0–9, space, hyphen; 12 characters) */
  text?: string;
  at: PaintTransform;
  /** 1–3 colours: primary, secondary, accent (a fill uses the first) */
  colours: string[];
  opacity: number;
  mirror: boolean;
}

export interface CreatorShape {
  face: Partial<Record<ShapeFaceKey, number>>;
  body: Partial<Record<ProportionKey, number>>;
}

export interface CreatorFlags {
  /** Suit mode: hide the garments and paint the whole body (phase 3). */
  suit: boolean;
}

export interface CreatorDoc {
  v: typeof CREATOR_DOC_VERSION;
  parts: CreatorPart[];
  paint: PaintLayer[];
  colours: Partial<Record<ColourSlot, string>>;
  shape: CreatorShape;
  flags: CreatorFlags;
}

/** One saved character. `label` runs through the jersey name rule; `doc` is a full CreatorDoc. */
export interface CreatorSlot { label: string; doc: CreatorDoc }

export function emptyCreatorDoc(): CreatorDoc {
  return { v: CREATOR_DOC_VERSION, parts: [], paint: [], colours: {}, shape: { face: {}, body: {} }, flags: { suit: false } };
}

/** True when the doc changes nothing (so a save can omit it). */
export function isEmptyCreatorDoc(d: CreatorDoc): boolean {
  return !d.parts.length && !d.paint.length && !Object.keys(d.colours).length
    && !Object.keys(d.shape.face).length && !Object.keys(d.shape.body).length && !d.flags.suit;
}

/** The bone on the other side ('LeftArm' ↔ 'RightArm'); a centre bone mirrors onto itself. For phase 2's mirror. */
export function mirrorBone(b: PartBone): PartBone {
  if (b.startsWith('Left')) return `Right${b.slice(4)}` as PartBone;
  if (b.startsWith('Right')) return `Left${b.slice(5)}` as PartBone;
  return b;
}
