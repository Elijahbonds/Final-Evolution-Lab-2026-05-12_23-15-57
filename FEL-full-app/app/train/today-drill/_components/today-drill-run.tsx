'use client';

// DAILY-DRILL (2026-10-24): today's drill, run. The phases (the server's pick, as references) are rebuilt into one chart
// from the catalogue (lib/daily-drill/compose.ts) and run on the drills page's camera screen (DrillLive). A run that ends
// 'complete' claims the day once: the Lab Credits and the streak day (POST /api/daily-drill/claim). A run stopped early
// claims nothing. The claim sends the day's drill key only — nothing the camera read.
//
// TODAY-DRILL (owner playtest 2026-10-27: "clearer instructions and better purpose"): before the camera, the page says
// WHY today (the person's own lowest number), WHAT it improves, how long and what you need, then the numbered steps, the
// looping demo and the 2–3 key cues (lib/daily-drill/guide.ts). A first-timer (no drill in four weeks) also gets the
// two-line explainer. Owner (2026-10-27): demos play by themselves and instructions are never folded away, and the next
// action is one big button: Start is fixed at the bottom, above the tab bar, for everyone. During the run and after it, today-drill-live.tsx draws the screens; "This hurts: stop" opens the existing
// pain check-in, never a second pain path.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpToLine, Camera, CheckCircle2, Clock, Flame, Footprints, Maximize2, Smartphone, Sparkles } from 'lucide-react';
import { setBodyPlayDobYear } from '@/lib/move/bodyPlayGrownUp';
import { composeDailyDrill } from '@/lib/daily-drill/compose';
import { DAILY_DRILL_CLAIM_PATH, KEPT_LINE } from '@/lib/daily-drill/copy';
import { FIRST_TIME_LINE, START_AGAIN_LABEL, START_LABEL, guideFor, needChips, rewardParts, stepsFor, whyNumber } from '@/lib/daily-drill/guide';
import type { DailyDrillView } from '@/lib/daily-drill/load';
import type { DrillResult } from '@/lib/drills/DrillRunner';
import { DrillLive } from '@/app/play/drills/_components/drill-live';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { useAutoOpen } from '@/components/library/use-auto-open';
import { drillDemoLoop } from '@/lib/library/surfaceDemo';
import { DrillResultView, DrillRunning, HurtPanel, type Claim } from './today-drill-live';

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

const CHIP_ICON = { time: Clock, phone: Smartphone, floor: Maximize2, shoes: Footprints, above: ArrowUpToLine } as const;

/** The shared drill demo's pieces (#462): the library stage, opening itself as it scrolls into view — no "watch" tap,
 *  never a T-pose; the drill's own loop or the still start position. Without DrillDemo's long note line. */
function Demo({ drillId }: { drillId: string }) {
  const { ref, open } = useAutoOpen<HTMLDivElement>();
  const off = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';
  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c11]" data-daily-demo={drillId}>
      {open && !off ? <AvatarDemo clip={drillDemoLoop(drillId)} /> : <div className="aspect-[4/3] w-full sm:aspect-video" />}
    </div>
  );
}

export function TodayDrillRun({ view, dobYear }: { view: DailyDrillView; dobYear: number | null }) {
  const plan = view.plan!;
  const drill = useMemo(() => composeDailyDrill(plan), [plan]);
  const guide = guideFor(plan.drillId);
  const steps = useMemo(() => stepsFor(plan.drillId, plan.phases), [plan]);
  const [stage, setStage] = useState<'intro' | 'live' | 'hurt'>('intro');
  const hurt = useRef(false);
  const [claim, setClaim] = useState<Claim>(view.done ? { state: 'done', amount: view.done.amount, streakDays: view.done.streakDays } : { state: 'idle' });
  // body play's grown-up step reads the account's birth year, as on the drills page (drills-app.tsx)
  useEffect(() => { setBodyPlayDobYear(dobYear); return () => setBodyPlayDobYear(undefined); }, [dobYear]);
  useEffect(() => { if (stage !== 'intro') window.scrollTo?.(0, 0); }, [stage]);

  const onResult = useCallback((r: DrillResult) => {
    if (r.status !== 'complete') return;
    setClaim((c) => (c.state === 'done' || c.state === 'sending' ? c : { state: 'sending' }));
    void postClaim(plan.key).then((a) => {
      setClaim(a && (a.status === 'granted' || a.status === 'already') ? { state: 'done', amount: a.amount, streakDays: a.streakDays } : { state: 'failed' });
    });
  }, [plan.key]);

  if (!drill) return <p className="text-[14px] text-white/70" data-daily-unavailable>Today&apos;s drill could not be built on this page. Reload to try again.</p>;

  if (stage === 'hurt') return <HurtPanel drillName={plan.name} />;
  if (stage === 'live') {
    return (
      <DrillLive
        drill={drill}
        onLeave={() => { setStage(hurt.current ? 'hurt' : 'intro'); hurt.current = false; }}
        onResult={onResult}
        keptLine={KEPT_LINE}
        renderRunning={(slot) => <DrillRunning slot={slot} drillId={plan.drillId} onHurt={() => { hurt.current = true; slot.leave(); }} />}
        renderResult={(slot) => <DrillResultView slot={slot} drillId={plan.drillId} refs={plan.phases} tomorrow={view.tomorrow.line} claim={claim} />}
      />
    );
  }

  const done = claim.state === 'done';
  const newcomer = view.newcomer && !done;
  const reward = rewardParts(view.credit, view.streak, claim.state === 'done' ? claim : null);
  // owner (2026-10-27): "It should play automatically, don't make the platform confusing or hard to use", and less text.
  // The next action is one big button, always on screen (above the phone's tab bar); big numbers, icon chips and the
  // demo carry the meaning. A first-timer also gets one line on what the daily drill is, the 3 steps and the 2 cues.
  const startButton = (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-white/10 bg-[#050505]/95 px-4 py-3 md:bottom-0" data-daily-start-bar>
      <div className="mx-auto max-w-3xl">
        <button type="button" onClick={() => setStage('live')} data-daily-start
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00FF9D] px-6 text-[18px] font-black tracking-wide text-black">
          <Camera aria-hidden className="h-5 w-5" /> {done ? START_AGAIN_LABEL : START_LABEL}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-28" data-daily-page={plan.key} data-daily-newcomer={newcomer ? '1' : '0'}>
      <header className="space-y-2">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/40" data-daily-book>{plan.name}</p>
        <h1 className="text-[36px] font-black leading-[1.02] tracking-tight text-white">{guide.title}</h1>
        <p className="text-[17px] font-semibold leading-snug text-white/90" data-daily-why>{whyNumber(view.focus, view.skill)}</p>
        {newcomer && (
          <p className="flex items-center gap-2 text-[15px] text-white/70" data-daily-improves>
            <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-[#00FF9D]" />{guide.improves}
          </p>
        )}
      </header>

      <ul className="flex flex-wrap gap-2" data-daily-chips>
        {needChips(guide.jumps, plan.minutes).map((c) => {
          const Icon = CHIP_ICON[c.id];
          return (
            <li key={c.id} data-daily-need={c.id} aria-label={c.label} title={c.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[13px] font-semibold text-white/85">
              <Icon aria-hidden className="h-4 w-4 text-[#00E5FF]" />{c.text}
            </li>
          );
        })}
      </ul>

      {newcomer && <p className="rounded-xl border border-[#00E5FF]/30 bg-[#00E5FF]/[0.06] px-3 py-2 text-[14px] text-white/85" data-daily-explainer>{FIRST_TIME_LINE}</p>}

      {plan.heldNote && (
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-[13px] leading-snug text-amber-100/90" data-daily-held>
          {plan.heldNote}{' '}
          {plan.heldHref && <a href={plan.heldHref} className="font-bold underline">See what&apos;s needed</a>}
        </p>
      )}

      <p className="flex items-center gap-3 font-mono text-[14px] font-bold tracking-wide text-[#00FF9D]" data-daily-reward={reward.done ? 'done' : 'open'}>
        {reward.done && <CheckCircle2 aria-label="Done today" className="h-4 w-4" />}
        <span>{reward.credits}</span>
        {reward.day !== null && <span className="inline-flex items-center gap-1 text-[#FFB020]" aria-label={`Day ${reward.day} of your streak`}><Flame aria-hidden className="h-4 w-4" />{reward.day}</span>}
      </p>

      <Demo drillId={plan.drillId} />

      {newcomer && (
        <ol className="space-y-2" data-daily-steps={steps.length}>
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-[17px] font-semibold text-white">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-[15px] font-black text-[#00FF9D]">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      <ul className="flex flex-wrap gap-2" data-daily-cues={guide.cues.length}>
        {guide.cues.map((c) => <li key={c} className="rounded-2xl bg-[#00E5FF]/[0.10] px-4 py-2.5 text-[18px] font-black text-white">{c}</li>)}
      </ul>
      {startButton}
    </div>
  );
}
