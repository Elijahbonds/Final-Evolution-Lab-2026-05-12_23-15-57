'use client';

// CoachFirstRun — ONB-03: what a new coach does after the first invite, and a sample combine to look at before they have
// a single athlete (lib/onboarding/coachFirstRun.ts). The sample is built in memory on open and rendered by the real
// combine report; it is marked as sample data, is never saved, and is never sent.

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { CombineReport } from '@/components/combine/combine-report';
import type { CombineEvent } from '@/lib/combine/types';
import { COACH_STEPS, COMBINE_HREF, SAMPLE_LABEL, SAMPLE_LINE, sampleCombine, stepsDone } from '@/lib/onboarding/coachFirstRun';

export function CoachFirstRun({ invited }: { invited: boolean }) {
  const done = stepsDone(invited);
  const [sample, setSample] = useState<CombineEvent | null>(null);
  return (
    <section className="mt-6 space-y-4" data-coach-first-run>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="fel-heading text-sm font-bold uppercase tracking-wide text-white">Your first client</h2>
        <ol className="mt-3 space-y-3">
          {COACH_STEPS.map((s, i) => {
            const ok = done.has(s.id);
            return (
              <li key={s.id} className="flex gap-3" data-coach-step={s.id} data-done={ok ? 'true' : 'false'}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${ok ? 'bg-[#00FF9D] text-black' : 'border border-white/25 text-white/70'}`}>
                  {ok ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold text-white">{s.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-white/60">{s.line}</span>
                  {s.href && s.cta && (
                    <Link href={s.href} className="mt-1 inline-block text-[12.5px] font-bold text-[#F5C518] underline">{s.cta}</Link>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="fel-heading text-sm font-bold uppercase tracking-wide text-white">A combine day, before your first</h2>
          <span className="rounded border border-[#F5C518]/50 bg-[#F5C518]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#F5C518]" data-sample-label>
            {SAMPLE_LABEL}
          </span>
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-white/60">{SAMPLE_LINE}</p>
        {sample ? (
          <div className="mt-4" data-sample-combine>
            <CombineReport ev={sample} onChange={setSample} onBack={() => setSample(null)} />
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" data-sample-open onClick={() => setSample(sampleCombine())}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-4 text-sm font-bold text-white">
              See the sample report
            </button>
            <Link href={COMBINE_HREF} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold text-white/70 underline">
              Run a real one
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
