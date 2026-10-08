/**
 * A character partner's look (ADVENTURE PLAN A3, 2026-10-06): "a second character the player built", which is one of
 * their own Creator slots (lib/creator/look/slots.ts; up to MAX_SLOTS). The save holds only the slot id; the look is
 * resolved through the identity layer exactly as the player's own is, by pointing the face's `activeSlot` at the
 * partner's slot and handing that to `identityFrom` (core/playerIdentity.ts). Nothing here builds a look of its own.
 *
 * TEENS (the Creator's rule, TEEN_DEVICE_LOOK_EVERYWHERE): a player whose closet says `lookLocal` keeps every slot on
 * the DEVICE (the server row holds catalog defaults), so their partner's slot is read from the device copy
 * (lib/creator/localLook readLocalLook), never fetched or sent. A slot that no longer exists (deleted in the Closet)
 * resolves to null and the caller spawns the default look; the save keeps the id, so restoring nothing is lost.
 *
 * Pure: the closet answer and the device copy are passed in.
 */
import { TEEN_DEVICE_LOOK_EVERYWHERE, activeLook, heroBodyForSlot, readSlots, type ActiveLook } from '@/lib/creator/look/slots';
import type { HeroBodyKind } from '@/lib/babylon/core/heroBody';
import type { PartnerDef } from '../contracts';

/** The closet answer's fields this reads (GET /api/v1/closet, the full answer: every slot, not `?for=spawn`). */
export interface PartnerClosetAnswer { look?: { face?: unknown } | null; lookLocal?: boolean }
/** The device copy's field this reads (lib/creator/localLook StoredLook). */
export interface PartnerDeviceLook { face?: unknown }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** True when the look comes from the device (a teen or unknown age with a device copy). */
export function partnerLookFromDevice(closet: PartnerClosetAnswer | null, local: PartnerDeviceLook | null): boolean {
  return closet?.lookLocal === true && TEEN_DEVICE_LOOK_EVERYWHERE && !!local?.face;
}

/** The face whose slots the partner is chosen from: the device copy for a lookLocal player, else the server's. */
export function partnerSourceFace(closet: PartnerClosetAnswer | null, local: PartnerDeviceLook | null): unknown {
  return partnerLookFromDevice(closet, local) ? local!.face : closet?.look?.face;
}

/** The slots a player may pick as a partner: every slot but the one they play as. */
export function partnerSlotChoices(closet: PartnerClosetAnswer | null, local: PartnerDeviceLook | null): { id: string; label: string }[] {
  const face = partnerSourceFace(closet, local);
  const active = isObj(face) && typeof face.activeSlot === 'string' ? face.activeSlot : null;
  return readSlots(face).filter((s) => s.id !== active).map((s) => ({ id: s.id, label: s.label }));
}

/** The face with `activeSlot` pointed at the partner's slot, or null when the slot is gone. */
export function partnerFace(face: unknown, slotId: string): Obj | null {
  if (!isObj(face)) return null;
  if (!readSlots(face).some((s) => s.id === slotId)) return null;
  return { ...face, activeSlot: slotId };
}

/** The partner's look (the same reader every mode spawns from), or null when the def is not a character or the slot is gone. */
export function resolvePartnerLook(def: PartnerDef, closet: PartnerClosetAnswer | null, local: PartnerDeviceLook | null): ActiveLook | null {
  const slotId = def.kind === 'character' ? def.character?.creatorSlotId : undefined;
  if (!slotId) return null;
  const face = partnerFace(partnerSourceFace(closet, local), slotId);
  return face ? activeLook(face) : null;
}

/**
 * The two answers `identityFrom(closet, heroBody, local)` takes, re-pointed at the partner's slot, or null when there
 * is no such slot. The device copy is re-pointed for a lookLocal player, the server face for everyone else.
 */
export function partnerIdentityInputs(
  def: PartnerDef, closet: PartnerClosetAnswer | null, local: PartnerDeviceLook | null,
): { closet: PartnerClosetAnswer & Obj; local: (PartnerDeviceLook & Obj) | null } | null {
  const slotId = def.kind === 'character' ? def.character?.creatorSlotId : undefined;
  if (!slotId || !closet) return null;
  if (partnerLookFromDevice(closet, local)) {
    const face = partnerFace(local!.face, slotId);
    return face ? { closet: { ...(closet as Obj) }, local: { ...(local as Obj), face } } : null;
  }
  const face = partnerFace(closet.look?.face, slotId);
  return face ? { closet: { ...(closet as Obj), look: { ...(closet.look as Obj), face } }, local: null } : null;
}

/**
 * The hero-body answer for the partner's spawn. The server's /api/v1/hero-body answers for the PLAYER's active slot, so
 * the partner's body is mapped from its own slot here (`'scan'` only for an account that owns one, as the device path in
 * identityFrom does), and the player's Athlete Creator frame and palette are not carried over: the partner's slot
 * frame and its doc colours are its own.
 */
export function partnerHeroBody(
  look: ActiveLook | null, heroBody: { body?: HeroBodyKind; scanOwned?: boolean } | null,
): { body: HeroBodyKind; frame: null; palette: null; scanOwned: boolean } {
  const scanOwned = heroBody?.scanOwned === true;
  const fallback: HeroBodyKind = heroBody?.body === 'kit-female' ? 'kit-female' : 'kit-male';
  return { body: heroBodyForSlot(look?.body ?? null, { scanOwned, fallback }), frame: null, palette: null, scanOwned };
}
