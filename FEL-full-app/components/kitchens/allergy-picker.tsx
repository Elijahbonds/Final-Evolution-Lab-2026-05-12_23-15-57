'use client';

// The Fuel floor's allergy picker (owner-approved 2026-10-06): the nine major US allergens, picked on THIS device
// (lib/kitchens/allergens.ts, localStorage) and never sent anywhere. The meal builder leaves every recipe that carries
// a picked allergen out; the chef-declared note rides with it.

import { ALLERGENS, ALLERGEN_LABEL, ALLERGEN_NOTE, type Allergen } from '@/lib/kitchens/allergens';

export function AllergyPicker({ avoid, onChange }: { avoid: readonly Allergen[]; onChange: (next: Allergen[]) => void }) {
  const flip = (a: Allergen) => onChange(avoid.includes(a) ? avoid.filter((x) => x !== a) : ALLERGENS.filter((x) => x === a || avoid.includes(x)));
  return (
    <section className="fel-panel mt-4 rounded-2xl p-4" data-testid="allergy-picker">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Allergies · this device only</p>
      <p className="mt-1 text-xs text-white/60">Pick anything you avoid. Recipes that contain it are left out of your plan.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ALLERGENS.map((a) => {
          const on = avoid.includes(a);
          return (
            <button key={a} type="button" role="checkbox" aria-checked={on} onClick={() => flip(a)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${on ? 'border-[#FF3D5E] bg-[#FF3D5E]/15 text-[#FF8FA3]' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>
              {on ? 'NO ' : ''}{ALLERGEN_LABEL[a].toUpperCase()}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-white/45" data-testid="allergen-note">{ALLERGEN_NOTE}</p>
    </section>
  );
}

/** A recipe's declared allergens as small chips, with a warning badge for any the player avoids. */
export function AllergenChips({ allergens, avoid }: { allergens: readonly Allergen[]; avoid: readonly Allergen[] }) {
  const hits = allergens.filter((a) => avoid.includes(a));
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1" data-testid="allergen-chips">
      {hits.length > 0 && (
        <span className="rounded-md border border-[#FF3D5E]/50 bg-[#FF3D5E]/15 px-1.5 py-0.5 text-[10px] font-black text-[#FF8FA3]" data-testid="allergy-hit">
          CONTAINS {hits.map((a) => ALLERGEN_LABEL[a].toUpperCase()).join(', ')} · ON YOUR AVOID LIST
        </span>
      )}
      {allergens.length === 0
        ? <span className="text-[10px] text-white/40">No major allergens declared</span>
        : allergens.filter((a) => !hits.includes(a)).map((a) => <span key={a} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-white/60">{ALLERGEN_LABEL[a]}</span>)}
    </div>
  );
}
