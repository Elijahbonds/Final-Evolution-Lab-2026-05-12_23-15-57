// FEL Kitchens — seed recipes. Placeholders with honest, ordinary macros and food tags only; the first real 7–14
// recipes are Elijah's (source 'elijah') and the cookbook lane's (source 'blueprint'). No athlete notes here on purpose.

import type { Recipe } from './types';

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
];
