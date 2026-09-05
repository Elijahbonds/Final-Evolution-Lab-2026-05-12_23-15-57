import { describe, expect, it } from 'vitest';
import { snapshotFromTree, leakFromScreen } from './buildSnapshot';
import { analyzeMovement, defaultMetrics } from '@/lib/workout/movement-screen';
import { buildMealRx, LEAK_THEMES, loadBandFor, mergeGrocery } from './mealRxBuilder';
import { fulfill, groceryText } from './fulfillment';
import { SEED_RECIPES } from './recipes.seed';
import { NON_CLINICAL_DISCLAIMER } from './types';

describe('FEL Kitchens — MealRx builder (pure)', () => {
  it('maps the soft prep load bands on a 0–1 PRQ', () => {
    expect(loadBandFor(0.5)).toBe('easy');
    expect(loadBandFor(0.75)).toBe('train');
    expect(loadBandFor(0.88)).toBe('train');
    expect(loadBandFor(0.9)).toBe('hard');
  });

  it('divides this tree\'s 0–100 PRQ by 100 and keys the snapshot by scan date', () => {
    const s = snapshotFromTree({ prq0to100: 59, scanDate: '2026-09-05' });
    expect(s.prqScore).toBeCloseTo(0.59);
    expect(s.scanDate).toBe('2026-09-05');
    expect(['mid-back', 'knee-valgus', 'hip-drop', 'ankle']).toContain(s.leak);
  });

  it('reads valgus and asymmetry before the weakest pillar', () => {
    const m = { ...defaultMetrics(), valgusL: 0.6 };
    expect(leakFromScreen(m, analyzeMovement(m))).toBe('knee-valgus');
    const a = { ...defaultMetrics(), asymmetryPct: 20 };
    expect(leakFromScreen(a, analyzeMovement(a))).toBe('hip-drop');
  });

  it('builds a MealRx whose themes lead with the leak map and whose plan comes from the catalogue', () => {
    const rx = buildMealRx({ signature: { scanDate: '2026-09-05', prqScore: 0.6, leak: 'knee-valgus', leakLabel: 'Knee valgus' }, recipes: SEED_RECIPES });
    expect(rx.schemaVersion).toBe(1);
    expect(rx.themes.slice(0, LEAK_THEMES['knee-valgus'].length)).toEqual(LEAK_THEMES['knee-valgus'].slice(0, 3));
    expect(rx.dayPlan.length).toBeGreaterThanOrEqual(2);
    expect(rx.dayPlan.length).toBeLessThanOrEqual(4);
    for (const slot of rx.dayPlan) expect(SEED_RECIPES.some((r) => r.id === slot.recipeId)).toBe(true);
    expect(rx.disclaimer).toBe(NON_CLINICAL_DISCLAIMER);
    expect(rx.sourceScanDate).toBe('2026-09-05');
  });

  it('a hard load band adds carb timing and a post slot', () => {
    const rx = buildMealRx({ signature: { scanDate: 'd', prqScore: 0.95, leak: 'ankle', leakLabel: 'Ankle' }, recipes: SEED_RECIPES });
    expect(rx.loadBand).toBe('hard');
    expect(rx.dayPlan.some((s) => s.slot === 'post')).toBe(true);
  });

  it('merges the grocery list by name + unit and sums quantities', () => {
    const merged = mergeGrocery([
      { name: 'jasmine rice', qty: 90, unit: 'g' }, { name: 'Jasmine Rice', qty: 80, unit: 'g' }, { name: 'jasmine rice', qty: 1, unit: 'cup' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((i) => i.unit === 'g')?.qty).toBe(170);
  });

  it('only the list path is live in v0; Instacart and Drive stay locked without inventing a link', () => {
    const rx = buildMealRx({ signature: { scanDate: 'd', prqScore: 0.6, leak: 'hip-drop', leakLabel: 'Hip drop' }, recipes: SEED_RECIPES, preferredFulfillment: 'instacart' });
    expect(rx.fulfillmentHint).toBe('list');
    const list = fulfill('list', rx.groceryList);
    expect(list.path).toBe('list');
    if (list.path === 'list') expect(list.text).toContain(NON_CLINICAL_DISCLAIMER);
    const ic = fulfill('instacart', rx.groceryList);
    if (ic.path === 'instacart') expect(ic.url).toBeNull();
    const dd = fulfill('doordash', rx.groceryList);
    if (dd.path === 'doordash') expect(dd.unavailable).toBe(true);
    expect(groceryText(rx.groceryList)).toContain('FEL Kitchens');
  });
});
