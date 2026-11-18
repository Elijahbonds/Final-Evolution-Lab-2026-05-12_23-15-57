/**
 * THE COAST'S DOORS (lane/coast-islands, phase A): how you get to the Coast & Islands from Venice, and back.
 *
 * The plan's travel point (docs/VENICE-HUB-PLAN.md §2): Venice's pier end, `pier.end` in lib/adventure/venice/layout.ts
 * (`zone: 'coast'`, a boat). That spot is the Venice lane's (lane/venice-v2 owns lib/adventure/venice/**, VeniceHubMode and
 * app/play/venice/**), so this lane does NOT wire it. What the Venice side calls, when its pier spot's card is tapped:
 *
 *     import { coastEntryHref } from '@/lib/adventure/coast/door';
 *     router.push(coastEntryHref('pier.end'));      // → /play/coast?from=venice&spot=pier.end
 *
 * and, for the trip back, it reads `?spot=pier.end` on /play/venice the way it already reads a court's spot (hubReturn
 * spotFromSearch) to put the player at the pier end. Until then the boat back lands at the hub's normal start.
 * The zone itself needs nothing else from Venice: it arrives you on its dock whatever the query says.
 *
 * Pure (no DOM): hrefs only.
 */

export const COAST_ROUTE = '/play/coast';
export const VENICE_ROUTE = '/play/venice';
export const FROM_PARAM = 'from';
export const SPOT_PARAM = 'spot';
/** Venice's pier-end spot id (lib/adventure/venice/layout.ts SPOTS 'pier.end'). */
export const VENICE_PIER_SPOT = 'pier.end';

/** The page Venice's boat opens. `spot` is the Venice spot the player leaves from, so the boat back can land them there. */
export function coastEntryHref(spot: string = VENICE_PIER_SPOT): string {
  const q = new URLSearchParams({ [FROM_PARAM]: 'venice', [SPOT_PARAM]: spot });
  return `${COAST_ROUTE}?${q.toString()}`;
}

/** Where the boat back to Venice goes: the hub, at the spot the player left from (the pier end unless the query says else). */
export function veniceReturnHref(search = ''): string {
  let spot = VENICE_PIER_SPOT;
  try {
    const q = new URLSearchParams(search);
    const s = q.get(SPOT_PARAM);
    if (q.get(FROM_PARAM) === 'venice' && s && /^[a-z0-9.]{1,40}$/.test(s)) spot = s;
  } catch { /* the default */ }
  return `${VENICE_ROUTE}?${new URLSearchParams({ [SPOT_PARAM]: spot }).toString()}`;
}
