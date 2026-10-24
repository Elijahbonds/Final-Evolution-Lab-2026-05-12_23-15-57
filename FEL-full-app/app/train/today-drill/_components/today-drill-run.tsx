'use client';

// DAILY-DRILL (2026-10-24): today's drill, run. The phases (the server's pick, as references) are rebuilt into one chart
// from the catalogue (lib/daily-drill/compose.ts) and run on the drills page's camera screen (DrillLive). A run that ends
// 'complete' claims the day once: the Lab Credits and the streak day (POST /api/daily-drill/claim). A run stopped early
// claims nothing. The claim sends the day's drill key only — nothing the camera read.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2 } from 'lucide-react';
import { setBodyPlayDobYear } from '@/lib/move/bodyPlayGrownUp';
import { composeDailyDrill, phaseOf } from '@/lib/daily-drill/compose';
import {
  CLAIM_FAILED_LINE, DAILY_DRILL_CLAIM_PATH, DONE_TITLE, KEPT_LINE, PREP_LINE, doneLine, rewardLine,
} from '@/lib/daily-drill/copy';
import type { DailyDrillView } from '@/lib/daily-drill/load';
import type { DrillResult } from '@/lib/drills/DrillRunner';
import { DrillLive } from '@/app/play/drills/_components/drill-live';
import { DrillDemo } from '@/app/play/drills/_components/drill-demo';
import { drillById } from '@/lib/drills/drills';

type Claim = { state: 'idle' } | { state: 'sending' } | { state: 'done'; amount: number; streakDays: number | null } | { state: 'failed' };

/** POST the claim; the server's answer, or null when it failed. Exported for the tests. */
export async function postClaim(key: string, f: typeof fetch = fetch): Promise<{ status: string; amount: number; streakDays: number | null } | null> {
  try {
    const r = await f(DAILY_DRILL_CLAIM_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });
    if (!r.ok) return null;
    const b = await r.json();
    return { status: String(b?.status ?? ''), amount: Number(b?.amount ?? 0), streakDays: typeof b?.streakDays === 'number' ? b.streakDays : null };
  } catch {
    return null;
  }
}

export function TodayDrillRun({ view, dobYear }: { view: DailyDrillView; dobYear: number | null }) {
  const plan = view.plan!;
  const drill = useMemo(() => composeDailyDrill(plan), [plan]);
  const main = drillById(plan.drillId);
  const [live, setLive] = useState(false);
  const [claim, setClaim] = useState<Claim>(view.done ? { state: 'done', amount: view.done.amount, streakDays: view.done.streakDays } : { state: 'idle' });
  // body play's grown-up step reads the account's birth year, as on the drills page (drills-app.tsx)
  useEffect(() => { setBodyPlayDobYear(dobYear); return () => setBodyPlayDobYear(undefined); }, [dobYear]);

  const onResult = useCallback((r: DrillResult) => {
    if (r.status !== 'complete') return;
    setClaim((c) => (c.state === 'done' || c.state === 'sending' ? c : { state: 'sending' }));
    void postClaim(plan.key).then((a) => {
      setClaim(a && (a.status === 'granted' || a.status === 'already') ? { state: 'done', amount: a.amount, streakDays: a.streakDays } : { state: 'failed' });
    });
  }, [plan.key]);

  const banner = claim.state === 'done'
    ? (
      <p className="flex items-start gap-2 rounded-xl border border-[#00FF9D]/35 bg-[#00FF9D]/[0.07] px-3 py-2.5 text-[14px] text-white" data-daily-claim="done">
        <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#00FF9D]" />
        <span><span className="font-bold">{DONE_TITLE}.</span> {doneLine(claim.amount, claim.streakDays)}</span>
      </p>
    )
    : claim.state === 'failed'
      ? <p className="rounded-xl border border-amber-300/30 px-3 py-2 text-[13px] text-amber-100/90" data-daily-claim="failed">{CLAIM_FAILED_LINE}</p>
      : claim.state === 'sending'
        ? <p className="text-[13px] text-white/60" data-daily-claim="sending">Saving that you finished…</p>
        : null;

  if (!drill) return <p className="text-[14px] text-white/70" data-daily-unavailable>Today&apos;s drill could not be built on this page. Reload to try again.</p>;
  if (live) {
    return (
      <div className="space-y-3">
        {banner}
        <DrillLive drill={drill} onLeave={() => setLive(false)} onResult={onResult} keptLine={KEPT_LINE} />
      </div>
    );
  }
  return (
    <div className="space-y-4" data-daily-page={plan.key}>
      {banner}
      {claim.state !== 'done' && <p className="text-[13px] text-white/60" data-daily-reward>{rewardLine(view.credit, view.streak.opensToday, view.streak.nextDays)}</p>}
      {plan.heldNote && (
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-[13px] leading-snug text-amber-100/90" data-daily-held>
          {plan.heldNote}{' '}
          {plan.heldHref && <a href={plan.heldHref} className="font-bold underline">See what&apos;s needed</a>}
        </p>
      )}
      {plan.drillId !== 'wake-up' && <p className="text-[13px] text-white/55">{PREP_LINE}</p>}
      <ol className="space-y-1.5" data-daily-phases={plan.phases.length}>
        {plan.phases.map((r) => {
          const p = phaseOf(r);
          if (!p) return null;
          return (
            <li key={`${r.drill}:${r.phase}`} className="rounded-xl bg-white/[0.03] px-3 py-2 text-[13px] text-white/75">
              <span className="font-bold text-white">{p.name}</span> · {Math.round(p.durationSec / 6) / 10} min{p.presence === 'free' ? ' · rest' : ''}
              <span className="block text-white/55">{p.cue}</span>
            </li>
          );
        })}
      </ol>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/40">{plan.minutes} min in all</p>
      <button type="button" onClick={() => setLive(true)} data-daily-start
        className="flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-black text-black">
        <Camera aria-hidden className="h-4 w-4" /> {claim.state === 'done' ? 'Run it again' : 'Start with the camera'}
      </button>
      {main && <DrillDemo drill={main} />}
      <Link href="/play/drills" className="inline-block text-[13px] text-white/50 underline-offset-2 hover:underline">All drills</Link>
    </div>
  );
}
