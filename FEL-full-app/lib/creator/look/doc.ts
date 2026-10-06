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
/** Phase 4a (2026-10-06): one saved character (a slot: its doc plus its base, numbers and worn items) is at most this
 *  much JSON — the doc's cap plus room for the rest, which is bounded by allow-lists (sanitize.sanitizeCreatorSlot). */
export const MAX_SLOT_CHARS = MAX_DOC_CHARS + 2_000;
/** The whole creator part of `AvatarLook.face` (the active doc, every slot, the pointer): five slots at their cap plus
 *  the active doc is ~154k, so this only bites if the budgets drift (storage.holdCreator drops trailing slots, never
 *  the active one, to fit). */
export const MAX_FACE_CHARS = 160_000;

/** Procedural part shapes (phase 2 builds each in code, lib/babylon/creator/parts/shapes.ts; no art needed).
 *  APPEND ONLY: saved docs and share codes name these. Phase 2 (2026-10-06) appended the second row, generic building
 *  blocks only; phase 4c (2026-10-06) the third: a lightning bolt, a skirt, a helmet and a hood (shells with a face
 *  opening), an ear, a tail segment, and — for what the archetype fixtures were waiting on — a beard shell, boot and glove
 *  shells and a hair strand. Generic shapes only. Keep every name at most 11 characters (the size-cap test budgets the
 *  longest). */
export const PART_SHAPES = [
  'spike', 'cone', 'horn', 'blade', 'plate', 'disc', 'ring', 'sphere', 'capsule', 'box', 'visor', 'lens', 'fin', 'wing',
  'strap', 'capeStrip', 'shoulderPad', 'belt', 'maskShell', 'torus', 'tube',
  'cylinder', 'wedge', 'dome', 'pyramid', 'gem', 'crescent', 'leaf', 'claw', 'arc',
  'bolt', 'skirt', 'helmet', 'hood', 'ear', 'tailSeg', 'beard', 'bootShell', 'gloveShell', 'strand',
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

/** TWO-TONE PARTS (phase 4c, 2026-10-06): a part's second colour covers one side of a SPLIT across the shape, or a BAND
 *  (a stripe) round it, along one of the shape's own axes (x side, y its length, z its front; parts/shapes.ts says which
 *  way each shape runs). Cut in the geometry, so the edge is crisp (parts/twoTone.ts). */
export const PART_TONES = ['split', 'band'] as const;
export type PartTone = typeof PART_TONES[number];
export const TONE_AXES = ['x', 'y', 'z'] as const;
export type ToneAxis = typeof TONE_AXES[number];

/** BENDABLE PARTS (phase 4c): these shapes may `swing` — skinned to a short bone chain that follows the body with a
 *  cheap spring (parts/swing.ts). They are the ones that hang or trail: a cape strip, a hair strand, a tail segment. */
export const SWING_SHAPES = ['capeStrip', 'strand', 'tailSeg'] as const;
export const isSwingShape = (s: string): boolean => (SWING_SHAPES as readonly string[]).includes(s);

export const PAINT_TYPES = ['fill', 'pattern', 'stamp', 'text'] as const;
export type PaintType = typeof PAINT_TYPES[number];

/** Body regions (phase 3 derives each mask from the skin weights, not a hand-drawn map:
 *  lib/babylon/creator/paint/bodyChart.ts). APPEND ONLY. Phase 3 (2026-10-06) appended the second row: the neck, each
 *  limb's two segments, and `body` (everything below the head, the neck included: the suit's region). `armLeft` is the upper arm and the
 *  forearm, `legLeft` the thigh and the shin; the hands and feet are their own regions. Phase 4a appended `ears` (both
 *  ears, split off the head geometrically like face and scalp; bodyChart.ts), so they can be painted or cut out. */
export const PAINT_REGIONS = [
  'all', 'head', 'face', 'torsoFront', 'torsoBack', 'armLeft', 'armRight', 'handLeft', 'handRight',
  'legLeft', 'legRight', 'footLeft', 'footRight',
  'neck', 'upperArmLeft', 'upperArmRight', 'forearmLeft', 'forearmRight', 'thighLeft', 'thighRight', 'shinLeft',
  'shinRight', 'body',
  'ears',
] as const;
export type PaintRegion = typeof PAINT_REGIONS[number];

/** What a layer paints: the skin, the garments over it, or both. */
export const PAINT_SURFACES = ['skin', 'garments', 'both'] as const;
export type PaintSurface = typeof PAINT_SURFACES[number];

/** Procedural patterns (lib/babylon/creator/paint/patterns.ts). `radial` is radial lines, `lines` pinstripes.
 *  APPEND ONLY; phase 3 appended `waves` and `hexes`. */
export const PAINT_PATTERNS = [
  'web', 'radial', 'stripes', 'chevrons', 'gradient', 'camo', 'dots', 'scales', 'checks', 'carbon', 'lines',
  'waves', 'hexes',
] as const;
export type PaintPattern = typeof PAINT_PATTERNS[number];

/** Generic stamp shapes (lib/babylon/creator/paint/stamps.ts). Text is its own layer type, through the jersey plate's
 *  sanitiser. APPEND ONLY; phase 3 appended the second row (`cross` is the diagonal one, `plus` the upright one). */
export const PAINT_STAMPS = [
  'circle', 'ring', 'star', 'bolt', 'triangle', 'diamond', 'heart', 'cross', 'eye', 'eyeSharp', 'flame', 'wing',
  'tribalCurve', 'tribalSpike', 'chevron', 'drop',
  'plus', 'square', 'hexagon', 'crescent', 'arrow', 'slash',
] as const;
export type PaintStamp = typeof PAINT_STAMPS[number];

/** How a layer meets what is under it. Kept simple on purpose (CREATOR-PLAN phase 3): paint over, or darken through.
 *  APPEND ONLY. Phase 4c (2026-10-06) appended `glow`: painted over like `normal`, and ALSO lit from within (the body's
 *  emissive channel, renderPaint.ts) — panel lines, an arc reactor, glowing tattoos. Tier-aware: a smaller glow texture on
 *  a phone, and only the first few glow layers glow there (the rest paint as normal). */
export const PAINT_BLENDS = ['normal', 'multiply', 'glow'] as const;
export type PaintBlend = typeof PAINT_BLENDS[number];

/** Colour slots the doc can override. Skin, hair and eyes stay in FaceConfig. */
export const COLOUR_SLOTS = ['jersey', 'shorts', 'shoes', 'accent'] as const;
export type ColourSlot = typeof COLOUR_SLOTS[number];

/** Face morph values the doc may carry: the forge's seven today (faceMorphs.FACE_MORPH_NAMES). Phase 4c (2026-10-06)
 *  made the list DATA-DRIVEN: any name that passes faceMorphList.isFaceMorphName is kept (these seven first, at most
 *  MAX_FACE_MORPHS), so a morph phase 5 bakes into the body is carried by name without a code change. */
export const SHAPE_FACE_KEYS = ['faceLong', 'faceRound', 'faceSquare', 'faceHeart', 'faceDiamond', 'jawOpen', 'browRaise'] as const;
/** A face morph's name: one of the known seven, or any other name the face morph rule lets through (phase 4c). */
export type ShapeFaceKey = typeof SHAPE_FACE_KEYS[number] | (string & {});

/**
 * Cosmetic body proportions, as multipliers (CREATOR-PLAN phase 4b, shape v2). NO ARMS: arm length is frozen for gameplay
 * (REACH-FREEZE, playFrame.ts). Two kinds, by what they move (lib/babylon/creator/shape/renderShape.ts does the moving):
 *
 *   REACH-SAFE (head, neck, hands, feet) — wide ranges, the same in every mode, ranked included. None of them moves a
 *     shoulder, an elbow or a hand-bone origin: the head is the Head bone's own scale (a leaf: nothing below it to
 *     compound into), the neck moves only the Head joint, and hands and feet are a MESH scale about the wrist / the sole
 *     under the ankle (a morph, so the hand and foot BONES — which carry the ball, a staff, a bat — are never scaled).
 *   FRAME KEYS (legs, torso, shoulders) — these DO move where the hands sit, so they live inside the play clamp
 *     (playFrame.COSMETIC_CLAMP: legs and torso the height range, shoulders the build range) and are exactly 1.0 in a
 *     ranked session and every STANDARD_FRAME_MODES mode (shape.effectiveShape).
 *
 * TUNED (2026-10-06, phase 4b): head 0.9–1.12 → 0.8–1.6, neck 0.85–1.2 → 0.8–1.5, hands and feet 0.9–1.15 → 0.8–1.5 (the
 * make-anyone research's wide ranges: a big-headed mascot, huge gloves); legs and torso 0.9–1.1 → 0.96–1.04 and shoulders
 * 0.9–1.12 → 0.94–1.08 (the play clamp itself, so what the editor shows is what a casual mode plays). shape.test.ts pins
 * the frame keys to COSMETIC_CLAMP, so the two cannot drift apart.
 */
export const PROPORTION_RANGES = {
  legs: [0.96, 1.04], torso: [0.96, 1.04], shoulders: [0.94, 1.08], neck: [0.8, 1.5], head: [0.8, 1.6],
  hands: [0.8, 1.5], feet: [0.8, 1.5],
} as const satisfies Record<string, readonly [number, number]>;
export type ProportionKey = keyof typeof PROPORTION_RANGES;
export const PROPORTION_KEYS = Object.keys(PROPORTION_RANGES) as ProportionKey[];
/** The proportions that move where the hands sit: inside the play clamp, 1.0 in ranked / standard-frame modes. */
export const FRAME_KEYS = ['legs', 'torso', 'shoulders'] as const satisfies readonly ProportionKey[];
/** The proportions that never move a shoulder or a hand-bone origin: the same in every mode. */
export const REACH_SAFE_KEYS = ['head', 'neck', 'hands', 'feet'] as const satisfies readonly ProportionKey[];

/**
 * BULK (phase 4b): per-segment girth, as a multiplier on the segment's own radius (1 = as modelled). Rendered as a
 * procedural inflate generated at load — every vertex moves along its normal by its skin weight on the segment's bones ×
 * (girth − 1) × the segment's measured radius — on the body AND every worn garment, so clothes follow. No bone moves, so
 * no hitbox and no reach: the same in every mode, ranked included.
 * TUNED (2026-10-06, phase 4b): 0.7–1.6 (thin limbs to heavy muscle; by eye in the Studio).
 */
export const GIRTH_KEYS = ['head', 'neck', 'chest', 'belly', 'upperArms', 'forearms', 'thighs', 'calves'] as const;
export type GirthKey = typeof GIRTH_KEYS[number];
export const GIRTH_RANGE = [0.7, 1.6] as const;

/**
 * PRESENTATION SCALE (phase 4b; owner decision 2026-10-06: "giant and tiny builds: Studio and photo only"). A whole-body
 * size beyond the play clamp, for the giant warlord or the tiny mascot. It is a SLOT field (CreatorSlotV2.presentation),
 * never part of the doc, so identityFrom — which every mode spawns through — never sees it; only a Studio or photo scene
 * reads it, from its own scene metadata (lib/babylon/creator/shape/presentation.ts). Every mode keeps the play clamp.
 */
export const PRESENTATION_RANGE = [0.6, 1.35] as const;
export interface SlotPresentation { scale: number }

/** Numeric ranges the sanitiser clamps to. Part positions are metres from the bone's joint along the bone's own REST
 *  frame (lib/creator/look/parts.ts says which way each axis runs; phase 2 measures it off the rig, rigFrames.ts). */
export const RANGES = {
  partPos: [-0.6, 0.6],
  partRot: [-180, 180],      // degrees
  partScale: [0.05, 8],      // multiplier on the shape's base size (phase 2 sets base sizes near 10 cm)
  paintXY: [0, 1],           // position inside the region, 0..1
  paintRot: [-180, 180],
  paintScale: [0.02, 4],
  paintStretch: [0.2, 5],    // width / height
  opacity: [0, 1],
  paintWeight: [0.05, 0.95], // a pattern's line / stripe / dot weight, a stamp's outline width (phase 3)
  toneAt: [0, 1],            // phase 4c: where a two-tone split / band sits along the shape's axis (0 one end, 1 the other)
  toneWidth: [0.02, 1],      // phase 4c: a band's width, as a fraction of the shape's length on that axis
  swing: [0, 1],             // phase 4c: how freely a bendable part swings (0 rigid, 1 hangs and sways fully)
} as const;

export type Vec3 = [number, number, number];

export interface CreatorPart {
  /** Short id, unique in the doc ([a-z0-9], 1–8). The editor's handle for selection and undo. */
  id: string;
  shape: PartShape;
  bone: PartBone;
  /** metres from the joint, in the bone's rest frame (x side, y along the bone, z front; parts.ts) */
  pos: Vec3;
  /** degrees in that frame, Babylon's x/y/z order */
  rot: Vec3;
  /** Non-uniform scale is the "squash". */
  scale: Vec3;
  colour: string;
  finish: Finish;
  /** Also place the mirror image on the opposite side's bone (a centre bone: reflected across the body). Costs 2 of the 64. */
  mirror: boolean;
  /** Phase 4c, all optional and stored only when not the default (so a phase 1–4b doc and code are unchanged):
   *  `colour2` turns the part two-tone — the second colour on one side of a split (`tone` 'split', the default) or in a
   *  band (`tone` 'band'), along `toneAxis` ('y' when absent) at `toneAt` (0..1 along the shape, 0.5 when absent), a band
   *  `toneWidth` wide (0.2 when absent). `swing` (0..1, SWING_SHAPES only) makes it bend and sway with the body. `follow`
   *  pushes it out with the bulk of the segment it sits on (shape v2), so a chest plate is not buried by a big chest. */
  colour2?: string;
  tone?: PartTone;
  toneAxis?: ToneAxis;
  toneAt?: number;
  toneWidth?: number;
  swing?: number;
  follow?: true;
}

/** Where a layer sits (phase 3, lib/babylon/creator/paint/bodyChart.ts). The body is unrolled into a chart in METRES,
 *  seen from outside: `x` runs across the region left to right as you look at it (0..1, 0.5 = its middle, the body's
 *  midline on a centre region), `y` runs up it (0 = its bottom). `rot` is degrees, `scale` multiplies the base size (a
 *  stamp 12 cm across, text 6 cm tall, a pattern's period 6 cm), `stretch` is width / height. On a pattern, x and y
 *  shift it (or set a radial pattern's centre). */
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
  /** Phase 3, all optional and stored only when not the default (so phase 1–2 docs and codes are unchanged):
   *  `blend` 'normal' when absent; `hidden` true keeps the layer in the stack but draws nothing; `weight` (0.05–0.95,
   *  0.5 when absent) is a pattern's line/stripe/dot weight or a stamp's / text's outline width. */
  blend?: PaintBlend;
  hidden?: boolean;
  weight?: number;
}

export interface CreatorShape {
  face: Partial<Record<ShapeFaceKey, number>>;
  body: Partial<Record<ProportionKey, number>>;
  /** Phase 4b: bulk per segment (GIRTH_KEYS). Optional and stored only when something is set (a phase 1–4a doc is
   *  unchanged). */
  girth?: Partial<Record<GirthKey, number>>;
}

/** What `flags.hide` can take off the body (phase 4a, tool #4). Visual only: the eyeballs and hair are hidden meshes, the
 *  ears and head are cut out of the skin through the paint texture's alpha (alpha test). Never a pick, a collider or a
 *  hitbox — the body mesh is the same mesh. `head` takes the ears, eyes and hair with it (a mascot head or a helmet). */
export const HIDE_KEYS = ['eyes', 'ears', 'head', 'hair'] as const;
export type HideKey = typeof HIDE_KEYS[number];

export interface CreatorFlags {
  /** Suit mode: hide the garments and paint the whole body (phase 3). */
  suit: boolean;
  /** Phase 4a: what to take off the body. Optional and stored only when something is hidden (a phase 1–3 doc is
   *  unchanged). */
  hide?: Partial<Record<HideKey, true>>;
}

/** Procedural eyes (phase 4a, tool #3): the kit's eyeballs get a code-drawn texture (lib/babylon/creator/eyes). The
 *  iris colour is the base's `eyeColor` (FaceConfig), so there is one source for it; this block is the rest. */
export const PUPIL_SHAPES = ['round', 'slit', 'none'] as const;
export type PupilShape = typeof PUPIL_SHAPES[number];
export const EYE_RANGES = {
  /** iris radius, as a multiple of the natural iris (1) */
  size: [0.5, 1.6],
  /** pupil radius, as a fraction of the iris */
  pupilSize: [0.1, 0.8],
  /** how strongly the iris glows (emissive), 0 = not at all */
  glow: [0, 1],
} as const;
export const EYE_DEFAULTS = { sclera: '#F2EEE8', size: 1, pupil: 'round' as PupilShape, pupilSize: 0.33, glow: 0 };
export interface CreatorEyes {
  sclera?: string;
  size?: number;
  pupil?: PupilShape;
  pupilSize?: number;
  glow?: number;
}

export interface CreatorDoc {
  v: typeof CREATOR_DOC_VERSION;
  parts: CreatorPart[];
  paint: PaintLayer[];
  colours: Partial<Record<ColourSlot, string>>;
  shape: CreatorShape;
  flags: CreatorFlags;
  /** Phase 4a: optional, stored only when something differs from EYE_DEFAULTS. */
  eyes?: CreatorEyes;
}

/** One saved character, v1 (phase 1): `label` through the jersey name rule, `doc` a full CreatorDoc. Still accepted by
 *  the sanitiser, which upgrades it to a CreatorSlotV2 (the missing fields default from the top-level face). */
export interface CreatorSlot { label: string; doc: CreatorDoc }

/** The body a slot plays in. `'scan'` is honoured only when the server says this account owns a scan
 *  (/api/v1/hero-body → heroBody.decideHeroBody); anywhere else it is the kit body (a share code exports it as `male`). */
export const SLOT_BODIES = ['male', 'female', 'scan'] as const;
export type SlotBody = typeof SLOT_BODIES[number];

/** A slot's height and build, as multipliers inside playFrame.COSMETIC_CLAMP (ranked and standard-frame modes still
 *  spawn 1.0). Body-shape NUMBERS: stored only with the adult's numbers opt-in, like the sliders. */
export interface SlotFrame { heightScale: number; buildScale: number }

/** The categorical face a slot wears: FaceConfig without the sliders (sanitize.sanitizeLookBase: hexes and catalog
 *  names only). Skin, hair and eye colours are any hex (tool #5). */
export interface SlotBase {
  skinTone?: string; faceShape?: string; hairStyle?: string; hairColor?: string;
  eyeShape?: string; eyeColor?: string; brows?: string; mouth?: string; nose?: string;
}

/**
 * Phase 4a (owner, 2026-10-06: "1 slot that looks like me, then switch to another character I made"; "5 max slots"):
 * a slot is a WHOLE character — body, face, numbers, worn items and the Creator doc — and `face.activeSlot` names the
 * one every mode spawns. Stored in `AvatarLook.face.creatorSlots` (no schema change).
 */
export interface CreatorSlotV2 {
  /** stable id ([a-z0-9], 1–8): `face.activeSlot` points at it */
  id: string;
  /** the jersey name rule (A–Z, 0–9, space, hyphen; 12 characters) */
  label: string;
  body: SlotBody;
  base: SlotBase;
  /** face morph weights (the face scan writes these): numbers, so the numbers opt-in only */
  sliders?: Partial<Record<ShapeFaceKey, number>>;
  frame?: SlotFrame;
  /** Phase 4b: the Studio / photo size (PRESENTATION_RANGE). Read ONLY by a Studio or photo scene; never by identityFrom
   *  or any mode. A number, so stored only with the numbers opt-in, like the frame. */
  presentation?: SlotPresentation;
  /** worn items per wearable slot; ownership-filtered on save (lib/closet/ownership.filterEquipped) */
  equipped?: Partial<Record<'headwear' | 'tops' | 'shorts' | 'shoes' | 'accessory', string | null>>;
  doc: CreatorDoc;
}

export function emptyCreatorDoc(): CreatorDoc {
  return { v: CREATOR_DOC_VERSION, parts: [], paint: [], colours: {}, shape: { face: {}, body: {} }, flags: { suit: false } };
}

/** True when the doc changes nothing (so a save can omit it). */
export function isEmptyCreatorDoc(d: CreatorDoc): boolean {
  return !d.parts.length && !d.paint.length && !Object.keys(d.colours).length
    && !Object.keys(d.shape.face).length && !Object.keys(d.shape.body).length && !Object.keys(d.shape.girth ?? {}).length
    && !d.flags.suit
    && !Object.keys(d.flags.hide ?? {}).length && !Object.keys(d.eyes ?? {}).length;
}

/** What the doc hides, resolved: `head` takes the ears, the eyes and the hair with it. */
export function hiddenParts(d: CreatorDoc | null | undefined): Record<HideKey, boolean> {
  const h = d?.flags.hide ?? {};
  const head = h.head === true;
  return { head, ears: head || h.ears === true, eyes: head || h.eyes === true, hair: head || h.hair === true };
}

/** The bone on the other side ('LeftArm' ↔ 'RightArm'); a centre bone mirrors onto itself. For phase 2's mirror. */
export function mirrorBone(b: PartBone): PartBone {
  if (b.startsWith('Left')) return `Right${b.slice(4)}` as PartBone;
  if (b.startsWith('Right')) return `Left${b.slice(5)}` as PartBone;
  return b;
}
