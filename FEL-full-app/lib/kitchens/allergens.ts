// FEL Kitchens — allergens (owner-approved 2026-10-06, the moderate option).
//
// Every recipe declares which of the nine major US food allergens it contains (FALCPA's eight plus sesame, the FASTER
// Act): milk, egg, fish, crustacean shellfish, tree nuts, peanuts, wheat, soy, sesame. The labels are CHEF-DECLARED from
// the ingredient list — FEL does not test food, and a brand's stock, bread or sauce can carry what the recipe does not —
// so ALLERGEN_NOTE rides wherever an allergen shows.
//
// The player's own allergies are a pick ON THIS DEVICE (localStorage, ALLERGY_STORAGE_KEY): nothing is sent or stored on
// the server. The meal builder takes the pick and leaves every flagged recipe out (mealRxBuilder.buildMealRx
// `avoid`); a plan built before the pick changed is re-checked in the UI and any meal that hits it is badged.

import type { Recipe } from './types';

export const ALLERGENS = ['milk', 'egg', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat', 'soy', 'sesame'] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  milk: 'Milk', egg: 'Egg', fish: 'Fish', shellfish: 'Shellfish', 'tree-nuts': 'Tree nuts', peanuts: 'Peanuts',
  wheat: 'Wheat', soy: 'Soy', sesame: 'Sesame',
};

/** Shown wherever an allergen label shows. */
export const ALLERGEN_NOTE = 'Allergens are chef-declared from the ingredients, not tested. Always check the labels on what you buy.';

/** This device only; never sent. */
export const ALLERGY_STORAGE_KEY = 'fel-kitchen-allergies-v1';

export function isAllergen(v: unknown): v is Allergen {
  return typeof v === 'string' && (ALLERGENS as readonly string[]).includes(v);
}

/** The allergens in `recipe` that the player avoids (empty = safe for them). */
export function allergyHits(recipe: Pick<Recipe, 'allergens'>, avoid: readonly Allergen[]): Allergen[] {
  return recipe.allergens.filter((a) => avoid.includes(a));
}

/** Split a catalogue by the player's pick: `safe` has none of the avoided allergens; `flagged` has at least one. */
export function filterRecipesForAllergies<R extends Pick<Recipe, 'allergens'>>(recipes: readonly R[], avoid: readonly Allergen[]): { safe: R[]; flagged: R[] } {
  const safe: R[] = [];
  const flagged: R[] = [];
  for (const r of recipes) (allergyHits(r, avoid).length ? flagged : safe).push(r);
  return { safe, flagged };
}

/** The remembered pick, cleaned (unknown values dropped, de-duplicated, in ALLERGENS order). Empty when storage fails. */
export function loadAllergies(): Allergen[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = JSON.parse(window.localStorage.getItem(ALLERGY_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? ALLERGENS.filter((a) => raw.includes(a)) : [];
  } catch { return []; }
}

export function saveAllergies(avoid: readonly Allergen[]): void {
  try { window.localStorage.setItem(ALLERGY_STORAGE_KEY, JSON.stringify(ALLERGENS.filter((a) => avoid.includes(a)))); } catch { /* this device only; a failed write keeps the pick for the page */ }
}
