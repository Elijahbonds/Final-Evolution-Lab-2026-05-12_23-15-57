'use client';

// FvProfile — power from the jump tests' reads, and a simple force-velocity profile when the athlete did loaded and
// unloaded jumps (JUMP-TESTS, owner scope addition 2026-10-25). Every number is an estimate and says so.
//
// ADULTS ONLY: renders nothing unless `adult` (the jump tests mount only on an adult's result; lib/jump/velocity.ts
// refuses `adult: false` before it reads a weight). THE WEIGHT is typed here, used here, and gone when the page is left:
// never kept, never sent (lib/jump/power.ts's rule). Without it there is no power of any kind on the page.
import { useState } from 'react';
import { lbToKg } from '@/lib/jump/power';
import { fvProfile, jumpPower } from '@/lib/jump/velocity';

export interface FvRead { id: string; label: string; loadKg: number; heightCm: number; plusMinusCm: number | null; pushOffCm: number | null; cmj: boolean }

const FV_WHY = {
  tooFew: 'Read at least two jumps, one with no load and one holding a load, to see your force-velocity profile.',
  oneLoad: 'Every jump so far had the same load. Add a jump with a different load (for example a weighted vest or a bar).',
  notFv: 'These jumps do not make a profile (the heavier load did not slow you down). Try loads further apart.',
} as const;

export function FvProfile({ adult, reads }: { adult: boolean; reads: readonly FvRead[] }) {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>('lb');
  if (!adult || !reads.length) return null;
  const n = Number(value);
  const massKg = value.trim() && Number.isFinite(n) ? (unit === 'lb' ? lbToKg(n) : n) : null;
  const pts = reads.filter((r) => r.pushOffCm !== null).map((r) => ({ loadKg: r.loadKg, heightCm: r.heightCm, pushOffCm: r.pushOffCm! }));
  const fv = massKg !== null ? fvProfile({ adult, massKg, points: pts }) : null;
  return (
    <section data-fv className="space-y-3 rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="text-[18px] font-black text-white">Power and force-velocity (estimates)</h2>
      <p className="text-[16px] leading-snug text-white/70">Optional. Type your body weight to see power. It stays on this page: it is not saved or sent.</p>
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">Body weight</span>
          <input data-fv-weight inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Body weight"
            className="min-h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-[16px] text-white" />
        </label>
        <div role="group" aria-label="Unit" className="flex">
          {(['lb', 'kg'] as const).map((u) => (
            <button key={u} type="button" data-fv-unit={u} aria-pressed={unit === u} onClick={() => setUnit(u)}
              className={`min-h-12 min-w-12 px-3 text-[16px] font-bold ${unit === u ? 'rounded-2xl bg-white text-black' : 'text-white/80'}`}>{u}</button>
          ))}
        </div>
      </div>
      {massKg !== null ? (
        <ul data-fv-reads className="space-y-1.5">
          {reads.map((r) => {
            const p = jumpPower({ adult, massKg, loadKg: r.loadKg, heightCm: r.heightCm, plusMinusCm: r.plusMinusCm, pushOffCm: r.pushOffCm, kind: r.cmj ? 'cmj' : 'other' });
            if (!p.ok) return p.why === 'massOutOfRange' ? <li key={r.id} className="text-[16px] text-[#FFB020]">That weight is outside what the formulas cover.</li> : null;
            return (
              <li key={r.id} data-fv-read className="text-[16px] text-white/85">
                <span className="font-bold text-white">{r.label}</span>{r.loadKg > 0 ? ` + ${Math.round(r.loadKg)} kg` : ''}:{' '}
                {p.p ? <>peak {p.p.peakW.toLocaleString()} W ±{p.p.peakPlusMinusW}</> : null}
                {p.p && p.mean ? ' · ' : null}
                {p.mean ? <>mean push {p.mean.powerW.toLocaleString()} W, {p.mean.forceN.toLocaleString()} N</> : null}
                {!p.p && !p.mean ? 'no push-off read, so no power' : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {fv ? (fv.ok ? (
        <div data-fv-profile className="rounded-2xl border border-white/10 p-3 text-[16px] text-white/85">
          <p className="font-bold text-white">Force-velocity profile ({fv.fv.n} jumps, {fv.fv.loads} loads)</p>
          <p>Max force {fv.fv.f0PerKg.toFixed(1)} N/kg · max speed {fv.fv.v0Mps.toFixed(2)} m/s · max power {fv.fv.pmaxPerKg.toFixed(1)} W/kg</p>
          <p className="text-white/60">Line fit r² {fv.fv.r2.toFixed(2)}. Estimates from jump height and push-off (Samozino method), not measured force.</p>
        </div>
      ) : fv.why in FV_WHY ? <p data-fv-why className="text-[16px] text-white/70">{FV_WHY[fv.why as keyof typeof FV_WHY]}</p> : null) : null}
      <p className="text-[16px] leading-snug text-white/60">Peak power uses the Sayers formula; mean push power and force use the Samozino method. All are estimates.</p>
    </section>
  );
}
