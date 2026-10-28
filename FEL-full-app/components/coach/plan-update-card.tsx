'use client';
// COACH-AI-DRAFT (2026-10-24): the athlete's "your coach updated your plan" card on Today. The program already shows the
// new prescription (an approval is an ordinary builder write); this says what changed, in plain words, with the coach's
// note. Nothing shows until there is an approved update (and nothing at all before the drafts tables exist).

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PLAN_UPDATE_COPY, planUpdateView, type PlanUpdateRow, type PlanUpdateView } from '@/lib/coach/weeklyDraft/planUpdates';
import { PLAN_UPDATES_API } from '@/lib/coach/weeklyDraft/view';

export function PlanUpdateCard({ api = PLAN_UPDATES_API, coachName }: { api?: string; coachName?: string | null }) {
  const [view, setView] = useState<PlanUpdateView | null>(null);
  useEffect(() => {
    fetch(api, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j: { updates?: PlanUpdateRow[] } | null) => setView(planUpdateView(j?.updates))).catch(() => {});
  }, [api]);
  return view ? <PlanUpdateBody view={view} coachName={coachName} /> : null;
}

export function PlanUpdateBody({ view, coachName }: { view: PlanUpdateView; coachName?: string | null }) {
  return (
    <section aria-labelledby="plan-update-h" className="fel-card rounded-xl border border-fel-cyan/25 p-4 space-y-2" data-testid="plan-update">
      <h2 id="plan-update-h" className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-fel-cyan">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> {PLAN_UPDATE_COPY.heading}
      </h2>
      {view.lines.length > 0 && (
        <ul className="space-y-1 text-sm text-white/85">
          {view.lines.map((l, i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="text-fel-cyan">•</span><span>{l}</span></li>)}
        </ul>
      )}
      {view.notes.map((n, i) => (
        <p key={i} className="rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-white/80">
          <span className="text-[11px] uppercase tracking-wider text-fel-dim">{coachName ? `${coachName}` : PLAN_UPDATE_COPY.note}: </span>{n}
        </p>
      ))}
    </section>
  );
}
