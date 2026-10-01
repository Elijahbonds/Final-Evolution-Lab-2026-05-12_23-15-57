// LOOK PRIVACY (owner, 2026-09-29, applied to the creator 2026-10-01).
//
// Under 18 — and anyone whose age is not a verified 18+ — the look stays on the device. The save writes
// the catalog default face and the standard frame, never the face they built and never their height or build.
//
// A verified adult may opt in to saving face-slider and body-shape NUMBERS. That opt-in is off until they
// check it. Images are never stored: a payload that carries a picture, a data URL, or a remote image link
// is refused before any write. Model training is a second opt-in, also off by default, and it can only be
// on when the numbers themselves are being saved. Nothing in the app reads the flag to train a model.
//
// Pure. The routes call these and do not decide the policy themselves.

import { defaultFace, sanitizeFaceSliders, type FaceConfig } from '../closet/wearable-catalog';
import { VITAL_DEFAULT } from './schema/vitals';

export interface LookHold {
  /** Verified 18+. Everyone else is local-only for the look. */
  adult: boolean;
  /** Write the categorical face (hair, swatches, presets). False for anyone who is not a verified adult. */
  uploadFace: boolean;
  /** Write morph weights and height/build percents. Adults only, and only after they opt in. */
  uploadNumbers: boolean;
  /** Second opt-in. Off unless an adult asked AND numbers are being saved. Never turns training on by itself. */
  modelTraining: boolean;
}

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
  if (!adult) return { adult: false, uploadFace: false, uploadNumbers: false, modelTraining: false };
  const uploadNumbers = saveNumbers === true;
  return {
    adult: true,
    uploadFace: true,
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

/** What the build JSON records about consent. Training is stored only as this boolean. Nothing trains on it. */
export function privacyRecord(hold: LookHold): { saveLookNumbers: boolean; modelTraining: boolean } {
  return { saveLookNumbers: hold.uploadNumbers, modelTraining: hold.modelTraining };
}
