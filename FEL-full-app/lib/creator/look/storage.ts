// Where the CreatorDoc lives: inside AvatarLook.face (IMPROVE (2026-10-06), CREATOR-PLAN phase 1). No new column, no
// migration: `face` is Json, the Closet already writes it and every mode already reads it.
//
//   face.creator       the active look's CreatorDoc
//   face.creatorSlots  up to MAX_SLOTS saved characters ({ label, doc })
//
// THE TWO SAVE ROUTES BOTH WRITE `face` WHOLE, so this decides what the creator fields become on a save:
//   - not a verified adult (hold.uploadFace false): nothing. The look stays on the device (LOOK PRIVACY), and writing
//     the catalog face over the row clears any doc a previous save stored, exactly as it clears the presets.
//   - the request names the field: it is sanitised (null or an invalid doc clears it).
//   - the request leaves it out (the Athlete Creator's Finalize knows nothing about docs): the stored one is kept, so
//     saving in one editor never wipes what the other built.
//   - shape values are body-shape NUMBERS: without the adult's numbers opt-in (hold.uploadNumbers) they are stripped,
//     the same rule holdFace applies to the face sliders.
// Pure. The routes call it after holdFace.

import type { LookHold } from '../lookPrivacy';
import type { FaceConfig } from '../../closet/wearable-catalog';
import { isEmptyCreatorDoc, type CreatorDoc, type CreatorSlot } from './doc';
import { sanitizeCreatorDoc, sanitizeCreatorSlots } from './sanitize';

export interface CreatorFaceFields { creator?: CreatorDoc; creatorSlots?: CreatorSlot[] }
/** AvatarLook.face as stored: the Closet's FaceConfig plus the creator fields. */
export type StoredFace = FaceConfig & CreatorFaceFields;

const has = (o: unknown, k: string): boolean => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const field = (o: unknown, k: string): unknown => (has(o, k) ? (o as Record<string, unknown>)[k] : undefined);

function withoutShape(d: CreatorDoc): CreatorDoc {
  return { ...d, shape: { face: {}, body: {} } };
}

/**
 * The creator fields a save may write. `posted` is the request's `face` (raw), `previous` the row's stored `face`
 * (raw; null when there is none or it was not read). Returns only the keys to write — spread it onto the held face.
 */
export function holdCreator(posted: unknown, previous: unknown, hold: Pick<LookHold, 'uploadFace' | 'uploadNumbers'>): CreatorFaceFields {
  if (!hold.uploadFace) return {};
  const src = (k: string) => (has(posted, k) ? field(posted, k) : field(previous, k));
  const out: CreatorFaceFields = {};
  let doc = sanitizeCreatorDoc(src('creator'));
  if (doc && !hold.uploadNumbers) doc = withoutShape(doc);
  if (doc && !isEmptyCreatorDoc(doc)) out.creator = doc;
  let slots = sanitizeCreatorSlots(src('creatorSlots'));
  if (!hold.uploadNumbers) slots = slots.map((s) => ({ ...s, doc: withoutShape(s.doc) }));
  if (slots.length) out.creatorSlots = slots;
  return out;
}

/** True when the save needs the stored face to decide (the request left a creator field out). */
export function needsPreviousFace(posted: unknown): boolean {
  return !has(posted, 'creator') || !has(posted, 'creatorSlots');
}

/** The active doc from a stored or posted face, sanitised; null when there is none. Client and server. */
export function readCreatorDoc(face: unknown): CreatorDoc | null {
  return sanitizeCreatorDoc(field(face, 'creator'));
}

/** The FaceConfig without the creator fields (what the face pipes expect). */
export function faceOnly<T extends object>(face: T): Omit<T, 'creator' | 'creatorSlots'> {
  const { creator: _c, creatorSlots: _s, ...rest } = face as T & CreatorFaceFields;
  void _c; void _s;
  return rest;
}
