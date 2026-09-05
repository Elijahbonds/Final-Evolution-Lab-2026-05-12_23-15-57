// FEL Kitchens — KitchenStore (LOCKED shape). Separate from the Build store; keyed by sourceScanDate; localStorage like
// KitchenMarket. Modes never call this. Build is read-only upstream: `ingest` takes a BuildSnapshot and never writes back.

import type { BuildSnapshot } from './buildSnapshot';
import { buildMealRx } from './mealRxBuilder';
import { SEED_RECIPES } from './recipes.seed';
import { KITCHEN_STORAGE_KEY, type FulfillmentPath, type KitchenSnapshot, type MealRx } from './types';

const HISTORY_CAP = 14;

function empty(): KitchenSnapshot {
  return { current: null, history: [], recipes: SEED_RECIPES, preferredFulfillment: 'list' };
}

function read(): KitchenSnapshot {
  try {
    if (typeof localStorage === 'undefined') return empty();
    const raw = localStorage.getItem(KITCHEN_STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<KitchenSnapshot>;
    return {
      current: parsed.current ?? null,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, HISTORY_CAP) : [],
      recipes: SEED_RECIPES, // the catalogue is static until the content GO; never trust a stored copy
      preferredFulfillment: parsed.preferredFulfillment ?? 'list',
    };
  } catch { return empty(); }
}

function write(s: KitchenSnapshot): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const { recipes: _r, ...persist } = s; // the seed catalogue is code, not state
    localStorage.setItem(KITCHEN_STORAGE_KEY, JSON.stringify(persist));
  } catch { /* private mode / quota: the store is a convenience */ }
}

export const KitchenStore = {
  snapshot(): KitchenSnapshot { return read(); },

  /**
   * New Build snapshot in: if its scanDate differs from the current Rx, the current one is archived (cap 14) and a
   * fresh MealRx is built. Same scanDate: rebuild in place (idempotent for the day).
   */
  ingest(build: BuildSnapshot): MealRx {
    const s = read();
    const rx = buildMealRx({ signature: build, recipes: s.recipes, preferredFulfillment: s.preferredFulfillment });
    const history = s.current && s.current.sourceScanDate !== rx.sourceScanDate
      ? [s.current, ...s.history.filter((h) => h.sourceScanDate !== s.current!.sourceScanDate)].slice(0, HISTORY_CAP)
      : s.history;
    write({ ...s, current: rx, history });
    return rx;
  },

  setPreferredFulfillment(path: FulfillmentPath): void {
    const s = read();
    write({ ...s, preferredFulfillment: path, current: s.current ? { ...s.current, fulfillmentHint: path === 'list' || path === 'none' ? path : 'list' } : null });
  },

  reset(): void { write(empty()); },
};
