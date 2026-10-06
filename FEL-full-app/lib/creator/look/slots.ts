// SLOTS: saved characters, and the one every mode spawns (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a).
//
// The owner: "I can have 1 slot that looks like me, then switch to another character I made … Any character you can
// think of we should be able to make." Then: "5 max slots." A slot (doc.ts CreatorSlotV2) is a WHOLE character — its
// body, its face, its numbers, its worn items and its Creator doc — and `face.activeSlot` points at the one played.
//
//   face.creatorSlots   up to MAX_SLOTS (5) slots
//   face.activeSlot     the id of the one every mode wears
//   face.<FaceConfig>   + face.creator: the active slot MATERIALISED (storage.holdCreator writes it on every save), so a
//                       reader that predates slots (an older client, the Athlete Creator's GET) still sees the character
//                       being played. A face with no slots (every look saved before phase 4a) is its own fallback.
//
// `activeLook(face)` is the one reader: resolveIdentity builds the player from it in every mode, the Closet edits from
// it. Everything here is pure (no fetch, no Babylon, no window): the client and the server run the same rules.
//
// WHAT A SLOT CANNOT DO. Pick a body the account does not have (`'scan'` is honoured only by /api/v1/hero-body for an
// account that owns a scan), wear an item the account does not own (the save route filters every slot's `equipped`
// through lib/closet/ownership), store numbers without the adult's opt-in (the save strips sliders, frame and
// doc.shape), or change a hitbox (it is cosmetic: frame clamps to playFrame.COSMETIC_CLAMP and ranked / standard-frame
// modes still spawn 1.0).

import {
  MAX_SLOTS, emptyCreatorDoc, isEmptyCreatorDoc,
  type CreatorDoc, type CreatorSlotV2, type SlotBody, type SlotFrame, type SlotBase,
} from './doc';
import { sanitizeCreatorDoc, sanitizeCreatorSlots, sanitizeLookBase, sanitizeStampText, type SlotFallback } from './sanitize';
import { defaultFace, sanitizeFaceSliders, type FaceConfig, type WearableSlot } from '../../closet/wearable-catalog';
import type { HeroBodyKind } from '../../babylon/core/heroBody';

/**
 * TEENS (owner decision 2026-10-06: "Every mode, device only"). An under-18 (or unknown-age) player's look never leaves
 * the device (LOOK PRIVACY): the server row holds the catalog defaults. Before this only racing dressed their hero in the
 * device copy (raceLook.ts); with this on, resolveIdentity overlays the device's active slot in EVERY mode. Still
 * client-only: the overlay reads localStorage and uploads nothing.
 */
export const TEEN_DEVICE_LOOK_EVERYWHERE = true;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const field = (o: unknown, k: string): unknown => (isObj(o) ? o[k] : undefined);

const FACE_STRING_KEYS = ['skinTone', 'faceShape', 'hairStyle', 'hairColor', 'eyeShape', 'eyeColor', 'brows', 'mouth', 'nose'] as const;

/** The FaceConfig half of a stored face (no creator fields). A face without slots reads as it always did (its strings as
 *  stored — the save route held them); a SLOT's base is the strict one (sanitizeLookBase). */
function topFace(face: unknown): FaceConfig {
  const out = { ...defaultFace() } as FaceConfig & Obj;
  if (!isObj(face)) return out;
  for (const k of FACE_STRING_KEYS) { const v = face[k]; if (typeof v === 'string' && v && v.length <= 32) out[k] = v; }
  const sliders = sanitizeFaceSliders(face.sliders);
  if (sliders) out.sliders = sliders;
  return out;
}

/** The face's slots, sanitised (v1 slots upgraded from the face's own top-level fields). */
export function readSlots(face: unknown, fallbackBody?: SlotBody): CreatorSlotV2[] {
  const fb: SlotFallback = { face: topFace(face), body: fallbackBody };
  return sanitizeCreatorSlots(field(face, 'creatorSlots'), fb);
}

/** The id `face.activeSlot` names, if it names a slot. */
export function activeSlotId(face: unknown, slots: readonly CreatorSlotV2[] = readSlots(face)): string | null {
  const id = field(face, 'activeSlot');
  return typeof id === 'string' && slots.some((s) => s.id === id) ? id : null;
}

/** What a player looks like: the active slot's character, or the top-level face for a face with no active slot. */
export interface ActiveLook {
  /** the active slot, or null (the legacy / no-slot look) */
  slot: CreatorSlotV2 | null;
  /** the categorical face plus the sliders (a full FaceConfig: what the face pipes take) */
  face: FaceConfig;
  doc: CreatorDoc | null;
  /** the slot's preferred body; null = the server's default (no slot) */
  body: SlotBody | null;
  frame: SlotFrame | null;
  equipped: Partial<Record<WearableSlot, string | null>> | null;
}

/** The face a slot wears: its base over the catalog defaults, plus its sliders. */
export function faceOfSlot(slot: Pick<CreatorSlotV2, 'base' | 'sliders'>): FaceConfig {
  const f: FaceConfig = { ...defaultFace(), ...(slot.base as Partial<FaceConfig>) };
  if (slot.sliders && Object.keys(slot.sliders).length) f.sliders = { ...slot.sliders };
  else delete f.sliders;
  return f;
}

/** THE READER. Pure: the same answer on the client (resolveIdentity, the Closet) and the server (hero-body). */
export function activeLook(face: unknown): ActiveLook {
  const slots = readSlots(face);
  const id = activeSlotId(face, slots);
  const slot = id ? slots.find((s) => s.id === id)! : null;
  if (slot) {
    return {
      slot, face: faceOfSlot(slot), doc: isEmptyCreatorDoc(slot.doc) ? null : slot.doc, body: slot.body,
      frame: slot.frame ?? null, equipped: slot.equipped ?? null,
    };
  }
  return { slot: null, face: topFace(face), doc: sanitizeCreatorDoc(field(face, 'creator')), body: null, frame: null, equipped: null };
}

/** The editor's working copy of a slot as a StoredFace-shaped object (FaceConfig + `creator`), which is what the
 *  Closet's editors already speak. */
export function slotFace(slot: CreatorSlotV2): FaceConfig & { creator: CreatorDoc } {
  return { ...faceOfSlot(slot), creator: slot.doc };
}

/** Put an edited StoredFace back into a slot (the inverse of slotFace): base, sliders and doc; nothing else moves. A doc
 *  that no longer sanitises (over the size cap) leaves the slot's doc as it was: an edit is refused, never a wipe. */
export function withFace(slot: CreatorSlotV2, face: FaceConfig & { creator?: CreatorDoc | null }): CreatorSlotV2 {
  const doc = face.creator == null ? emptyCreatorDoc() : sanitizeCreatorDoc(face.creator) ?? slot.doc;
  const next: CreatorSlotV2 = { ...slot, base: sanitizeLookBase(face), doc };
  const sliders = sanitizeFaceSliders(face.sliders);
  if (sliders) next.sliders = sliders; else delete next.sliders;
  return next;
}

/** A slot made from a face (the first slot a pre-slot look becomes, or "new" from the current look). */
export function slotFromFace(face: unknown, o: { id: string; label: string; body: SlotBody; equipped?: CreatorSlotV2['equipped']; frame?: SlotFrame | null }): CreatorSlotV2 {
  const f = topFace(face);
  const slot: CreatorSlotV2 = {
    id: o.id, label: sanitizeStampText(o.label), body: o.body, base: sanitizeLookBase(f),
    doc: sanitizeCreatorDoc(field(face, 'creator')) ?? emptyCreatorDoc(),
  };
  if (f.sliders) slot.sliders = f.sliders as CreatorSlotV2['sliders'];
  if (o.frame) slot.frame = { ...o.frame };
  if (o.equipped && Object.keys(o.equipped).length) slot.equipped = { ...o.equipped };
  return slot;
}

/** A blank character: the catalog face, no doc. */
export function blankSlot(o: { id: string; label: string; body: SlotBody }): CreatorSlotV2 {
  return { id: o.id, label: sanitizeStampText(o.label), body: o.body, base: sanitizeLookBase(defaultFace()), doc: emptyCreatorDoc() };
}

// ── the slot bar's operations (immutable; each returns a new array, or the same one when refused) ────────────────────

/** The first free id `s1`, `s2`, … */
export function newSlotId(slots: readonly Pick<CreatorSlotV2, 'id'>[]): string {
  for (let n = 1; ; n++) if (!slots.some((s) => s.id === `s${n}`)) return `s${n}`;
}

/** The first free default label `LOOK 1`, `LOOK 2`, … */
export function newSlotLabel(slots: readonly Pick<CreatorSlotV2, 'label'>[], stem = 'LOOK'): string {
  for (let n = 1; ; n++) if (!slots.some((s) => s.label === `${stem} ${n}`)) return `${stem} ${n}`;
}

export const canAddSlot = (slots: readonly unknown[]): boolean => slots.length < MAX_SLOTS;

/** Add a slot at the end (refused past MAX_SLOTS: the same array comes back). The id is made unique. */
export function addSlot(slots: readonly CreatorSlotV2[], slot: CreatorSlotV2): CreatorSlotV2[] {
  if (!canAddSlot(slots)) return slots as CreatorSlotV2[];
  const id = slots.some((s) => s.id === slot.id) ? newSlotId(slots) : slot.id;
  return [...slots, { ...slot, id }];
}

/** Copy a slot (deep: the copy shares nothing with the original), labelled as a copy, right after it. */
export function duplicateSlot(slots: readonly CreatorSlotV2[], id: string): CreatorSlotV2[] {
  const i = slots.findIndex((s) => s.id === id);
  if (i < 0 || !canAddSlot(slots)) return slots as CreatorSlotV2[];
  const copy: CreatorSlotV2 = JSON.parse(JSON.stringify(slots[i]));
  copy.id = newSlotId(slots);
  copy.label = sanitizeStampText(`${slots[i].label.slice(0, 7)} COPY`) || newSlotLabel(slots);
  return [...slots.slice(0, i + 1), copy, ...slots.slice(i + 1)];
}

/** Rename through the jersey name rule; an empty result keeps the old label. */
export function renameSlot(slots: readonly CreatorSlotV2[], id: string, label: string): CreatorSlotV2[] {
  const clean = sanitizeStampText(label);
  if (!clean) return slots as CreatorSlotV2[];
  return slots.map((s) => (s.id === id ? { ...s, label: clean } : s));
}

/** Replace one slot (by id) with an edited version. */
export function replaceSlot(slots: readonly CreatorSlotV2[], slot: CreatorSlotV2): CreatorSlotV2[] {
  return slots.map((s) => (s.id === slot.id ? slot : s));
}

/** Delete a slot. The last slot cannot be deleted (a player always has a character); the active pointer moves to the
 *  neighbour when the active one goes. */
export function removeSlot(slots: readonly CreatorSlotV2[], id: string, active: string | null): { slots: CreatorSlotV2[]; active: string | null } {
  const i = slots.findIndex((s) => s.id === id);
  if (i < 0 || slots.length <= 1) return { slots: slots as CreatorSlotV2[], active };
  const next = slots.filter((s) => s.id !== id);
  return { slots: next, active: active === id ? next[Math.min(i, next.length - 1)].id : active };
}

// ── what a face becomes on the server ────────────────────────────────────────────────────────────────────────────────

/** The active slot's FaceConfig fields and doc, to spread over a stored face so its top level IS the active character
 *  (storage.holdCreator). Sliders only when numbers may be stored. */
export function materialisedFields(slot: CreatorSlotV2, numbers: boolean): Partial<FaceConfig> & { creator?: CreatorDoc } {
  const out: Partial<FaceConfig> & { creator?: CreatorDoc } = { ...(slot.base as Partial<FaceConfig>) };
  if (numbers && slot.sliders) out.sliders = { ...slot.sliders };
  if (!isEmptyCreatorDoc(slot.doc)) out.creator = slot.doc;
  return out;
}

/** GET /api/v1/closet?for=spawn: the stored face trimmed to what a spawn needs — the active slot only (every mode used
 *  to download every slot to dress one body). A face without slots comes back as it is. */
export function spawnFace(face: unknown): Obj {
  if (!isObj(face)) return {};
  const slots = readSlots(face);
  const id = activeSlotId(face, slots);
  if (!id) { const { creatorSlots: _s, ...rest } = face; void _s; return rest; }
  return { ...face, creatorSlots: slots.filter((s) => s.id === id), activeSlot: id };
}

/** What the start screen's "Play as" switcher shows: id, label, body and three colour chips. Nothing else. */
export interface SlotSummary { id: string; label: string; body: SlotBody; chips: { skin: string; hair: string; accent: string } }
export function slotSummaries(face: unknown): SlotSummary[] {
  return readSlots(face).map((s) => summaryOf(s));
}
export function summaryOf(s: CreatorSlotV2): SlotSummary {
  const f = faceOfSlot(s);
  const firstPaint = s.doc.paint.find((l) => !l.hidden)?.colours[0];
  const firstPart = s.doc.parts[0]?.colour;
  return { id: s.id, label: s.label, body: s.body, chips: { skin: f.skinTone, hair: f.hairColor, accent: s.doc.colours.accent ?? firstPaint ?? firstPart ?? f.eyeColor } };
}

/** Point the face at another slot and materialise it (POST /api/v1/closet/active). Null when no such slot. Numbers
 *  already in the row were held when they were saved; `numbers` says whether the top-level sliders may carry them. */
export function switchActive(face: unknown, id: string, numbers: boolean): { face: Obj; equipped: CreatorSlotV2['equipped'] | null } | null {
  if (!isObj(face)) return null;
  const slots = readSlots(face);
  const slot = slots.find((s) => s.id === id);
  if (!slot) return null;
  const { sliders: _old, creator: _c, ...rest } = face;
  void _old; void _c;
  return { face: { ...rest, ...materialisedFields(slot, numbers), creatorSlots: slots, activeSlot: id }, equipped: slot.equipped ?? null };
}

/**
 * The device copy's NUMBERS over the server's face, for an adult who has not opted in to saving them (the server stripped
 * them; the Closet must still show what they built). Per slot by id: the sliders, the height / build and doc.shape; and
 * the top level's sliders and doc.shape. Everything else is the server's. Pure.
 */
export function mergeDeviceNumbers(server: unknown, device: unknown): Obj {
  const out: Obj = isObj(server) ? { ...server } : {};
  if (!isObj(device)) return out;
  const dSliders = sanitizeFaceSliders(device.sliders);
  if (dSliders) out.sliders = dSliders;
  const sDoc = sanitizeCreatorDoc(out.creator), dDoc = sanitizeCreatorDoc(device.creator);
  if (sDoc && dDoc) out.creator = { ...sDoc, shape: dDoc.shape };
  const dSlots = readSlots(device);
  if (Array.isArray(out.creatorSlots) && dSlots.length) {
    out.creatorSlots = readSlots(out).map((s) => {
      const d = dSlots.find((x) => x.id === s.id);
      if (!d) return s;
      const next: CreatorSlotV2 = { ...s, doc: { ...s.doc, shape: d.doc.shape } };
      if (d.sliders) next.sliders = d.sliders;
      if (d.frame) next.frame = d.frame;
      return next;
    });
  }
  return out;
}

// ── which body ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A slot body as a hero body, on the CLIENT (the Closet preview, the device look). `'scan'` only when the server said
 *  this account owns one; otherwise the kit body of the same sex as the fallback (the server's default). */
export function heroBodyForSlot(body: SlotBody | null | undefined, o: { scanOwned: boolean; fallback: HeroBodyKind }): HeroBodyKind {
  if (body === 'male') return 'kit-male';
  if (body === 'female') return 'kit-female';
  if (body === 'scan') return o.scanOwned ? 'scan' : o.fallback === 'kit-female' ? 'kit-female' : 'kit-male';
  return o.fallback;
}

/** The slot body a hero body is (the first slot a pre-slot look becomes keeps the body it was playing). */
export function slotBodyOf(kind: HeroBodyKind | null | undefined): SlotBody {
  return kind === 'scan' ? 'scan' : kind === 'kit-female' ? 'female' : 'male';
}

/** The slot list the Closet opens with: the stored slots, or — for a look saved before slots — one slot made from it
 *  (so every player always has a character to select, and the first save stores it). */
export function ensureSlots(face: unknown, body: SlotBody, equipped?: CreatorSlotV2['equipped']): { slots: CreatorSlotV2[]; active: string } {
  const slots = readSlots(face, body);
  if (slots.length) return { slots, active: activeSlotId(face, slots) ?? slots[0].id };
  const first = slotFromFace(face, { id: 's1', label: 'LOOK 1', body, equipped });
  return { slots: [first], active: first.id };
}

export type { SlotBase };
