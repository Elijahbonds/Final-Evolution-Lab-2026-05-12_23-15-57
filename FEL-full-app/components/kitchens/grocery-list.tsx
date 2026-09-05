'use client';

// FEL Kitchens — grocery list v0: an in-app checklist with copy / share from MealRx.groceryList. Zero partners.
// Checked state is a per-viewer convenience in localStorage, keyed by the MealRx id.

import { useEffect, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { groceryText } from '@/lib/kitchens/fulfillment';
import type { GroceryItem } from '@/lib/kitchens/types';

const CHECK_KEY = (rxId: string) => `fel-kitchen-checks:${rxId}`;

export function GroceryList({ rxId, items }: { rxId: string; items: GroceryItem[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    try { setChecked(JSON.parse(localStorage.getItem(CHECK_KEY(rxId)) ?? '{}')); } catch { setChecked({}); }
  }, [rxId]);

  const toggle = (key: string) => {
    const next = { ...checked, [key]: !checked[key] };
    setChecked(next);
    try { localStorage.setItem(CHECK_KEY(rxId), JSON.stringify(next)); } catch { /* convenience only */ }
  };

  const text = groceryText(items);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setNote('Copied'); }
    catch { setNote('Copy blocked — select the list and copy'); }
    setTimeout(() => setNote(''), 1800);
  };
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: 'FEL Kitchens · grocery list', text }); return; } catch { /* dismissed */ } }
    await copy();
  };

  const done = items.filter((i) => checked[`${i.name}|${i.unit}`]).length;

  return (
    <section className="fel-panel rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Grocery list</p>
          <p className="mt-0.5 font-mono text-xs text-white/60">{done} / {items.length} in the basket</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copy} className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10">
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <button type="button" onClick={share} className="flex items-center gap-1 rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1.5 text-xs font-bold text-[#00E5FF] hover:bg-[#00E5FF]/20">
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
        </div>
      </div>
      {note && <p className="mt-2 text-xs text-[#00FF9D]">{note}</p>}
      <ul className="mt-3 divide-y divide-white/[0.06]">
        {items.map((i) => {
          const key = `${i.name}|${i.unit}`;
          const on = Boolean(checked[key]);
          return (
            <li key={key}>
              <button type="button" onClick={() => toggle(key)} className="flex w-full items-center gap-3 py-2 text-left">
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? 'border-[#00FF9D] bg-[#00FF9D]/20 text-[#00FF9D]' : 'border-white/25 text-transparent'}`}>
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className={`flex-1 text-sm ${on ? 'text-white/40 line-through' : 'text-white/90'}`}>
                  {i.name}{i.optional ? <span className="ml-1 text-white/40">(optional)</span> : null}
                </span>
                <span className="font-mono text-xs tabular-nums text-white/60">{i.qty} {i.unit}</span>
                {i.aisleHint && <span className="hidden text-[10px] uppercase tracking-wider text-white/35 sm:inline">{i.aisleHint}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
