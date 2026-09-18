// WHO IS ALLOWED TO WEAR WHAT — in ONE place (2026-09-14).
//
// The rule was already written down in `lib/babylon/types/avatar.ts`: ownership is "server-authoritative.
// NEVER trust a client-side copy of this." What was not true is that it lived in one place — the free-item
// list was typed out in `components/closet-view.tsx` AND inline in `app/api/v1/closet/route.ts`, and the
// creator was about to be the third. Three copies of an entitlement rule is two chances to disagree about
// what somebody owns, and the one that disagrees is always the one that lets an item through.
//
// UNOWNED RESOLVES TO EMPTY, NOT TO A SUBSTITUTE. A save that quietly swapped an unowned jersey for a
// different one would be the server dressing a player in something they did not pick. Empty is honest and
// the editor shows it.
//
// THE FREE LIST IS PART OF THE PRODUCT, not a dev convenience: a brand-new account must be able to walk
// onto a court dressed. It is the same three starters the Closet has always given away.
//
// Pure: no Prisma, no fetch. The caller reads ownership from the database and passes it in.

/** Items every account has without buying them. The Closet's starters. */
export const FREE_ITEMS: ReadonlySet<string> = new Set(['top_lab', 'shorts_court', 'shoes_flight']);

/** May this account equip this item? `owned` is the ids the SERVER says they have. */
export function canEquip(itemId: string | null | undefined, owned: ReadonlySet<string>): boolean {
  if (!itemId) return true;                     // wearing nothing needs no entitlement
  return owned.has(itemId) || FREE_ITEMS.has(itemId);
}

/**
 * The equipped map with anything unowned removed.
 *
 * Slots are preserved so the caller can tell "cleared" from "never mentioned": a slot present in the
 * input is present in the output, holding either the item or null.
 */
export function filterEquipped(
  equipped: Record<string, string | null | undefined> | null | undefined,
  owned: ReadonlySet<string>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [slot, itemId] of Object.entries(equipped ?? {})) {
    out[slot] = canEquip(itemId, owned) ? (itemId ?? null) : null;
  }
  return out;
}

/** What was dropped and why — so a save can TELL the player instead of silently undressing them. */
export function refusedItems(
  equipped: Record<string, string | null | undefined> | null | undefined,
  owned: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const itemId of Object.values(equipped ?? {})) {
    if (itemId && !canEquip(itemId, owned)) out.push(itemId);
  }
  return out;
}
