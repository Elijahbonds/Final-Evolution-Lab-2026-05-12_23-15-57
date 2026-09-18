// FEL Kitchens — the pure builder from the soft prep. No I/O, no store writes; Build is read-only upstream.

import type { BuildSnapshot } from './buildSnapshot';
import { NON_CLINICAL_DISCLAIMER, type FulfillmentPath, type GroceryItem, type LeakId, type LoadBand, type MealRx, type MealSlot, type MealSlotKind, type MealTheme, type Recipe } from './types';

/** DRAFT (pending Elijah): leak → primary themes. */
export const LEAK_THEMES: Record<LeakId, MealTheme[]> = {
  'mid-back': ['recovery', 'hydration-electrolyte', 'anti-inflammatory'],
  'knee-valgus': ['protein-rebuild', 'joint-support', 'anti-inflammatory'],
  'hip-drop': ['protein-rebuild', 'carb-timing'],
  ankle: ['hydration-electrolyte', 'anti-inflammatory', 'joint-support'],
};

/** Player one-liners: fuel, not PT. */
export const LEAK_ONE_LINER: Record<LeakId, string> = {
  'mid-back': 'Fuel that keeps you soft and ready for the next lock.',
  'knee-valgus': 'Rebuild day. Protein first, keep the joints quiet.',
  'hip-drop': 'Stance-side fuel. Steady protein + timed carbs.',
  ankle: 'Soft tissue day. Fluids + quiet joints.',
};

/**
 * Owner decision (2026-09-05): grade-aligned to this tree's PRQ grades — RECOVERING and READY (< 60) → easy day,
 * PRIMED (60–79) → train day, ELITE (80+) → hard day. `prqScore` is 0–1 (this tree's 0–100 ÷ 100).
 */
export function loadBandFor(prqScore: number): LoadBand {
  if (prqScore >= 0.8) return 'hard';
  if (prqScore >= 0.6) return 'train';
  return 'easy';
}

/** Slot plans per load band: an easy day eats four times; train and hard days add a pre and a post slot around the session. */
export const LOAD_SLOTS: Record<LoadBand, MealSlotKind[]> = {
  easy: ['breakfast', 'lunch', 'dinner', 'snack'],
  train: ['breakfast', 'pre', 'lunch', 'post', 'dinner'],
  hard: ['breakfast', 'pre', 'lunch', 'post', 'dinner', 'snack'],
};

/** Merge by name + unit, summing quantities; the first aisle hint wins; optional only if every source says optional. */
export function mergeGrocery(items: GroceryItem[]): GroceryItem[] {
  const out = new Map<string, GroceryItem>();
  for (const it of items) {
    const key = `${it.name.trim().toLowerCase()}|${it.unit}`;
    const prev = out.get(key);
    if (!prev) { out.set(key, { ...it, name: it.name.trim(), externalSkuHint: it.externalSkuHint ?? null }); continue; }
    out.set(key, { ...prev, qty: Math.round((prev.qty + it.qty) * 100) / 100, optional: Boolean(prev.optional && it.optional), aisleHint: prev.aisleHint ?? it.aisleHint });
  }
  return Array.from(out.values()).sort((a, b) => (a.aisleHint ?? '').localeCompare(b.aisleHint ?? '') || a.name.localeCompare(b.name));
}

function overlap(a: MealTheme[], b: MealTheme[]): number { return a.filter((t) => b.includes(t)).length; }

/** Food shape per slot, on top of theme overlap: light and quick around the session, a full plate at meals. Tags only. */
export function slotFit(slot: MealSlotKind, r: Recipe): number {
  const light = r.macros.kcal <= 400;
  const quick = r.prepMinutes <= 10;
  switch (slot) {
    case 'pre': return (r.themes.includes('carb-timing') ? 3 : 0) + (light ? 2 : -2) + (quick ? 1 : -1) + (r.macros.fatG <= 10 ? 1 : -1);
    case 'post': return (r.themes.includes('protein-rebuild') || r.themes.includes('recovery') ? 3 : 0) + (r.macros.proteinG >= 20 ? 1 : -1) + (quick ? 1 : 0) + (r.macros.kcal <= 600 ? 1 : -1);
    case 'snack': return (light ? 3 : -3) + (quick ? 1 : 0);
    case 'breakfast': return (r.macros.kcal >= 300 && r.macros.kcal <= 650 ? 1 : -1) + (quick ? 2 : 0) + (r.prepMinutes > 20 ? -2 : 0);
    default: return (r.macros.kcal >= 450 ? 2 : -2) + (r.macros.proteinG >= 25 ? 1 : 0) + (r.prepMinutes >= 12 ? 1 : 0); // lunch / dinner: a cooked plate
  }
}

/**
 * Greedy per slot, in slot order: the best unused recipe by theme overlap (×2) + slot fit; ties go to the quicker prep,
 * then the id (deterministic). Variety is a rule: no recipe appears twice in a day plan, and duplicate catalogue ids
 * count once. A catalogue smaller than the slot plan simply yields a shorter plan.
 */
export function pickDayPlan(recipes: Recipe[], themes: MealTheme[], loadBand: LoadBand): MealSlot[] {
  const seen = new Set<string>();
  const catalogue = recipes.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const used = new Set<string>();
  const plan: MealSlot[] = [];
  for (const slot of LOAD_SLOTS[loadBand]) {
    const best = catalogue
      .filter((r) => !used.has(r.id))
      .map((r) => ({ r, score: overlap(r.themes, themes) * 2 + slotFit(slot, r) }))
      .sort((a, b) => b.score - a.score || a.r.prepMinutes - b.r.prepMinutes || a.r.id.localeCompare(b.r.id))[0];
    if (!best) break;
    used.add(best.r.id);
    plan.push({ slot, recipeId: best.r.id, title: best.r.title, minutes: best.r.prepMinutes, macros: best.r.macros, themes: best.r.themes });
  }
  return plan;
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `rx_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Pure. 1) leak from the snapshot; 2) load band from the PRQ; 3) themes = leak map ∪ load extras (hard adds carb-timing
 * and a recovery snack bias); 4) the band's slot plan (LOAD_SLOTS — train and hard cover pre and post) filled by greedy
 * tag overlap + slot fit, no recipe twice; 5) the grocery list merged by name + unit; 6) the fulfilment hint is the
 * preference (only 'list' is unlocked in v0); 7) the disclaimer always rides.
 */
export function buildMealRx(input: { signature: BuildSnapshot; recipes: Recipe[]; preferredFulfillment?: FulfillmentPath; now?: Date }): MealRx {
  const { signature, recipes } = input;
  const loadBand = loadBandFor(signature.prqScore);
  const themes: MealTheme[] = [...LEAK_THEMES[signature.leak]];
  if (loadBand === 'hard') for (const t of ['carb-timing', 'recovery'] as MealTheme[]) if (!themes.includes(t)) themes.push(t);
  const primary = themes.slice(0, 3);

  const dayPlan = pickDayPlan(recipes, themes, loadBand);
  const picked = dayPlan.map((s) => recipes.find((r) => r.id === s.recipeId)).filter((r): r is Recipe => Boolean(r));

  const preferred = input.preferredFulfillment ?? 'list';
  return {
    id: newId(),
    schemaVersion: 1,
    createdAt: (input.now ?? new Date()).toISOString(),
    sourceScanDate: signature.scanDate,
    leak: signature.leak,
    leakLabel: signature.leakLabel,
    loadBand,
    themes: primary,
    dayPlan,
    groceryList: mergeGrocery(picked.flatMap((r) => r.ingredients)),
    disclaimer: signature.disclaimer ?? NON_CLINICAL_DISCLAIMER,
    fulfillmentHint: preferred === 'list' || preferred === 'none' ? preferred : 'list', // instacart / doordash stay locked in v0
  };
}
