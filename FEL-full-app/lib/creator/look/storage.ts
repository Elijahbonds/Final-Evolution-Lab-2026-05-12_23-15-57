// Where the CreatorDoc lives: inside AvatarLook.face (IMPROVE (2026-10-06), CREATOR-PLAN phase 1). No new column, no
// migration: `face` is Json, the Closet already writes it and every mode already reads it.
//
//   face.creator       the active look's CreatorDoc
//   face.creatorSlots  up to MAX_SLOTS saved characters (phase 4a: whole characters, doc.ts CreatorSlotV2; slots.ts)
//   face.activeSlot    phase 4a: the slot every mode wears; the face's top level is that slot, materialised
//
// THE TWO SAVE ROUTES BOTH WRITE `face` WHOLE, so this decides what the creator fields become on a save:
//   - not a verified adult (hold.uploadFace false): nothing. The look stays on the device (LOOK PRIVACY), and writing
//     the catalog face over the row clears any doc a previous save stored, exactly as it clears the presets.
//   - the request names the field: it is sanitised (null or an invalid doc clears it).
//   - the request leaves it out (the Athlete Creator's Finalize knows nothing about docs): the stored one is kept, so
//     saving in one editor never wipes what the other built.
//   - shape values are body-shape NUMBERS: without the adult's numbers opt-in (hold.uploadNumbers) they are stripped,
//     the same rule holdFace applies to the face sliders. Phase 4a: every slot's sliders, frame and doc.shape too;
//     phase 4b: doc.shape.girth (it is inside doc.shape) and the slot's presentation (Studio) size.
//   - phase 4a: every slot's worn items go through the shop's ownership filter (ctx.owned); with no inventory to check
//     against they are dropped, never trusted. A slot cannot wear what the account does not own.
//   - phase 4a: `activeSlot` must name a slot; the active slot is MATERIALISED onto the face's top level (its base, its
//     sliders when numbers may be stored, its doc as `creator`), so the top level always is the character being played.
//   - phase 4a: when the request leaves the slots out (the Athlete Creator's Finalize) but edits the face, the edit lands
//     on the ACTIVE slot (ctx.fold), so saving in one editor still never wipes what the other built.
//   - phase 4a: the creator fields together are capped at MAX_FACE_CHARS; trailing slots (never the active one) go first.
// Pure. The routes call it after holdFace.

import type { LookHold } from '../lookPrivacy';
import type { FaceConfig } from '../../closet/wearable-catalog';
import { filterEquipped } from '../../closet/ownership';
import { MAX_FACE_CHARS, isEmptyCreatorDoc, type CreatorDoc, type CreatorSlotV2 } from './doc';
import { sanitizeCreatorDoc, sanitizeCreatorSlots, sanitizeLookBase, sanitizeSlotEquipped } from './sanitize';
import { materialisedFields } from './slots';
import { sanitizeFaceSliders } from '../../closet/wearable-catalog';

export interface CreatorFaceFields { creator?: CreatorDoc; creatorSlots?: CreatorSlotV2[]; activeSlot?: string }

/** What holdCreator may also need from the route (phase 4a). */
export interface HoldContext {
  /** the account's inventory as the server reads it: every slot's `equipped` is filtered through it (absent: dropped) */
  owned?: ReadonlySet<string>;
  /** the Athlete Creator's Finalize: the face (already held) and worn items it is writing, folded into the active slot */
  fold?: { face: FaceConfig; equipped?: Record<string, string | null> };
  /** tests: the cap */
  maxChars?: number;
}
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
export function holdCreator(
  posted: unknown, previous: unknown, hold: Pick<LookHold, 'uploadFace' | 'uploadNumbers'>, ctx: HoldContext = {},
): CreatorFaceFields & Partial<FaceConfig> {
  if (!hold.uploadFace) return {};
  const slotsPosted = has(posted, 'creatorSlots');
  const src = (k: string) => (has(posted, k) ? field(posted, k) : field(previous, k));
  // a v1 slot takes its missing fields from the top-level face it was stored beside
  const slotSrcFace = slotsPosted ? posted : previous;
  const out: CreatorFaceFields & Partial<FaceConfig> = {};
  let doc = sanitizeCreatorDoc(src('creator'));
  if (doc && !hold.uploadNumbers) doc = withoutShape(doc);
  if (doc && !isEmptyCreatorDoc(doc)) out.creator = doc;
  let slots = sanitizeCreatorSlots(src('creatorSlots'), { face: slotSrcFace });
  // the pointer: posted with the slots it points into, else the stored one
  const rawActive = slotsPosted ? field(posted, 'activeSlot') : (has(posted, 'activeSlot') ? field(posted, 'activeSlot') : field(previous, 'activeSlot'));
  const active = typeof rawActive === 'string' && slots.some((s) => s.id === rawActive) ? rawActive : null;
  // the Athlete Creator's Finalize edits the character being played
  if (!slotsPosted && active && ctx.fold) {
    slots = slots.map((s) => {
      if (s.id !== active) return s;
      const next: CreatorSlotV2 = { ...s, base: sanitizeLookBase(ctx.fold!.face) };
      const sl = sanitizeFaceSliders(ctx.fold!.face.sliders);
      if (sl) next.sliders = sl; else delete next.sliders;
      const eq = sanitizeSlotEquipped(ctx.fold!.equipped);
      if (eq) next.equipped = eq;
      return next;
    });
  }
  slots = slots.map((s) => {
    const next: CreatorSlotV2 = { ...s };
    if (!hold.uploadNumbers) { next.doc = withoutShape(s.doc); delete next.sliders; delete next.frame; delete next.presentation; }
    if (s.equipped) {
      if (ctx.owned) next.equipped = filterEquipped(s.equipped, ctx.owned) as CreatorSlotV2['equipped'];
      else delete next.equipped;
    }
    return next;
  });
  if (slots.length) out.creatorSlots = slots;
  if (active) {
    out.activeSlot = active;
    // the top level IS the active character
    delete out.creator;
    const a = slots.find((s) => s.id === active)!;
    Object.assign(out, materialisedFields(a, hold.uploadNumbers));
    if (!out.sliders) out.sliders = undefined;   // the posted top-level sliders are not this character's (JSON drops the key)
  }
  // the whole creator part is capped: trailing slots go first, never the active one
  const cap = ctx.maxChars ?? MAX_FACE_CHARS;
  while (out.creatorSlots && JSON.stringify(out).length > cap) {
    const i = [...out.creatorSlots].reverse().findIndex((s) => s.id !== active);
    if (i < 0) break;
    out.creatorSlots = out.creatorSlots.filter((_, k) => k !== out.creatorSlots!.length - 1 - i);
    if (!out.creatorSlots.length) delete out.creatorSlots;
  }
  return out;
}

/** The active slot's worn items as holdCreator kept them (ownership-filtered), for AvatarLook.equipped; null when no
 *  slot is active or it carries none. */
export function activeEquipped(fields: CreatorFaceFields): Record<string, string | null> | null {
  if (!fields.activeSlot) return null;
  const s = fields.creatorSlots?.find((x) => x.id === fields.activeSlot);
  return s?.equipped ? { ...s.equipped } : null;
}

/** True when the save needs the stored face to decide (the request left a creator field out). */
export function needsPreviousFace(posted: unknown): boolean {
  return !has(posted, 'creator') || !has(posted, 'creatorSlots') || !has(posted, 'activeSlot');
}

/** The active doc from a stored or posted face, sanitised; null when there is none. Client and server. */
export function readCreatorDoc(face: unknown): CreatorDoc | null {
  return sanitizeCreatorDoc(field(face, 'creator'));
}

/** The FaceConfig without the creator fields (what the face pipes expect). */
export function faceOnly<T extends object>(face: T): Omit<T, 'creator' | 'creatorSlots' | 'activeSlot'> {
  const { creator: _c, creatorSlots: _s, activeSlot: _a, ...rest } = face as T & CreatorFaceFields;
  void _c; void _s; void _a;
  return rest;
}
