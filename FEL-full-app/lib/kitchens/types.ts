// FEL Kitchens — the LOCKED shapes from the PM's soft prep (docs/_soft-prep-kitchens/SPEC-MEAL-RX-v0.md), adapted to
// this tree (docs/SPEC-FEL-KITCHENS.md). Kitchens owns these. Build / Mirror types are never mutated from here.

/** Persist key — localStorage is fine for the soft / sandbox lane. */
export const KITCHEN_STORAGE_KEY = 'fel-kitchen-store-v1';

/** Non-clinical, food tags only. Carried on every meal and fulfilment surface. */
export const NON_CLINICAL_DISCLAIMER =
  'Performance fuel, not medical advice. Food tags describe the plate, not a treatment. Talk to a clinician for anything health-related.';

/**
 * The leak vocabulary from Your Build. The Build store lives in the Vite twin (`src/core/BuildStore.ts`), not on this
 * disk; when it lands here this becomes `export type { LeakId } from '../core/BuildStore'` and nothing else moves.
 */
export type LeakId = 'mid-back' | 'knee-valgus' | 'hip-drop' | 'ankle';

export type FulfillmentPath = 'list' | 'instacart' | 'doordash' | 'none';

export type LoadBand = 'easy' | 'train' | 'hard';

export type MealTheme =
  | 'recovery'
  | 'protein-rebuild'
  | 'anti-inflammatory'
  | 'hydration-electrolyte'
  | 'carb-timing'
  | 'joint-support'; // food tags only — no medical claims

export interface Macros {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export type GroceryUnit = 'g' | 'ml' | 'each' | 'tbsp' | 'tsp' | 'cup' | 'oz';

export interface GroceryItem {
  name: string;
  qty: number;
  unit: GroceryUnit;
  aisleHint?: string;
  optional?: boolean;
  /** When the Instacart path unlocks — null in v0. */
  externalSkuHint?: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  prepMinutes: number;
  macros: Macros;
  themes: MealTheme[];
  ingredients: GroceryItem[];
  athleteNote?: string; // Elijah's voice, optional
  source: 'seed' | 'elijah' | 'blueprint';
}

export type MealSlotKind = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre' | 'post';

export interface MealSlot {
  slot: MealSlotKind;
  recipeId: string;
  title: string; // denormalised for the UI
  minutes: number;
  macros: Macros;
  themes: MealTheme[];
}

export interface MealRx {
  id: string;
  schemaVersion: 1;
  createdAt: string; // ISO
  sourceScanDate: string; // BuildSnapshot.scanDate
  leak: LeakId;
  leakLabel: string;
  loadBand: LoadBand;
  themes: MealTheme[]; // 1–3, primary first
  dayPlan: MealSlot[];
  groceryList: GroceryItem[]; // flattened + merged from the day plan's recipes
  disclaimer: string;
  /** A hint only — the adapter falls back to 'list' when a path is locked or unavailable. */
  fulfillmentHint: FulfillmentPath;
}

export interface KitchenSnapshot {
  /** The latest MealRx for the current Build scan, or null if none built. */
  current: MealRx | null;
  /** Prior MealRx keyed by sourceScanDate (cap 14). */
  history: MealRx[];
  /** Recipe catalogue seed (static until the content GO). */
  recipes: Recipe[];
  /** Default fulfil path until adapters unlock. v0 = 'list'. */
  preferredFulfillment: FulfillmentPath;
}
