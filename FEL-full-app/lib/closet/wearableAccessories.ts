// Equipped wearables → the code-built accessories the body actually wears (IMPROVE (2026-10-06), research item 2).
//
// THE BUG. `band_flow`, `acc_chain` and `acc_sleeve` could be bought and equipped, and nothing mapped them to
// accessories.ts: the player was dealt a seeded look (`lookFor(… char_${spawnCounter})`) like any NPC, so what they
// bought never showed and what showed changed with the spawn order. Now the player wears exactly what is equipped.
//
// THE NEXUS VISOR (`cap_nexus`) is not an accessory: it renders as a Creator part (phase 2's `visor` shape, through
// the Creator hook), so it is mapped below by `wornPartsForEquipped`, not here. Season items map by what their name says they are (a headband, a sweatband, a wristband);
// assumption: the season names are the reliable signal (their ids are slugs of the names, lib/season/golden-hour.ts).
// Never maps to a retired accessory (accessories.RETIRED_ACCESSORIES: crewsocks).
// Pure: no Babylon import, so the Closet screen and resolveIdentity can both call it.

import type { AccessoryId } from '../babylon/core/accessories';
import type { CreatorPart } from '../creator/look/doc';
import { getWearable, type WearableSlot } from './wearable-catalog';

/** Store items, by id. */
export const WEARABLE_ACCESSORY: Readonly<Record<string, AccessoryId>> = {
  band_flow: 'headband',
  acc_chain: 'chain',
  acc_sleeve: 'armsleeve',
};

/** Season items, by a word in their display name. First match wins. */
const BY_NAME: readonly [RegExp, AccessoryId][] = [
  [/\b(head|sweat)band\b/i, 'headband'],
  [/\bwristband\b/i, 'wristbands'],
  [/\bsleeve\b/i, 'armsleeve'],
  [/\bchain\b/i, 'chain'],
];

/** The accessory one equipped item renders as, or null when it has none yet. */
export function accessoryForWearable(itemId: string | null | undefined): AccessoryId | null {
  if (!itemId) return null;
  const direct = WEARABLE_ACCESSORY[itemId];
  if (direct) return direct;
  const w = getWearable(itemId);
  if (!w) return null;
  for (const [re, id] of BY_NAME) if (re.test(w.name)) return id;
  return null;
}

/** Slots that can carry an accessory. Garments (tops/shorts/shoes) are kit meshes, not accessories. */
const ACCESSORY_SLOTS: readonly WearableSlot[] = ['headwear', 'accessory'];

/** Every accessory the equipped set renders as, deduped, in slot order. Empty for a default (or guest) look. */
export function accessoriesForEquipped(equipped: Partial<Record<string, string | null>> | null | undefined): AccessoryId[] {
  const out: AccessoryId[] = [];
  for (const slot of ACCESSORY_SLOTS) {
    const a = accessoryForWearable(equipped?.[slot] ?? null);
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * Store items that render as Creator PARTS (IMPROVE (2026-10-06), CREATOR-PLAN phase 2): built by the part library and
 * hung through the Creator hook, outside the player's 64-part budget. Placed in the Head bone's frame (lib/creator/look/
 * parts.ts): 9 cm up from the head joint and 3.5 cm forward is eye level on the kit body, and the squash wraps the head
 * (rigFrames.test.ts checks it covers the eyes). Its colour is the item's own accent.
 */
export const WEARABLE_PARTS: Readonly<Record<string, Omit<CreatorPart, 'colour'>[]>> = {
  cap_nexus: [{ id: 'wnexus', shape: 'visor', bone: 'Head', pos: [0, 0.09, 0.035], rot: [0, 0, 0], scale: [0.95, 1, 1.15], finish: 'glow', mirror: false }],
};

/** Every part the equipped set renders as, in slot order. Empty for a default (or guest) look. */
export function wornPartsForEquipped(equipped: Partial<Record<string, string | null>> | null | undefined): CreatorPart[] {
  const out: CreatorPart[] = [];
  for (const slot of ACCESSORY_SLOTS) {
    const id = equipped?.[slot] ?? null;
    const parts = id ? WEARABLE_PARTS[id] : undefined;
    if (!parts) continue;
    const colour = (getWearable(id!)?.accent ?? '#FFFFFF').toUpperCase();
    for (const p of parts) out.push({ ...p, pos: [...p.pos], rot: [...p.rot], scale: [...p.scale], colour });
  }
  return out;
}
