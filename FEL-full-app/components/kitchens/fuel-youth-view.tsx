'use client';

// FEL Kitchens — the Fuel floor for players under 18 (owner-approved 2026-10-06): recipes and cooking only. No calorie
// or macro numbers, no load band or plate chosen from a body read, no food scoring, no weight framing — just what to
// cook, how long it takes and what goes in it, with the allergy picker (this device only) and the allergen labels.
// lib/kitchens/audience.ts says who sees it.

import { useEffect, useState } from 'react';
import { KITCHEN_RECIPES } from '@/lib/kitchens/recipes.seed';
import { filterRecipesForAllergies, loadAllergies, saveAllergies, type Allergen } from '@/lib/kitchens/allergens';
import { AllergenChips, AllergyPicker } from './allergy-picker';

export function FuelYouthView() {
  const [avoid, setAvoid] = useState<Allergen[]>([]);
  useEffect(() => { setAvoid(loadAllergies()); }, []);
  const pick = (next: Allergen[]) => { setAvoid(next); saveAllergies(next); };
  const { safe, flagged } = filterRecipesForAllergies(KITCHEN_RECIPES, avoid);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4" data-testid="fuel-youth">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">FEL Kitchens · Cook</p>
      <h1 className="fel-heading mt-1 text-2xl font-bold text-white">Things to cook</h1>
      <p className="mt-1 text-sm text-white/60">Simple recipes, how long they take and what goes in them.</p>

      <AllergyPicker avoid={avoid} onChange={pick} />

      {flagged.length > 0 && (
        <p className="mt-3 px-1 text-xs text-white/50" data-testid="allergy-hidden">
          {flagged.length} recipe{flagged.length === 1 ? '' : 's'} left out for your allergy list.
        </p>
      )}

      <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="youth-recipes">
        {safe.map((r) => (
          <li key={r.id} className="fel-panel rounded-xl p-3" data-recipe={r.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white">{r.title}</p>
              <span className="font-mono text-[11px] text-white/50">{r.prepMinutes} min</span>
            </div>
            <AllergenChips allergens={r.allergens} avoid={avoid} />
            <ul className="mt-2 space-y-0.5 text-[12px] text-white/70">
              {r.ingredients.map((i) => (
                <li key={`${r.id}-${i.name}`}>{i.qty} {i.unit === 'each' ? '' : `${i.unit} `}{i.name}{i.optional ? ' (optional)' : ''}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
