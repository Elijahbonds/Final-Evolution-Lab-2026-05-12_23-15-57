// FOOTWEAR / GEAR, AND ACCESSORIES — built entirely out of the shipped closet (2026-09-14). Spec §1.
//
// EVERY OPTION IS A WEARABLE THAT EXISTS. The rows are derived from `WEARABLES` rather than typed out, so
// an item added to the closet appears in the creator with no edit here and an item that does not ship can
// never be offered. `wearablesForSlot` is the same function the Closet screen uses.
//
// THE OPTIONS ARE NAMES, NOT IDS, and that is the one place this section is not a straight pass-through.
// A slot row displays its value verbatim and the screen upper-cases it, so an id would read "SHOES_EVO" on
// the row. `wearableIdFor` maps the name back for the save path, and a test walks every option through it
// — if two items are ever given the same display name the mapping becomes ambiguous and that test fails
// rather than a player's shoes silently becoming someone else's.
//
// OWNERSHIP IS NOT DECIDED HERE, AND THE CREATOR DOES NOT PRETEND OTHERWISE. The avatar types file is
// blunt about it: ownership is "server-authoritative. NEVER trust a client-side copy of this." So the
// creator offers the catalog and prints what each item costs in coins in its glossary, and the save path
// is where the server refuses what you have not bought. Hiding unowned items here would put a second
// opinion about ownership in the client, which is the thing that rule forbids.
//
// COLOURS ARE THE PALETTE THE GAME ALREADY USES. `TintSet` is three hex zones on an RGB mask. Rather than
// inventing a colour picker's worth of swatches, the options are the accent colours the shipped wearables
// are authored in plus the three defaults — every one of them a colour that already appears on screen
// somewhere in FEL.
//
// ACCESSORIES IS ONE ROW, ON PURPOSE. `AvatarSlot` carries exactly one `accessory` and the builder binds
// one mesh per slot. A section offering two accessory slots would be describing an avatar the builder
// cannot build.

import type { SlotRow, SectionTable } from './types';
import { WEARABLES, wearablesForSlot, defaultEquipped, getWearable, type WearableSlot } from '../../closet/wearable-catalog';
import { DEFAULT_AVATAR } from '../../babylon/types/avatar';

/** Display names for one closet slot, in catalog order. */
export function optionsForSlot(slot: WearableSlot): string[] {
  return wearablesForSlot(slot).map((w) => w.name);
}

/** Display name → item id, for the save path. Null for NONE or a name no item carries. */
export function wearableIdFor(name: string | null): string | null {
  if (!name) return null;
  return WEARABLES.find((w) => w.name === name)?.itemId ?? null;
}

/** "Coins: 800." appended to a gear row's glossary, so a price is never a surprise at the save. */
function priceLine(slot: WearableSlot): string {
  const items = wearablesForSlot(slot);
  if (!items.length) return '';
  const lo = Math.min(...items.map((w) => w.coinPrice));
  const hi = Math.max(...items.map((w) => w.coinPrice));
  return lo === hi ? ` Coins: ${lo}.` : ` Coins: ${lo}–${hi}.`;
}

/**
 * What the closet already puts on an untouched player, as a display name.
 *
 * `defaultEquipped()` is the closet's answer and it is NOT the first item in every list — its default
 * shoe is the Flight Trainers and the catalog lists the Evolution Hi-Tops first. Two defaults for one
 * pair of feet is how a player ends up wearing one thing in the Closet and another in the creator.
 */
function defaultNameFor(slot: WearableSlot): string | undefined {
  const id = defaultEquipped()[slot];
  return id ? getWearable(id)?.name : undefined;
}

const kit = (id: string, label: string, slot: WearableSlot, allowNone: boolean, glossary: string): SlotRow => ({
  kind: 'slot', id, label, section: 'gear', tab: 'Kit',
  options: optionsForSlot(slot), allowNone, defaultOption: defaultNameFor(slot), requires: null,
  glossary: glossary + priceLine(slot) + ' Owning it is decided by the server when you save, not by this screen.',
});

/** Every accent the shipped wearables are authored in, plus the three avatar defaults. Deduped, stable order. */
export const KIT_COLOURS: string[] = (() => {
  const seen: string[] = [];
  for (const hex of [
    DEFAULT_AVATAR.colors.primary, DEFAULT_AVATAR.colors.secondary, DEFAULT_AVATAR.colors.accent,
    ...WEARABLES.map((w) => w.accent),
  ]) {
    const up = hex.toUpperCase();
    if (!seen.includes(up)) seen.push(up);
  }
  return seen;
})();

const colour = (id: string, label: string, zone: keyof typeof DEFAULT_AVATAR.colors, glossary: string): SlotRow => ({
  kind: 'slot', id, label, section: 'gear', tab: 'Colours',
  options: KIT_COLOURS, allowNone: false, defaultOption: DEFAULT_AVATAR.colors[zone].toUpperCase(),
  requires: null, glossary,
});

export const GEAR: SectionTable<SlotRow> = {
  section: 'gear',
  title: 'Footwear / Gear',
  rows: [
    kit('headwear', 'Headwear', 'headwear', true, 'Worn on the head. Optional — plenty of builds wear nothing.'),
    kit('tops', 'Top', 'tops', false, 'The jersey or shirt. Carries the number plate on the back.'),
    kit('shorts', 'Shorts', 'shorts', false, 'Lower body.'),
    kit('shoes', 'Footwear', 'shoes', false, 'Shoes. Cosmetic only — nothing you wear changes how you play.'),
    colour('colorPrimary', 'Primary Colour', 'primary', 'The mask\'s red zone: the main body of the kit.'),
    colour('colorSecondary', 'Secondary Colour', 'secondary', 'The mask\'s green zone: panels and trim.'),
    colour('colorAccent', 'Accent Colour', 'accent', 'The mask\'s blue zone: the small bright parts that read at distance.'),
  ],
};

export const ACCESSORIES: SectionTable<SlotRow> = {
  section: 'accessories',
  title: 'Accessories',
  rows: [
    {
      kind: 'slot', id: 'accessory', label: 'Accessory', section: 'accessories', tab: 'Worn',
      options: optionsForSlot('accessory'), allowNone: true, defaultOption: defaultNameFor('accessory'), requires: null,
      glossary: 'The one accessory the rig carries — a chain, a sleeve.' + priceLine('accessory') +
        ' There is exactly one slot, so this is a choice rather than a collection.',
    },
  ],
};
