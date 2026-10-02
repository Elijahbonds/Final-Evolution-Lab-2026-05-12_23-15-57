// LOOK PRIVACY (owner, 2026-09-29, applied to the creator 2026-10-01).
//
// Under 18 — and anyone whose age is not a verified 18+ — the look stays on the device. Nothing of it
// uploads: not the face, the sliders, the height or build, the equipped items, the jersey plate, or the
// animation choices. The save writes the catalog defaults so a previous row cannot keep them. Owned-gear
// inventory is purchase data and is not part of this hold.
//
// A verified adult may opt in to saving face-slider and body-shape NUMBERS. That opt-in is off until they
// check it. Images are never stored: a payload that carries a picture, a data URL, or a remote image link
// is refused before any write. Model training is a second opt-in, also off by default, and it can only be
// on when the numbers themselves are being saved. Nothing in the app reads the flag to train a model.
//
// Pure. The routes call these and do not decide the policy themselves.

import {
  defaultEquipped, defaultFace, defaultJersey, sanitizeFaceSliders, sanitizeJersey,
  type FaceConfig, type JerseyConfig,
} from '../closet/wearable-catalog';
import { VITAL_DEFAULT } from './schema/vitals';

export interface LookHold {
  /** Verified 18+. Everyone else is local-only for the look. */
  adult: boolean;
  /** Write the categorical face (hair, swatches, presets). False for anyone who is not a verified adult. */
  uploadFace: boolean;
  /**
   * Write equipped items, the jersey plate, and animation choices.
   * False for anyone who is not a verified adult — those stay on the device.
   */
  uploadLook: boolean;
  /** Write morph weights and height/build percents. Adults only, and only after they opt in. */
  uploadNumbers: boolean;
  /** Second opt-in. Off unless an adult asked AND numbers are being saved. Never turns training on by itself. */
  modelTraining: boolean;
}

/** Gear and accessory rows that name what is worn. Palette rows are colours, not items, and are stripped with them. */
const EQUIPPED_ROW_IDS = ['headwear', 'tops', 'shorts', 'shoes', 'accessory', 'paletteJersey', 'paletteShorts', 'paletteShoes', 'paletteAccent'] as const;
const VITAL_LOOK_IDS = ['jerseyNumber', 'heightScale', 'buildScale'] as const;

const FACE_KEYS = ['skinTone', 'faceShape', 'hairStyle', 'hairColor', 'eyeShape', 'eyeColor', 'brows', 'mouth', 'nose'] as const;

/** A string that is a picture or a pointer at one. Catalog values are short names and hex swatches. */
const IMAGE_TEXT = /data:|image\/(png|jpe?g|webp|gif)|base64,|^https?:\/\//i;
const IMAGE_KEY = /(image|photo|png|jpe?g|webp|bitmap|pixels|texture)/i;

/**
 * True when a payload carries a picture, a data URL, or a link. Walks plain JSON only.
 * Used to refuse the save before anything is written.
 */
export function payloadHasImage(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false;
  if (typeof value === 'string') return IMAGE_TEXT.test(value);
  if (typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (IMAGE_KEY.test(k) && v != null && typeof v !== 'number' && typeof v !== 'boolean') return true;
    if (payloadHasImage(v, depth + 1)) return true;
  }
  return false;
}

/**
 * What this save is allowed to persist.
 *
 * `saveNumbers` and `training` are the client's checkboxes. They do nothing unless `adult` is already
 * true, and training does nothing unless the numbers opt-in is also true. Both default off.
 */
export function decideLookHold(adult: boolean, saveNumbers: boolean, training: boolean): LookHold {
  if (!adult) return { adult: false, uploadFace: false, uploadLook: false, uploadNumbers: false, modelTraining: false };
  const uploadNumbers = saveNumbers === true;
  return {
    adult: true,
    uploadFace: true,
    uploadLook: true,
    uploadNumbers,
    modelTraining: uploadNumbers && training === true,
  };
}

/** The face that may be written. Non-adults get the catalog default — their look never lands in the row. */
export function holdFace(face: FaceConfig, hold: LookHold): FaceConfig {
  if (!hold.uploadFace) return defaultFace();
  const src = face as unknown as Record<string, unknown>;
  const next = defaultFace();
  for (const k of FACE_KEYS) {
    const v = src[k];
    if (typeof v === 'string' && v && !IMAGE_TEXT.test(v)) (next as unknown as Record<string, string>)[k] = v;
  }
  if (hold.uploadNumbers) {
    const sliders = sanitizeFaceSliders(face.sliders);
    if (sliders) next.sliders = sliders;
  }
  return next;
}

/**
 * Height and build are the body-shape numbers. Without the numbers opt-in they are written as the
 * standard frame (100), not omitted — omitting would leave a previous save's numbers in place.
 * Every other frame field (body type, stance, archetype) is a catalog choice and passes through.
 */
export function holdFrame<T extends Record<string, unknown>>(frame: T, hold: LookHold): T {
  if (hold.uploadNumbers) return frame;
  return { ...frame, heightScale: VITAL_DEFAULT, buildScale: VITAL_DEFAULT };
}

/** Equipped items. A minor's row is the catalog default, never the set they picked. */
export function holdEquipped(
  equipped: Record<string, string | null>,
  hold: LookHold,
): Record<string, string | null> {
  if (!hold.uploadLook) return defaultEquipped();
  return equipped;
}

/** Jersey plate. A minor's row is a blank plate, never their name or number. */
export function holdJersey(jersey: JerseyConfig, hold: LookHold): JerseyConfig {
  if (!hold.uploadLook) return defaultJersey();
  return sanitizeJersey(jersey);
}

/** Animation package labels. A minor's build stores none. */
export function holdAnimations(
  animations: Record<string, string | null>,
  hold: LookHold,
): Record<string, string | null> {
  if (!hold.uploadLook) return {};
  return animations;
}

type SectionMap = Record<string, Record<string, unknown> | undefined>;

function omitKeys(row: Record<string, unknown> | undefined, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!row) return undefined;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!keys.includes(k)) next[k] = v;
  return Object.keys(next).length ? next : undefined;
}

/**
 * The JSON a minor's Finalize is allowed to send.
 *
 * Face, sliders, height, build, equipped items, palette, jersey plate, and animation choices are left
 * out. Attributes and the rest of the build stay. An adult's body is unchanged apart from the consent flags.
 */
export function athleteSaveRequest(input: {
  adult: boolean;
  values: SectionMap;
  plate: string;
  saveLookNumbers?: boolean;
  modelTraining?: boolean;
}): { values: Record<string, Record<string, unknown>>; plate: string; saveLookNumbers: boolean; modelTraining: boolean } {
  const saveLookNumbers = input.adult && input.saveLookNumbers === true;
  const modelTraining = saveLookNumbers && input.modelTraining === true;
  if (input.adult) {
    const values: Record<string, Record<string, unknown>> = {};
    for (const [section, rows] of Object.entries(input.values)) if (rows) values[section] = { ...rows };
    return { values, plate: input.plate, saveLookNumbers, modelTraining };
  }
  const values: Record<string, Record<string, unknown>> = {};
  for (const [section, rows] of Object.entries(input.values)) {
    if (!rows) continue;
    if (section === 'appearance' || section === 'animations' || section === 'accessories') continue;
    if (section === 'vitals') {
      const kept = omitKeys(rows, VITAL_LOOK_IDS);
      if (kept) values.vitals = kept;
      continue;
    }
    if (section === 'gear') {
      const kept = omitKeys(rows, EQUIPPED_ROW_IDS);
      if (kept) values.gear = kept;
      continue;
    }
    values[section] = { ...rows };
  }
  return { values, plate: '', saveLookNumbers: false, modelTraining: false };
}

/**
 * The JSON a minor's Closet save is allowed to send. No face, no equipped map, no plate, no card skin.
 * Buying gear is a different route; this one does not touch inventory.
 */
export function closetSaveRequest(input: {
  adult: boolean;
  face?: FaceConfig;
  equipped?: Record<string, string | null>;
  jersey?: JerseyConfig;
  skinCardId?: string | null;
  saveLookNumbers?: boolean;
  modelTraining?: boolean;
}): Record<string, unknown> {
  if (!input.adult) return { saveLookNumbers: false, modelTraining: false };
  const saveLookNumbers = input.saveLookNumbers === true;
  return {
    face: input.face,
    equipped: input.equipped,
    jersey: input.jersey,
    skinCardId: input.skinCardId ?? null,
    saveLookNumbers,
    modelTraining: saveLookNumbers && input.modelTraining === true,
  };
}

/** What the build JSON records about consent. Training is stored only as this boolean. Nothing trains on it. */
export function privacyRecord(hold: LookHold): { saveLookNumbers: boolean; modelTraining: boolean } {
  return { saveLookNumbers: hold.uploadNumbers, modelTraining: hold.modelTraining };
}
