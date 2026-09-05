'use client';

// FEL Kitchens — the Fuel floor (/kitchens/fuel). Reads the Build snapshot (read-only: this tree's PRQ + the movement
// screen), builds today's MealRx through KitchenStore, and shows the day plan, the grocery checklist and the fulfilment
// paths (list live; Instacart and Drive locked). Never on the Venice court; modes never call this.

import { useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { KitchenStore } from '@/lib/kitchens/KitchenStore';
import { snapshotFromTree } from '@/lib/kitchens/buildSnapshot';
import { LEAK_ONE_LINER } from '@/lib/kitchens/mealRxBuilder';
import { availablePaths } from '@/lib/kitchens/fulfillment';
import type { FulfillmentPath, MealRx } from '@/lib/kitchens/types';
import { GroceryList } from './grocery-list';

const THEME_LABEL: Record<string, string> = {
  recovery: 'Recovery', 'protein-rebuild': 'Protein rebuild', 'anti-inflammatory': 'Anti-inflammatory',
  'hydration-electrolyte': 'Hydration + electrolytes', 'carb-timing': 'Carb timing', 'joint-support': 'Joint support',
};
const BAND_LABEL: Record<string, string> = { easy: 'EASY DAY', train: 'TRAIN DAY', hard: 'HARD DAY' };

export function FuelView() {
  const [rx, setRx] = useState<MealRx | null>(null);
  const [prq, setPrq] = useState<number | null>(null);
  const [path, setPath] = useState<FulfillmentPath>('list');
  const [error, setError] = useState('');

  const rebuild = async () => {
    setError('');
    try {
      const r = await fetch('/api/profile', { cache: 'no-store' });
      const j = r.ok ? ((await r.json()) as { prq?: number }) : {};
      const score = typeof j.prq === 'number' ? j.prq : 0;
      setPrq(score);
      // The Build store is read-only upstream; the snapshot is built from the profile's PRQ and the default movement
      // screen until a scan lands. Keyed by today's date, so a rebuild in the same day is idempotent.
      setRx(KitchenStore.ingest(snapshotFromTree({ prq0to100: score })));
    } catch { setError('Could not read your Build right now.'); }
  };

  useEffect(() => {
    const s = KitchenStore.snapshot();
    setPath(s.preferredFulfillment);
    if (s.current) setRx(s.current); else void rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (p: FulfillmentPath, available: boolean) => {
    if (!available) return;
    KitchenStore.setPreferredFulfillment(p); setPath(p);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">FEL Kitchens · Fuel</p>
          <h1 className="fel-heading mt-1 text-2xl font-bold text-white">Today&apos;s fuel</h1>
          <p className="mt-1 text-sm text-white/60">Your Build&apos;s current leak and load, as a plate. Food tags only.</p>
        </div>
        <button type="button" onClick={rebuild} className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10">
          <RefreshCw className="h-3.5 w-3.5" /> Rebuild
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[#FF3D5E]">{error}</p>}

      {rx && (
        <>
          <section className="fel-panel mt-4 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#A855F7]/40 bg-[#A855F7]/10 px-2.5 py-1 text-xs font-bold text-[#A855F7]">LEAK · {rx.leakLabel.toUpperCase()}</span>
              <span className="rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1 text-xs font-bold text-[#00E5FF]">{BAND_LABEL[rx.loadBand]}</span>
              {prq != null && <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-xs text-white/70">PRQ {prq}</span>}
              <span className="font-mono text-[11px] text-white/40">scan {rx.sourceScanDate}</span>
            </div>
            <p className="mt-3 text-sm text-white/85">{LEAK_ONE_LINER[rx.leak]}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rx.themes.map((t) => <span key={t} className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70">{THEME_LABEL[t] ?? t}</span>)}
            </div>
          </section>

          <section className="mt-4">
            <p className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Day plan</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {rx.dayPlan.map((s) => (
                <li key={`${s.slot}-${s.recipeId}`} className="fel-panel rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#00FF9D]">{s.slot}</span>
                    <span className="font-mono text-[11px] text-white/50">{s.minutes} min</span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-white">{s.title}</p>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-white/60">{s.macros.kcal} kcal · P {s.macros.proteinG} · C {s.macros.carbG} · F {s.macros.fatG}</p>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-4">
            <GroceryList rxId={rx.id} items={rx.groceryList} />
          </div>

          <section className="mt-4">
            <p className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Get it</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {availablePaths().map((o) => (
                <button key={o.path} type="button" onClick={() => choose(o.path, o.available)} disabled={!o.available}
                  className={`fel-panel rounded-xl p-3 text-left ${path === o.path && o.available ? 'border border-[#00E5FF]/50' : 'border border-transparent'} ${o.available ? 'hover:bg-white/[0.06]' : 'opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{o.label}</span>
                    {!o.available && <Lock className="h-3.5 w-3.5 text-white/40" />}
                  </div>
                  <p className="mt-1 text-[11px] text-white/55">{o.available ? 'Live now — copy or share the list' : o.note}</p>
                </button>
              ))}
            </div>
          </section>

          <p className="mt-6 pb-4 text-center text-[11px] leading-relaxed text-white/40">{rx.disclaimer}</p>
        </>
      )}
    </div>
  );
}
