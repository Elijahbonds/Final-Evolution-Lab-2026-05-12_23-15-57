// FEL Kitchens — fulfilment adapter (LOCKED hybrid, docs/_soft-prep-kitchens/ONEPAGER-FULFILLMENT-v0.md).
// v0 ships the list. Instacart IDP is a shopping-list link from the SAME GroceryItem[] once the key and Elijah's GO
// exist (apply HOLD). DoorDash Drive stays documented only until a real pickup / pack node exists — its adapter is a
// no-op by design. Keys are env-only, never in git:
//   INSTACART_IDP_KEY   (server; the shopping-list link needs a server route to sign — not wired in v0)
//   DOORDASH_DRIVE_KEY  (server; unused until a partner kitchen exists)

import { NON_CLINICAL_DISCLAIMER, type FulfillmentPath, type GroceryItem } from './types';

export type FulfillmentResult =
  | { path: 'list'; text: string; items: GroceryItem[] }
  | { path: 'instacart'; url: string | null; reason?: string; items: GroceryItem[] }
  | { path: 'doordash'; unavailable: true; reason: string }
  | { path: 'none' };

/** Plain-text list for copy / share — one line per item, optional items marked, the disclaimer at the end. */
export function groceryText(items: GroceryItem[], title = 'FEL Kitchens · grocery list'): string {
  const lines = items.map((i) => `${i.optional ? '(optional) ' : ''}${i.name} — ${i.qty} ${i.unit}${i.aisleHint ? ` · ${i.aisleHint}` : ''}`);
  return [title, ...lines, '', NON_CLINICAL_DISCLAIMER].join('\n');
}

/** Which paths a viewer may pick right now. Instacart and Drive render locked until their gates open. */
export function availablePaths(unlocked: { instacart?: boolean } = {}): Array<{ path: FulfillmentPath; label: string; available: boolean; note?: string }> {
  return [
    { path: 'list', label: 'Grocery list', available: true },
    // Wired behind the key (owner decision 2026-09-05): the server says whether INSTACART_IDP_KEY exists; the
    // application itself stays on HOLD until the pad grade, the AM paste and Elijah's GO.
    { path: 'instacart', label: 'Instacart list', available: Boolean(unlocked.instacart), note: unlocked.instacart ? 'Live — opens a shoppable list with the same items' : 'Unlocks when the Instacart key lands (apply HOLD)' },
    { path: 'doordash', label: 'DoorDash Drive', available: false, note: 'Needs a partner kitchen with pickup' },
  ];
}

export function fulfill(path: FulfillmentPath, items: GroceryItem[]): FulfillmentResult {
  switch (path) {
    case 'list': return { path, text: groceryText(items), items };
    case 'instacart': return { path, url: null, reason: 'The link is minted server-side by /api/kitchens/instacart-list (409 while the key is absent) — the list path carries the same items', items };
    case 'doordash': return { path, unavailable: true, reason: 'No pickup / pack node yet — documented only' };
    default: return { path: 'none' };
  }
}
