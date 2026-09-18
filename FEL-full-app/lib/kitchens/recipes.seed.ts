// FEL Kitchens — the recipe catalogue. Two lists, one export the store reads:
//   ELIJAH_RECIPES  (source 'elijah')  — the owner's recipes and voice. Empty until Elijah hands them over.
//   SEED_RECIPES    (source 'seed')    — fourteen placeholders with honest, ordinary macros and food tags only; every
//                                        MealTheme has at least three options so a day plan never repeats a plate.
// The cookbook lane's recipes (source 'blueprint') join the same way when they exist. No athlete notes on the seeds.

import type { Recipe } from './types';

/**
 * ELIJAH'S RECIPES GO HERE. Each entry is a `Recipe` with `source: 'elijah'` and, when he wants it, an `athleteNote`
 * in his voice. They rank ahead of the seeds on a tie. Ids should be `elijah-<slug>` and unique across the catalogue.
 * Keep the food tags honest — themes describe the plate, not a treatment (docs/SPEC-FEL-KITCHENS.md).
 */
export const ELIJAH_RECIPES: Recipe[] = [
  // e.g. { id: 'elijah-…', title: '…', prepMinutes: 0, macros: { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 }, themes: [], ingredients: [], athleteNote: '…', source: 'elijah' },
];

export const SEED_RECIPES: Recipe[] = [
  {
    id: 'seed-oats-berries', title: 'Overnight oats, berries, whey', prepMinutes: 5,
    macros: { kcal: 520, proteinG: 34, carbG: 68, fatG: 12 }, themes: ['carb-timing', 'recovery'], source: 'seed',
    ingredients: [
      { name: 'rolled oats', qty: 80, unit: 'g', aisleHint: 'cereal' }, { name: 'mixed berries', qty: 120, unit: 'g', aisleHint: 'frozen' },
      { name: 'whey protein', qty: 1, unit: 'each', aisleHint: 'supplements' }, { name: 'milk', qty: 250, unit: 'ml', aisleHint: 'dairy' },
    ],
  },
  {
    id: 'seed-salmon-greens', title: 'Salmon, sweet potato, greens', prepMinutes: 25,
    macros: { kcal: 640, proteinG: 42, carbG: 48, fatG: 26 }, themes: ['anti-inflammatory', 'protein-rebuild', 'joint-support'], source: 'seed',
    ingredients: [
      { name: 'salmon fillet', qty: 180, unit: 'g', aisleHint: 'fish' }, { name: 'sweet potato', qty: 250, unit: 'g', aisleHint: 'produce' },
      { name: 'spinach', qty: 100, unit: 'g', aisleHint: 'produce' }, { name: 'olive oil', qty: 1, unit: 'tbsp', aisleHint: 'oils' },
    ],
  },
  {
    id: 'seed-chicken-rice', title: 'Chicken, rice, broccoli', prepMinutes: 30,
    macros: { kcal: 610, proteinG: 48, carbG: 62, fatG: 14 }, themes: ['protein-rebuild', 'carb-timing'], source: 'seed',
    ingredients: [
      { name: 'chicken breast', qty: 200, unit: 'g', aisleHint: 'poultry' }, { name: 'jasmine rice', qty: 90, unit: 'g', aisleHint: 'grains' },
      { name: 'broccoli', qty: 150, unit: 'g', aisleHint: 'produce' }, { name: 'soy sauce', qty: 1, unit: 'tbsp', aisleHint: 'sauces', optional: true },
    ],
  },
  {
    id: 'seed-greek-yogurt', title: 'Greek yogurt, honey, walnuts', prepMinutes: 3,
    macros: { kcal: 330, proteinG: 22, carbG: 28, fatG: 14 }, themes: ['recovery', 'protein-rebuild'], source: 'seed',
    ingredients: [
      { name: 'greek yogurt', qty: 200, unit: 'g', aisleHint: 'dairy' }, { name: 'honey', qty: 1, unit: 'tbsp', aisleHint: 'baking' },
      { name: 'walnuts', qty: 25, unit: 'g', aisleHint: 'nuts' },
    ],
  },
  {
    id: 'seed-electrolyte-melon', title: 'Watermelon, lime, salt', prepMinutes: 5,
    macros: { kcal: 140, proteinG: 2, carbG: 34, fatG: 0 }, themes: ['hydration-electrolyte'], source: 'seed',
    ingredients: [
      { name: 'watermelon', qty: 400, unit: 'g', aisleHint: 'produce' }, { name: 'lime', qty: 1, unit: 'each', aisleHint: 'produce' },
      { name: 'sea salt', qty: 1, unit: 'tsp', aisleHint: 'spices' },
    ],
  },
  {
    id: 'seed-turmeric-lentils', title: 'Turmeric lentils, rice, yogurt', prepMinutes: 35,
    macros: { kcal: 580, proteinG: 26, carbG: 88, fatG: 12 }, themes: ['anti-inflammatory', 'joint-support', 'carb-timing'], source: 'seed',
    ingredients: [
      { name: 'red lentils', qty: 120, unit: 'g', aisleHint: 'grains' }, { name: 'jasmine rice', qty: 80, unit: 'g', aisleHint: 'grains' },
      { name: 'turmeric', qty: 1, unit: 'tsp', aisleHint: 'spices' }, { name: 'greek yogurt', qty: 100, unit: 'g', aisleHint: 'dairy' },
      { name: 'onion', qty: 1, unit: 'each', aisleHint: 'produce' },
    ],
  },
  {
    id: 'seed-eggs-avocado', title: 'Eggs, avocado, sourdough', prepMinutes: 12,
    macros: { kcal: 560, proteinG: 26, carbG: 40, fatG: 30 }, themes: ['recovery', 'protein-rebuild'], source: 'seed',
    ingredients: [
      { name: 'eggs', qty: 3, unit: 'each', aisleHint: 'dairy' }, { name: 'avocado', qty: 1, unit: 'each', aisleHint: 'produce' },
      { name: 'sourdough', qty: 2, unit: 'each', aisleHint: 'bakery' },
    ],
  },
  {
    id: 'seed-banana-shake', title: 'Banana, whey, oat milk shake', prepMinutes: 4,
    macros: { kcal: 380, proteinG: 30, carbG: 48, fatG: 6 }, themes: ['carb-timing', 'hydration-electrolyte', 'recovery'], source: 'seed',
    ingredients: [
      { name: 'banana', qty: 1, unit: 'each', aisleHint: 'produce' }, { name: 'whey protein', qty: 1, unit: 'each', aisleHint: 'supplements' },
      { name: 'oat milk', qty: 300, unit: 'ml', aisleHint: 'dairy' },
    ],
  },
  {
    id: 'seed-tuna-quinoa', title: 'Tuna, quinoa, cucumber, olive oil', prepMinutes: 15,
    macros: { kcal: 540, proteinG: 40, carbG: 52, fatG: 16 }, themes: ['protein-rebuild', 'anti-inflammatory'], source: 'seed',
    ingredients: [
      { name: 'tinned tuna', qty: 2, unit: 'each', aisleHint: 'tinned' }, { name: 'quinoa', qty: 90, unit: 'g', aisleHint: 'grains' },
      { name: 'cucumber', qty: 1, unit: 'each', aisleHint: 'produce' }, { name: 'olive oil', qty: 1, unit: 'tbsp', aisleHint: 'oils' },
      { name: 'lemon', qty: 1, unit: 'each', aisleHint: 'produce', optional: true },
    ],
  },
  {
    id: 'seed-ginger-chicken-soup', title: 'Ginger chicken broth, noodles, greens', prepMinutes: 30,
    macros: { kcal: 430, proteinG: 32, carbG: 46, fatG: 10 }, themes: ['anti-inflammatory', 'hydration-electrolyte', 'joint-support'], source: 'seed',
    ingredients: [
      { name: 'chicken thigh', qty: 180, unit: 'g', aisleHint: 'poultry' }, { name: 'chicken stock', qty: 750, unit: 'ml', aisleHint: 'soups' },
      { name: 'rice noodles', qty: 80, unit: 'g', aisleHint: 'grains' }, { name: 'fresh ginger', qty: 20, unit: 'g', aisleHint: 'produce' },
      { name: 'bok choy', qty: 150, unit: 'g', aisleHint: 'produce' }, { name: 'sea salt', qty: 1, unit: 'tsp', aisleHint: 'spices' },
    ],
  },
  {
    id: 'seed-coconut-water-orange', title: 'Coconut water, orange, pinch of salt', prepMinutes: 3,
    macros: { kcal: 160, proteinG: 2, carbG: 38, fatG: 0 }, themes: ['hydration-electrolyte'], source: 'seed',
    ingredients: [
      { name: 'coconut water', qty: 400, unit: 'ml', aisleHint: 'drinks' }, { name: 'orange', qty: 1, unit: 'each', aisleHint: 'produce' },
      { name: 'sea salt', qty: 0.25, unit: 'tsp', aisleHint: 'spices' },
    ],
  },
  {
    id: 'seed-sardines-toast', title: 'Sardines, tomato, rye toast', prepMinutes: 8,
    macros: { kcal: 450, proteinG: 30, carbG: 34, fatG: 20 }, themes: ['joint-support', 'anti-inflammatory', 'protein-rebuild'], source: 'seed',
    ingredients: [
      { name: 'tinned sardines', qty: 1, unit: 'each', aisleHint: 'tinned' }, { name: 'rye bread', qty: 2, unit: 'each', aisleHint: 'bakery' },
      { name: 'tomato', qty: 1, unit: 'each', aisleHint: 'produce' }, { name: 'lemon', qty: 1, unit: 'each', aisleHint: 'produce', optional: true },
    ],
  },
  {
    id: 'seed-beef-potato-bowl', title: 'Lean beef, potatoes, peppers', prepMinutes: 30,
    macros: { kcal: 650, proteinG: 45, carbG: 60, fatG: 22 }, themes: ['protein-rebuild', 'carb-timing'], source: 'seed',
    ingredients: [
      { name: 'lean beef mince', qty: 180, unit: 'g', aisleHint: 'meat' }, { name: 'potatoes', qty: 300, unit: 'g', aisleHint: 'produce' },
      { name: 'bell pepper', qty: 1, unit: 'each', aisleHint: 'produce' }, { name: 'onion', qty: 1, unit: 'each', aisleHint: 'produce' },
      { name: 'olive oil', qty: 1, unit: 'tbsp', aisleHint: 'oils' },
    ],
  },
  {
    id: 'seed-rice-cakes-honey', title: 'Rice cakes, honey, banana', prepMinutes: 3,
    macros: { kcal: 260, proteinG: 3, carbG: 60, fatG: 1 }, themes: ['carb-timing'], source: 'seed',
    ingredients: [
      { name: 'rice cakes', qty: 3, unit: 'each', aisleHint: 'snacks' }, { name: 'honey', qty: 1, unit: 'tbsp', aisleHint: 'baking' },
      { name: 'banana', qty: 1, unit: 'each', aisleHint: 'produce' },
    ],
  },
];

/** What the store reads: Elijah's recipes first (they win ties), then the seeds. Ids are unique across both. */
export const KITCHEN_RECIPES: Recipe[] = [...ELIJAH_RECIPES, ...SEED_RECIPES];
