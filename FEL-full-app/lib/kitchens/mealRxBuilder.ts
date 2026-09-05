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

const SLOT_ORDER: MealSlotKind[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `rx_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Pure. 1) leak from the snapshot; 2) load band from the PRQ; 3) themes = leak map ∪ load extras (hard adds carb-timing
 * and a recovery snack bias); 4) up to four slots by greedy tag overlap, falling back to any seed recipe; 5) the grocery
 * list merged by name + unit; 6) the fulfilment hint is the preference (only 'list' is unlocked in v0); 7) the disclaimer
 * always rides.
 */
export function buildMealRx(input: { signature: BuildSnapshot; recipes: Recipe[]; preferredFulfillment?: FulfillmentPath; now?: Date }): MealRx {
  const { signature, recipes } = input;
  const loadBand = loadBandFor(signature.prqScore);
  const themes: MealTheme[] = [...LEAK_THEMES[signature.leak]];
  if (loadBand === 'hard') for (const t of ['carb-timing', 'recovery'] as MealTheme[]) if (!themes.includes(t)) themes.push(t);
  const primary = themes.slice(0, 3);

  const ranked = [...recipes].sort((a, b) => overlap(b.themes, themes) - overlap(a.themes, themes) || a.prepMinutes - b.prepMinutes);
  const picked: Recipe[] = [];
  for (const r of ranked) { if (picked.length >= 4) break; if (overlap(r.themes, themes) > 0 || picked.length < 2) picked.push(r); }
  for (const r of ranked) { if (picked.length >= 4) break; if (!picked.includes(r)) picked.push(r); }

  const dayPlan: MealSlot[] = picked.map((r, i) => ({
    slot: loadBand === 'hard' && i === 3 ? 'post' : SLOT_ORDER[i] ?? 'snack',
    recipeId: r.id, title: r.title, minutes: r.prepMinutes, macros: r.macros, themes: r.themes,
  }));

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
