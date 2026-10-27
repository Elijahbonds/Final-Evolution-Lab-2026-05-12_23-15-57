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
import Link from 'next/link';
import { Camera, Clock, Footprints, Smartphone, Sparkles } from 'lucide-react';
import { setBodyPlayDobYear } from '@/lib/move/bodyPlayGrownUp';
import { composeDailyDrill } from '@/lib/daily-drill/compose';
import {
  DAILY_DRILL_CLAIM_PATH, DAILY_EYEBROW, DONE_TITLE, KEPT_LINE, doneLine, rewardLine,
} from '@/lib/daily-drill/copy';
import {
  CUES_TITLE, DEMO_TITLE, FIRST_TIME_LINES, FIRST_TIME_TITLE, NEEDS_TITLE, START_AGAIN_LABEL, START_LABEL, STEPS_TITLE,
  guideFor, needsLines, stepsFor,
} from '@/lib/daily-drill/guide';
import type { DailyDrillView } from '@/lib/daily-drill/load';
import type { DrillResult } from '@/lib/drills/DrillRunner';
import { DrillLive } from '@/app/play/drills/_components/drill-live';
import { DrillDemo } from '@/app/play/drills/_components/drill-demo';
import { drillById } from '@/lib/drills/drills';
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

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section className="space-y-2" data-daily-section={id}>
      <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white/50">{title}</h2>
      {children}
    </section>
  );
}

export function TodayDrillRun({ view, dobYear }: { view: DailyDrillView; dobYear: number | null }) {
  const plan = view.plan!;
  const drill = useMemo(() => composeDailyDrill(plan), [plan]);
  const guide = guideFor(plan.drillId);
  const main = drillById(plan.drillId);
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
  // owner (2026-10-27): "It should play automatically, don't make the platform confusing or hard to use." The one next
  // action is one big button, always on screen (above the phone's tab bar), and nothing is folded away.
  const startButton = (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-white/10 bg-[#050505]/95 px-4 py-3 md:bottom-0" data-daily-start-bar>
      <div className="mx-auto max-w-3xl">
        <button type="button" onClick={() => setStage('live')} data-daily-start
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00FF9D] px-6 text-[17px] font-black text-black">
          <Camera aria-hidden className="h-5 w-5" /> {done ? START_AGAIN_LABEL : START_LABEL}
        </button>
      </div>
    </div>
  );
  const how = (
    <div className="space-y-5">
      {/* the shared drill demo (lane/library-anatomy-2, #462): the library stage, the drill's own loop or the still start
          position, opening by itself as it scrolls into view — no "watch" tap, never a T-pose */}
      {main && <Section title={DEMO_TITLE} id="demo"><DrillDemo drill={main} /></Section>}
      <Section title={STEPS_TITLE} id="steps">
        <ol className="space-y-2" data-daily-steps={steps.length}>
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3 text-[15px] leading-snug text-white/85">
              <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-[13px] font-black text-white">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Section title={CUES_TITLE} id="cues">
        <ul className="space-y-1.5" data-daily-cues={guide.cues.length}>
          {guide.cues.map((c) => <li key={c} className="rounded-xl bg-[#00E5FF]/[0.07] px-3 py-2 text-[16px] font-bold text-white">{c}</li>)}
        </ul>
      </Section>
      <Section title={NEEDS_TITLE} id="needs">
        <ul className="space-y-1.5 text-[14px] leading-snug text-white/75">
          {needsLines(guide.jumps).map((n) => <li key={n.id} data-daily-need={n.id} className="flex gap-2"><span aria-hidden className="text-[#00FF9D]">•</span>{n.text}</li>)}
        </ul>
      </Section>
    </div>
  );

  return (
    <div className="space-y-5 pb-28" data-daily-page={plan.key} data-daily-newcomer={view.newcomer ? '1' : '0'}>
      <header className="space-y-2">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#00FF9D]">{DAILY_EYEBROW}</p>
        <h1 className="text-[32px] font-black leading-[1.05] text-white">{guide.title}</h1>
        <p className="text-[12px] text-white/40">{plan.name}, from the Playbook</p>
        <p className="text-[16px] leading-snug text-white/85" data-daily-why>{view.whyToday}</p>
        <p className="flex items-start gap-2 text-[15px] leading-snug text-white/70" data-daily-improves>
          <Sparkles aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#00FF9D]" />{guide.improves}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[13px] text-white/60" data-daily-chips>
          <span className="inline-flex items-center gap-1"><Clock aria-hidden className="h-3.5 w-3.5" />{plan.minutes} min</span>
          <span className="inline-flex items-center gap-1"><Footprints aria-hidden className="h-3.5 w-3.5" />2 m of floor{guide.jumps ? ', shoes on' : ''}</span>
          <span className="inline-flex items-center gap-1"><Smartphone aria-hidden className="h-3.5 w-3.5" />Phone 4 m away</span>
        </p>
      </header>

      {view.newcomer && (
        <div className="rounded-2xl border border-[#00E5FF]/30 bg-[#00E5FF]/[0.06] p-4" data-daily-explainer>
          <p className="text-[15px] font-black text-white">{FIRST_TIME_TITLE}</p>
          <p className="mt-1 text-[14px] leading-snug text-white/80">{FIRST_TIME_LINES[0]}</p>
          <p className="text-[14px] leading-snug text-white/80">{FIRST_TIME_LINES[1]}</p>
        </div>
      )}

      {plan.heldNote && (
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-[13px] leading-snug text-amber-100/90" data-daily-held>
          {plan.heldNote}{' '}
          {plan.heldHref && <a href={plan.heldHref} className="font-bold underline">See what&apos;s needed</a>}
        </p>
      )}

      {done
        ? <p className="rounded-xl border border-[#00FF9D]/35 bg-[#00FF9D]/[0.07] px-3 py-2.5 text-[14px] text-white" data-daily-claim="done"><span className="font-bold">{DONE_TITLE}.</span> {doneLine(claim.amount, claim.streakDays)}</p>
        : <p className="text-[14px] text-white/65" data-daily-reward>{rewardLine(view.credit, view.streak.opensToday, view.streak.nextDays)}</p>}

      {how}
      {startButton}
      <Link href="/play/drills" className="inline-block text-[13px] text-white/50 underline-offset-2 hover:underline">All drills</Link>
    </div>
  );
}
