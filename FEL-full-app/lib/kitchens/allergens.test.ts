// FEL Kitchens allergens (owner-approved 2026-10-06, moderate): every recipe is labelled with the nine major US
// allergens it contains, the player's pick (this device only) filters flagged recipes out of the meal builder, and the
// chef-declared note rides wherever allergens show.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALLERGENS, ALLERGEN_NOTE, ALLERGY_STORAGE_KEY, allergyHits, filterRecipesForAllergies, isAllergen, loadAllergies, saveAllergies, type Allergen,
} from './allergens';
import { KITCHEN_RECIPES, SEED_RECIPES } from './recipes.seed';
import { buildMealRx } from './mealRxBuilder';
import { fuelAudience } from './audience';
import type { LeakId } from './types';

const ROOT = path.join(__dirname, '../..');
const src = (f: string): string => readFileSync(path.join(ROOT, f), 'utf8');
const sig = (prqScore: number, leak: LeakId = 'knee-valgus') => ({ scanDate: '2026-10-06', prqScore, leak, leakLabel: leak });

/** What each seed's ingredients imply — the labels must cover at least this (a second, independent reading). */
const IMPLIED: [RegExp, Allergen][] = [
  [/\bmilk\b(?<!oat milk)|yogurt|whey|cheese|butter/i, 'milk'], [/\beggs?\b/i, 'egg'], [/salmon|tuna|sardine|cod/i, 'fish'],
  [/shrimp|prawn|crab|lobster/i, 'shellfish'], [/walnut|almond|cashew|pecan|pistachio|hazelnut/i, 'tree-nuts'], [/peanut/i, 'peanuts'],
  [/sourdough|rye bread|wheat|flour|pasta|soy sauce/i, 'wheat'], [/soy|tofu|edamame/i, 'soy'], [/sesame|tahini/i, 'sesame'],
];

describe('every recipe carries its allergens', () => {
  it('the nine major US allergens, nothing else', () => {
    expect([...ALLERGENS]).toEqual(['milk', 'egg', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat', 'soy', 'sesame']);
  });
  it('every catalogue recipe is labelled, with known allergens only, and every allergen its ingredients imply', () => {
    expect(SEED_RECIPES.length).toBe(14);
    for (const r of KITCHEN_RECIPES) {
      expect(Array.isArray(r.allergens), r.id).toBe(true);
      for (const a of r.allergens) expect(isAllergen(a), `${r.id} ${a}`).toBe(true);
      const names = r.ingredients.map((i) => i.name).join(' · ');
      for (const [re, a] of IMPLIED) {
        const hit = names.split(' · ').some((n) => re.test(n) && !(a === 'milk' && /oat milk|coconut/i.test(n)));
        if (hit) expect(r.allergens, `${r.id}: ${names}`).toContain(a);
      }
    }
  });
});

describe('the allergy filter', () => {
  it('splits the catalogue: safe has none of the picked allergens, flagged has at least one', () => {
    const { safe, flagged } = filterRecipesForAllergies(KITCHEN_RECIPES, ['milk', 'fish']);
    expect(safe.length + flagged.length).toBe(KITCHEN_RECIPES.length);
    for (const r of safe) expect(allergyHits(r, ['milk', 'fish'])).toEqual([]);
    for (const r of flagged) expect(allergyHits(r, ['milk', 'fish']).length).toBeGreaterThan(0);
    expect(flagged.map((r) => r.id)).toContain('seed-greek-yogurt');
    expect(flagged.map((r) => r.id)).toContain('seed-salmon-greens');
    expect(filterRecipesForAllergies(KITCHEN_RECIPES, []).flagged).toEqual([]);
  });

  it('the meal builder never plans a flagged recipe, and its grocery list holds none of their ingredients', () => {
    for (const avoid of [['milk'], ['fish', 'wheat'], ['milk', 'egg', 'fish', 'wheat', 'soy', 'tree-nuts']] as Allergen[][]) {
      for (const prq of [0.3, 0.7, 0.9]) {
        const rx = buildMealRx({ signature: sig(prq), recipes: KITCHEN_RECIPES, avoid });
        expect(rx.dayPlan.length, `${avoid} ${prq}`).toBeGreaterThan(0);
        for (const s of rx.dayPlan) {
          const r = KITCHEN_RECIPES.find((x) => x.id === s.recipeId)!;
          expect(allergyHits(r, avoid), `${s.recipeId} avoid ${avoid}`).toEqual([]);
          expect(s.allergens).toEqual(r.allergens);   // the slot carries its labels for the UI
        }
        if (avoid.includes('milk')) expect(rx.groceryList.map((g) => g.name)).not.toContain('greek yogurt');
      }
    }
  });

  it('with no pick the builder is unchanged: the same plan as before the filter existed', () => {
    const a = buildMealRx({ signature: sig(0.7), recipes: KITCHEN_RECIPES, now: new Date(0) });
    const b = buildMealRx({ signature: sig(0.7), recipes: KITCHEN_RECIPES, now: new Date(0), avoid: [] });
    expect(b.dayPlan).toEqual(a.dayPlan);
    expect(b.groceryList).toEqual(a.groceryList);
  });
});

describe('the pick lives on this device', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('round-trips through localStorage, cleaned and ordered; a broken or throwing store reads as no pick', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } });
    expect(loadAllergies()).toEqual([]);
    saveAllergies(['soy', 'milk', 'soy']);
    expect(JSON.parse(store.get(ALLERGY_STORAGE_KEY)!)).toEqual(['milk', 'soy']);
    expect(loadAllergies()).toEqual(['milk', 'soy']);
    store.set(ALLERGY_STORAGE_KEY, '["milk","bogus",3]');
    expect(loadAllergies()).toEqual(['milk']);
    store.set(ALLERGY_STORAGE_KEY, '{not json');
    expect(loadAllergies()).toEqual([]);
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); } } });
    expect(loadAllergies()).toEqual([]);
  });
  it('nothing about the pick is sent: the allergen module and the picker make no request', () => {
    for (const f of ['lib/kitchens/allergens.ts', 'components/kitchens/allergy-picker.tsx']) expect(src(f), f).not.toMatch(/fetch\(|prisma|\/api\//);
  });
});

describe('the chef-declared note shows wherever allergens show', () => {
  it('the picker, the adult day plan and the youth floor all carry ALLERGEN_NOTE', () => {
    expect(ALLERGEN_NOTE).toMatch(/chef-declared/);
    expect(ALLERGEN_NOTE).toMatch(/check the labels/);
    expect(src('components/kitchens/allergy-picker.tsx')).toMatch(/\{ALLERGEN_NOTE\}/);
    expect(src('components/kitchens/fuel-view.tsx')).toMatch(/\{ALLERGEN_NOTE\}/);
    expect(src('components/kitchens/fuel-view.tsx')).toMatch(/<AllergyPicker avoid=\{avoid\} onChange=\{applyAllergies\} \/>/);
    expect(src('components/kitchens/fuel-view.tsx')).toMatch(/<AllergenChips allergens=/);
    expect(src('components/kitchens/fuel-youth-view.tsx')).toMatch(/<AllergyPicker avoid=\{avoid\} onChange=\{pick\} \/>/);
  });
});

describe('under 18 the Fuel floor is recipes and cooking only', () => {
  const now = new Date('2026-10-06');
  it('only a verified adult (more than 18 years by birth year) gets the adult floor; a blank year is youth', () => {
    expect(fuelAudience(1990, now)).toBe('adult');
    expect(fuelAudience(2007, now)).toBe('adult');   // 19-year gap
    expect(fuelAudience(2008, now)).toBe('youth');   // an exact 18 gap may still be 17
    expect(fuelAudience(2012, now)).toBe('youth');
    expect(fuelAudience(null, now)).toBe('youth');
    expect(fuelAudience(undefined, now)).toBe('youth');
  });
  it('the page picks the view from the server-read birth year', () => {
    const page = src('app/kitchens/fuel/page.tsx');
    expect(page).toMatch(/select: \{ dobYear: true \}/);
    expect(page).toMatch(/fuelAudience\(user\?\.dobYear \?\? null\)/);
    expect(page).toMatch(/audience === 'adult' \? <FuelView \/> : <FuelYouthView \/>/);
  });
  it('the youth view shows no calorie or macro numbers, no PRQ or body read, no scoring and no weight framing', () => {
    const code = src('components/kitchens/fuel-youth-view.tsx').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/macros|kcal|calorie|proteinG|carbG|fatG/i);
    expect(code).not.toMatch(/prq|YourBuildPanel|LEAK_|loadBand|\/api\/profile/i);
    expect(code).not.toMatch(/score|NutritionScore|FoodScan/i);
    expect(code).not.toMatch(/weight|lose|cut\b|diet/i);
    expect(code).toMatch(/r\.prepMinutes/);
    expect(code).toMatch(/r\.ingredients\.map/);
  });
});
