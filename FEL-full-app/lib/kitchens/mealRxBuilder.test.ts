import { describe, expect, it } from 'vitest';
import { snapshotFromTree, leakFromScreen } from './buildSnapshot';
import { analyzeMovement, defaultMetrics } from '@/lib/workout/movement-screen';
import { buildMealRx, LEAK_THEMES, LOAD_SLOTS, loadBandFor, mergeGrocery, pickDayPlan, slotFit } from './mealRxBuilder';
import { fulfill, groceryText } from './fulfillment';
import { ELIJAH_RECIPES, KITCHEN_RECIPES, SEED_RECIPES } from './recipes.seed';
import { NON_CLINICAL_DISCLAIMER, type LeakId, type LoadBand, type MealTheme } from './types';

const LEAKS: LeakId[] = ['mid-back', 'knee-valgus', 'hip-drop', 'ankle'];
const THEMES: MealTheme[] = ['recovery', 'protein-rebuild', 'anti-inflammatory', 'hydration-electrolyte', 'carb-timing', 'joint-support'];
const PRQ_FOR: Record<LoadBand, number> = { easy: 0.5, train: 0.7, hard: 0.9 };

describe('FEL Kitchens — MealRx builder (pure)', () => {
  it('maps the load band to this tree\'s PRQ grades (owner decision): < 60 easy, 60–79 train, 80+ hard', () => {
    expect(loadBandFor(0.39)).toBe('easy');   // RECOVERING
    expect(loadBandFor(0.59)).toBe('easy');   // READY
    expect(loadBandFor(0.6)).toBe('train');   // PRIMED
    expect(loadBandFor(0.79)).toBe('train');
    expect(loadBandFor(0.8)).toBe('hard');    // ELITE
  });

  it('divides this tree\'s 0–100 PRQ by 100 and keys the snapshot by scan date', () => {
    const s = snapshotFromTree({ prq0to100: 59, scanDate: '2026-09-05' });
    expect(s.prqScore).toBeCloseTo(0.59);
    expect(s.scanDate).toBe('2026-09-05');
    expect(LEAKS).toContain(s.leak);
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
    expect(rx.dayPlan.length).toBe(LOAD_SLOTS.train.length);
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

describe('FEL Kitchens — recipe catalogue', () => {
  it('has fourteen honest seeds, an empty owner slot for Elijah, and unique ids across the catalogue', () => {
    expect(SEED_RECIPES).toHaveLength(14);
    expect(SEED_RECIPES.every((r) => r.source === 'seed' && !r.athleteNote)).toBe(true);
    expect(Array.isArray(ELIJAH_RECIPES)).toBe(true);
    expect(ELIJAH_RECIPES.every((r) => r.source === 'elijah')).toBe(true);
    expect(KITCHEN_RECIPES.length).toBe(ELIJAH_RECIPES.length + SEED_RECIPES.length);
    expect(new Set(KITCHEN_RECIPES.map((r) => r.id)).size).toBe(KITCHEN_RECIPES.length);
  });

  it('every theme has at least three options, and every recipe has ordinary macros and ingredients', () => {
    for (const t of THEMES) expect(KITCHEN_RECIPES.filter((r) => r.themes.includes(t)).length, t).toBeGreaterThanOrEqual(3);
    for (const r of KITCHEN_RECIPES) {
      expect(r.ingredients.length, r.id).toBeGreaterThan(0);
      expect(r.macros.kcal, r.id).toBeGreaterThan(100);
      expect(r.macros.kcal, r.id).toBeLessThan(900);
      // 4 / 4 / 9 kcal per gram, within ordinary rounding of the stated calories
      const fromMacros = r.macros.proteinG * 4 + r.macros.carbG * 4 + r.macros.fatG * 9;
      expect(Math.abs(fromMacros - r.macros.kcal) / r.macros.kcal, r.id).toBeLessThan(0.12);
      expect(r.prepMinutes, r.id).toBeGreaterThan(0);
    }
  });
});

describe('FEL Kitchens — day plan variety and session slots', () => {
  it('never uses a recipe twice in a day plan, for every leak × band', () => {
    for (const leak of LEAKS) for (const band of Object.keys(PRQ_FOR) as LoadBand[]) {
      const rx = buildMealRx({ signature: { scanDate: 'd', prqScore: PRQ_FOR[band], leak, leakLabel: leak }, recipes: KITCHEN_RECIPES });
      const ids = rx.dayPlan.map((s) => s.recipeId);
      expect(new Set(ids).size, `${leak}/${band}`).toBe(ids.length);
      expect(rx.dayPlan.map((s) => s.slot), `${leak}/${band}`).toEqual(LOAD_SLOTS[band]);
      expect(rx.loadBand).toBe(band);
    }
  });

  it('train and hard days cover pre and post around the session; an easy day does not', () => {
    expect(LOAD_SLOTS.easy).not.toContain('pre');
    expect(LOAD_SLOTS.easy).not.toContain('post');
    for (const band of ['train', 'hard'] as LoadBand[]) {
      expect(LOAD_SLOTS[band]).toContain('pre');
      expect(LOAD_SLOTS[band]).toContain('post');
      for (const leak of LEAKS) {
        const rx = buildMealRx({ signature: { scanDate: 'd', prqScore: PRQ_FOR[band], leak, leakLabel: leak }, recipes: KITCHEN_RECIPES });
        const pre = rx.dayPlan.find((s) => s.slot === 'pre')!;
        const post = rx.dayPlan.find((s) => s.slot === 'post')!;
        expect(pre.themes, `${leak}/${band} pre`).toContain('carb-timing');
        expect(pre.macros.kcal, `${leak}/${band} pre`).toBeLessThanOrEqual(400);
        expect(post.macros.proteinG, `${leak}/${band} post`).toBeGreaterThanOrEqual(20);
        expect(rx.dayPlan.filter((s) => s.slot === 'lunch' || s.slot === 'dinner').every((s) => s.macros.kcal >= 400), `${leak}/${band} plates`).toBe(true);
      }
    }
  });

  it('is deterministic, dedupes catalogue ids, and shrinks gracefully when the catalogue is smaller than the slot plan', () => {
    const themes = LEAK_THEMES['mid-back'];
    expect(pickDayPlan(KITCHEN_RECIPES, themes, 'hard')).toEqual(pickDayPlan(KITCHEN_RECIPES, themes, 'hard'));
    const doubled = [...SEED_RECIPES, ...SEED_RECIPES];
    const plan = pickDayPlan(doubled, themes, 'hard');
    expect(new Set(plan.map((s) => s.recipeId)).size).toBe(plan.length);
    const tiny = pickDayPlan(SEED_RECIPES.slice(0, 2), themes, 'hard');
    expect(tiny.map((s) => s.slot)).toEqual(['breakfast', 'pre']);
    expect(pickDayPlan([], themes, 'easy')).toEqual([]);
    expect(slotFit('snack', SEED_RECIPES.find((r) => r.id === 'seed-electrolyte-melon')!)).toBeGreaterThan(slotFit('snack', SEED_RECIPES.find((r) => r.id === 'seed-chicken-rice')!));
  });

  it('the grocery list is the merged ingredients of exactly the planned recipes', () => {
    const rx = buildMealRx({ signature: { scanDate: 'd', prqScore: 0.9, leak: 'hip-drop', leakLabel: 'Hip drop' }, recipes: KITCHEN_RECIPES });
    const expected = mergeGrocery(rx.dayPlan.flatMap((s) => KITCHEN_RECIPES.find((r) => r.id === s.recipeId)!.ingredients));
    expect(rx.groceryList).toEqual(expected);
    expect(rx.groceryList.every((i) => i.externalSkuHint === null)).toBe(true);
  });
});
