'use client';

// PowerEstimate — peak power from the best jump and a body weight the athlete may type (JUMP-PRO 2, 2026-10-25; owner:
// "body weight and power: optional, adults only; teens are never asked and never shown power").
//
// ADULTS ONLY: it renders nothing unless `adult` (the caller's verified 18+; the jump result never mounts it for a kid or
// a teen either). The weight is never stored or sent: it lives in this component's state and is gone when the page is
// left. Labelled an estimate, with its ± (lib/jump/power.ts: Sayers 1999, ±355 W standard error).
import { useState } from 'react';
import { lbToKg, sayersPower } from '@/lib/jump/power';

export function PowerEstimate({ adult, heightCm, plusMinusCm }: { adult: boolean; heightCm: number | null; plusMinusCm?: number | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>('lb');
  if (!adult || heightCm === null) return null;
  if (!open) {
    return (
      <button type="button" data-power-open onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">
        Estimate my jump power (optional)
      </button>
    );
  }
  const n = Number(value);
  const massKg = value.trim() && Number.isFinite(n) ? (unit === 'lb' ? lbToKg(n) : n) : null;
  const p = sayersPower({ adult, heightCm, plusMinusCm: plusMinusCm ?? null, massKg });
  return (
    <section data-power className="space-y-3 rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="text-[18px] font-black text-white">Jump power (estimate)</h2>
      <p className="text-[16px] text-white/70">Optional. Your weight stays on this page: it is not saved or sent.</p>
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Body weight</span>
          <input data-power-weight inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Body weight"
            className="min-h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-[16px] text-white" />
        </label>
        <div role="group" aria-label="Unit" className="flex">
          {(['lb', 'kg'] as const).map((u) => (
            <button key={u} type="button" data-power-unit={u} aria-pressed={unit === u} onClick={() => setUnit(u)}
              className={`min-h-12 min-w-12 px-3 text-[16px] font-bold ${unit === u ? 'rounded-2xl bg-white text-black' : 'text-white/80'}`}>{u}</button>
          ))}
        </div>
      </div>
      {p.ok ? (
        <p data-power-watts className="text-[16px] text-white/90">
          <span className="text-[28px] font-black text-white">{p.watts.toLocaleString()} W</span> ±{p.plusMinusW} · {p.wattsPerKg} W per kg
          <span className="block text-white/70">Estimated peak power from your best jump (Sayers formula). An estimate, not a force-plate reading.</span>
        </p>
      ) : massKg !== null && p.why === 'massOutOfRange' ? <p className="text-[16px] text-[#FFB020]">That weight is outside what the formula covers.</p> : null}
    </section>
  );
}
