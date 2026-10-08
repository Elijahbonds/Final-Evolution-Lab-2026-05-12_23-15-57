/**
 * The partner's view binders (ADVENTURE PLAN A3; A4 mounts them). Thin on purpose: the sim decides, the view shows.
 *
 *   partnerIdentity    a character partner's PlayerIdentity, through the SAME identityFrom the player's spawn uses
 *                      (core/playerIdentity.ts), re-pointed at the partner's slot (partner/identity.ts). Null for a
 *                      creature, or when the slot is gone (spawn the default look).
 *   partnerBodyVisible a partner whose fusion is active is inside the player: hide its body (and its shadow).
 *
 * This file may import Babylon-backed modules (playerIdentity does); nothing in the sim imports this file.
 */
import { identityFrom, type HeroBodyAnswer, type PlayerIdentity } from '@/lib/babylon/core/playerIdentity';
import type { StoredLook } from '@/lib/creator/localLook';
import type { AdventureActor, PartnerDef } from '../contracts';
import { partnerHeroBody, partnerIdentityInputs, resolvePartnerLook, type PartnerClosetAnswer, type PartnerDeviceLook } from './identity';

/**
 * `closet` is the FULL closet answer (GET /api/v1/closet: every slot; `?for=spawn` carries only the active one).
 * `local` is the device copy (readLocalLook()), read only for a lookLocal player; nothing here sends it anywhere.
 */
export function partnerIdentity(
  def: PartnerDef, closet: PartnerClosetAnswer | null, heroBody: HeroBodyAnswer | null, local: PartnerDeviceLook | null,
): PlayerIdentity | null {
  const inputs = partnerIdentityInputs(def, closet, local);
  if (!inputs) return null;
  const look = resolvePartnerLook(def, closet, local);
  return identityFrom(inputs.closet, partnerHeroBody(look, heroBody), inputs.local as StoredLook | null);
}

export function partnerBodyVisible(partner: Pick<AdventureActor, 'kind' | 'fusion'>): boolean {
  return !(partner.kind === 'partner' && partner.fusion.active);
}
