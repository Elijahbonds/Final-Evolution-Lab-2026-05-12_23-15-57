/**
 * The real party and the real save (Phase B; owner: the partner is "BOTH, player's choice — an evolving creature or a
 * second built character"). A first-run player picks one; the pick is written to the DEVICE save with A3's policy:
 * anyone who is not a verified adult (a teen, an unknown age, a guest) keeps the save on the device only — and today
 * every save does, because the server save waits on the owner's table (prisma/pending/*-adventure-save.sql;
 * save/policy ADVENTURE_SERVER_SAVE_ENABLED stays false until the owner applies it and a route exists).
 *
 * The test yard's `yard:` save prefix, its lent partner and its lent spells stay the yard's: nothing here reads them.
 * Pure (storage and the clock are handed in).
 */

import type { AdventureSave, Element, PartnerDef } from '../contracts';
import { ELEMENTS } from '../contracts';
import { createCharacterPartner, createCreaturePartner } from '../partner/defs';
import { ADVENTURE_SPECIES_TABLE, ADVENTURE_SPECIES_IDS } from '../partner/species';
import {
  adventureSavePolicy, loadAdventureSave, storeAdventureSave, verifiedAdultFromCloset, type SavePolicy, type SaveStorage, type StoreResult,
} from '../save';

/** The partner's id in the save (one partner per save). */
export const STORY_PARTNER_ID = 'partner';
/** A guest or a player with no Creator slot partners with this slot id: the default hero, tinted. [PLACEHOLDER] */
export const DEFAULT_CHARACTER_SLOT = 'slot-0';

export type PartnerPick =
  | { kind: 'creature'; speciesId: string; name?: string }
  | { kind: 'character'; creatorSlotId: string; element: Element; name?: string };

/** The creature choices (the Garden's placeholder species, with the Adventure's element). */
export function creatureChoices(): { speciesId: string; element: Element }[] {
  return ADVENTURE_SPECIES_IDS.map((id) => ({ speciesId: id, element: ADVENTURE_SPECIES_TABLE[id].element }));
}

/** The elements a character partner may carry. */
export const CHARACTER_ELEMENTS: readonly Element[] = ELEMENTS;

/** A partner from a pick, or null for a pick that names nothing real (an unknown species, a bad slot id or element). */
export function partnerFromPick(pick: PartnerPick): PartnerDef | null {
  if (pick.kind === 'creature') return createCreaturePartner({ id: STORY_PARTNER_ID, speciesId: pick.speciesId, name: pick.name });
  if (!(ELEMENTS as readonly string[]).includes(pick.element)) return null;
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(pick.creatorSlotId)) return null;
  return createCharacterPartner({ id: STORY_PARTNER_ID, creatorSlotId: pick.creatorSlotId, element: pick.element, name: pick.name });
}

/** Who the player is, for the save policy: signed in or not, and the closet's verdict (GET /api/v1/closet `lookLocal`). */
export interface Who { signedIn: boolean; closet?: unknown }

export function policyFor(who: Who): SavePolicy {
  return adventureSavePolicy({ signedIn: who.signedIn, verifiedAdult: who.signedIn ? verifiedAdultFromCloset(who.closet) : null });
}

/** The player's real save from the device (never the yard's `yard:` copy). */
export function loadStorySave(now: number, storage?: SaveStorage | null): { save: AdventureSave; status: string } {
  const r = loadAdventureSave({ now, storage });
  return { save: r.save, status: r.status };
}

/** The first run: the pick becomes the save's partner, written to the device under the player's policy. */
export function savePartnerPick(save: AdventureSave, pick: PartnerPick, o: { now: number; who: Who; storage?: SaveStorage | null; remote?: (doc: AdventureSave) => Promise<unknown> }): { result: StoreResult; partner: PartnerDef } | null {
  const partner = partnerFromPick(pick);
  if (!partner) return null;
  const next: AdventureSave = { ...save, partner };
  const result = storeAdventureSave(next, { now: o.now, policy: policyFor(o.who), storage: o.storage, remote: o.remote });
  return { result, partner };
}

/** Store the session's progress (the same policy, every time). */
export function storeStorySave(save: AdventureSave, o: { now: number; who: Who; storage?: SaveStorage | null; remote?: (doc: AdventureSave) => Promise<unknown> }): StoreResult {
  return storeAdventureSave(save, { now: o.now, policy: policyFor(o.who), storage: o.storage, remote: o.remote });
}
