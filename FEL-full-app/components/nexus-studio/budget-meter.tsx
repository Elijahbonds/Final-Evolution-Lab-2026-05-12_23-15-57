'use client';

// The budget meter (docs/NEXUS-STUDIO.md §4.4): live draws, meshes and texture memory against the ceiling of the tier
// the stage is drawing (lib/nexus-studio/budget.ts), and the target mode's measured phone row for reference. The switch
// re-mounts the stage on the other tier, so the phone's numbers are the phone scene's, not a guess.

import { Gauge, Smartphone, Monitor } from 'lucide-react';
import { meterRows, modeRow, worst, PHONE_BODIES, type BudgetSample, type Level } from '@/lib/nexus-studio/budget';
import { C } from './ui';

const TONE: Record<Level, string> = { ok: C.emerald, near: C.gold, over: C.crimson };

export function BudgetMeter({ sample, budgetKey, phone, onPhone }: { sample: BudgetSample | null; budgetKey: string; phone: boolean; onPhone(v: boolean): void }) {
  const rows = sample ? meterRows(sample) : [];
  const head = worst(rows);
  const ref = modeRow(budgetKey);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[12px]" data-testid="budget-meter" aria-live="polite">
      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em]" style={{ color: sample ? TONE[head] : C.dim }}>
        <Gauge className="h-3.5 w-3.5" aria-hidden /> Budget · {sample ? (sample.tier === 'mobile' ? 'phone' : sample.tier === 'high' ? 'TV / high' : 'desktop') : '…'}
      </span>
      {rows.map((r) => (
        <span key={r.key} className="flex items-center gap-1.5" title={`${r.label}: ${r.value} of ${r.ceiling} (${Math.round(r.share * 100)} %)`}>
          <span style={{ color: C.dim }}>{r.label}</span>
          <span className="relative h-1.5 w-16 overflow-hidden rounded-full" style={{ background: C.line }}>
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, r.share * 100)}%`, background: TONE[r.level] }} />
          </span>
          <span className="tabular-nums" style={{ color: TONE[r.level] }}>{r.value}<span style={{ color: C.dim }}>/{r.ceiling}</span></span>
        </span>
      ))}
      {sample && <span style={{ color: sample.skinnedBodies > PHONE_BODIES ? C.crimson : C.dim }}>bodies {sample.skinnedBodies}</span>}
      {ref && <span style={{ color: C.dim }} title={`config/mobileBudget.json "${budgetKey}": the mode's measured phone row`}>{budgetKey} on a phone: {ref.measured.drawCalls} draws · {ref.measured.textureMb} MB</span>}
      <span className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => onPhone(false)} aria-pressed={!phone} title="Measure the desktop scene" className="flex items-center gap-1 rounded px-1.5 py-0.5" style={{ color: !phone ? C.cyan : C.dim, background: !phone ? 'rgba(0,229,255,0.12)' : 'transparent' }}><Monitor className="h-3.5 w-3.5" /> Desktop</button>
        <button type="button" onClick={() => onPhone(true)} aria-pressed={phone} title="Re-mount on the phone tier and measure that scene" className="flex items-center gap-1 rounded px-1.5 py-0.5" style={{ color: phone ? C.cyan : C.dim, background: phone ? 'rgba(0,229,255,0.12)' : 'transparent' }}><Smartphone className="h-3.5 w-3.5" /> Phone</button>
      </span>
    </div>
  );
}
