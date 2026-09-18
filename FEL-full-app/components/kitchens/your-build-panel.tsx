'use client';

// FEL Kitchens — "Your Build": the scan input the snapshot reads. Until a Mirror scan is wired the athlete enters or
// adjusts the movement-screen metrics here (owner decision 2026-09-05: the screen is the leak source). The derived leak
// and load band update live; the last metrics persist per viewer (lib/kitchens/metrics.ts). Read-only upstream: this
// never writes to Build or Mirror types.

import { RotateCcw } from 'lucide-react';
import { analyzeMovement, PILLAR_LABELS, type MovementMetrics } from '@/lib/workout/movement-screen';
import { LEAK_LABEL, leakFromScreen } from '@/lib/kitchens/buildSnapshot';
import { loadBandFor } from '@/lib/kitchens/mealRxBuilder';
import { clampMetric, METRIC_FIELDS } from '@/lib/kitchens/metrics';

const BAND_LABEL = { easy: 'EASY DAY', train: 'TRAIN DAY', hard: 'HARD DAY' } as const;

export function YourBuildPanel({ metrics, prq0to100, onChange, onReset }: {
  metrics: MovementMetrics;
  prq0to100: number | null;
  onChange: (m: MovementMetrics) => void;
  onReset: () => void;
}) {
  const screen = analyzeMovement(metrics);
  const leak = leakFromScreen(metrics, screen);
  const band = prq0to100 == null ? null : loadBandFor(prq0to100 / 100);

  const set = (key: keyof MovementMetrics, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange({ ...metrics, [key]: clampMetric(key, n) });
  };

  return (
    <section className="fel-panel mt-4 rounded-2xl p-4" data-testid="your-build">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Your Build · scan input</p>
          <p className="mt-0.5 text-xs text-white/55">Movement-screen metrics until a Mirror scan lands. Saved on this device.</p>
        </div>
        <button type="button" onClick={onReset} className="flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white/80 hover:bg-white/10">
          <RotateCcw className="h-3.5 w-3.5" /> Defaults
        </button>
      </div>

      <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {METRIC_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="flex items-center justify-between text-xs">
              <span className="font-bold text-white/85">{f.label}</span>
              <span className="font-mono tabular-nums text-white/70">{metrics[f.key]}{f.unit ? <span className="text-white/40"> {f.unit}</span> : null}</span>
            </span>
            <input
              type="range" aria-label={f.label} min={f.min} max={f.max} step={f.step} value={metrics[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className="mt-1 w-full accent-[#00E5FF]"
            />
            <span className="block text-[10px] text-white/40">{f.hint}</span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
        <span className="rounded-full border border-[#A855F7]/40 bg-[#A855F7]/10 px-2.5 py-1 text-xs font-bold text-[#A855F7]" data-testid="derived-leak">LEAK · {LEAK_LABEL[leak].toUpperCase()}</span>
        <span className="rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1 text-xs font-bold text-[#00E5FF]" data-testid="derived-band">{band ? BAND_LABEL[band] : 'LOAD · reading PRQ…'}</span>
        <span className="font-mono text-[11px] text-white/45">weakest {PILLAR_LABELS[screen.weakest]} · screen {screen.overall}</span>
      </div>
    </section>
  );
}
