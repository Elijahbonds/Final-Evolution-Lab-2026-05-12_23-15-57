// lib/pipelines/recipeShelf.ts — PIPELINES (owner, 2026-10-06): what the Fuel floor's "Community recipes" shelf says.
// Pure.
//
// The rules the shelf keeps (each a test in recipeShelf.test.ts):
//  - credited: every recipe names its chef, linked to their published card when they have one;
//  - allergens are the CHEF'S DECLARATION, shown as such with a note that FEL has not checked them, and a recipe that
//    declares none says so in words, never as "allergen-free";
//  - never in the MealRx maths: a community recipe has no macros and no themes, so it is shown beside the plan, never
//    folded into it (lib/kitchens/mealRxBuilder.ts reads lib/kitchens/recipes.seed.ts only);
//  - teens see the shelf (owner, 2026-10-06: "teens see approved community recipes"); only adults' recipes are on it.

import { CARD_ALLERGENS, type CardAllergen } from '@/lib/creator/creative-card-types';
import type { RecipeEntry } from './community';

export const SHELF_MAX = 6;
export const STEPS_SHOWN = 6;

export const ALLERGEN_LABEL: Readonly<Record<CardAllergen, string>> = {
  milk: 'Milk', egg: 'Egg', fish: 'Fish', shellfish: 'Shellfish', 'tree-nuts': 'Tree nuts', peanuts: 'Peanuts',
  wheat: 'Wheat', soy: 'Soy', sesame: 'Sesame',
};

export const CHEF_DECLARED_NOTE = 'Allergens as declared by the chef. FEL has not checked this recipe: read every ingredient before you cook it.';
export const NOT_IN_PLAN_NOTE = 'Community recipes sit beside your MealRx plan. They are not part of it and have no macros.';

export interface ShelfItem {
  id: string; title: string; by: string; href: string | null;
  ingredients: string[]; steps: string[]; moreSteps: number; tags: string[];
  /** The chef's own words, e.g. "Chef lists: Milk, Egg" or "The chef listed no allergens". */
  allergenLine: string;
  allergens: string[];
  photoUrl: string | null;
}

export function allergenLine(list: readonly CardAllergen[]): string {
  const known = list.filter((a) => (CARD_ALLERGENS as readonly string[]).includes(a));
  return known.length ? `Chef lists: ${known.map((a) => ALLERGEN_LABEL[a]).join(', ')}` : 'The chef listed no allergens';
}

export function shelfItems(entries: readonly RecipeEntry[]): ShelfItem[] {
  return entries.slice(0, SHELF_MAX).map((r) => ({
    id: r.cardId, title: r.title, by: r.creator.name, href: r.creator.href,
    ingredients: r.ingredients, steps: r.steps.slice(0, STEPS_SHOWN), moreSteps: Math.max(0, r.steps.length - STEPS_SHOWN),
    tags: r.fuelTags, allergenLine: allergenLine(r.allergens), allergens: r.allergens.map((a) => ALLERGEN_LABEL[a]),
    photoUrl: r.photoUrl,
  }));
}
