'use client';

// The lane page (SCREEN-SHIP A3-4, A4-3; SCREEN-FIX), in this order: (1) the lane's header card, in the results' card
// style; (2) "Your top flag: <flag>, so start with <Lane>" (or the win line on a clean screen); (3) one free sample
// drill, its cue marked "Early version"; (4) "Dunk Program coming soon"; then a visible "Back to my results".
//
// SAVES NOTHING and SENDS NOTHING: no email box, no form, no fetch, no localStorage, IndexedDB or cookie. The
// flag is read from this tab's sessionStorage; the URL carries only the lane. A tab without a result shows "Your results
// aren't saved. Run the screen again" (no fallback lane); a lane that is not the result's own goes to the result's.
//
// UNDER 18 (Cyber 3; SCREEN-FIX-2: 13–17 too): a tab whose age answer is under 18 or "rather not say" sees "Have a
// parent open this" here, even when the address was typed in: no lane, no link out.
//
// NO SIGN-UP, FOR ANY FLAG VALUE (SCREEN-FIX-2 item 4): the "Sign-up opens here later." placeholder is gone and this
// page no longer reads NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED, until the email waitlist can save safely.
// "Not a medical exam" shows ONCE on every version of this page (S-13): DISCLAIMER, then the stop line.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { checkById } from '@/lib/screen/PROPOSED-thresholds';
import { LANES, sampleDrill, type LaneSlug } from '@/lib/screen/PROPOSED-program-lanes';
import { linksAllowed, strictestAge, type AgeBand } from '@/lib/screen/age';
import { readAge, recall, tabStorage } from '@/lib/screen/store';
import type { ScreenSummary } from '@/lib/screen/checks';
import { RESULTS_PATH, programPath } from '@/lib/screen/routes';
import { BACK_TO_RESULTS, DISCLAIMER, NO_PICK_LINE, PROGRAM_COMING, WIN_LINE } from '@/lib/screen/copy';
import { NotSavedCard } from '@/app/play/mirror/assess/_components/not-saved';
import { BandChip, EarlyTag, ParentCard, PreviewLabel, ScreenFrame, StepCard, StopLine, quietBtn } from '@/app/play/mirror/assess/_components/screen-ui';

/** What the page read from the tab: the result (or none) and the tab's age answer (or none). */
export type LaneState = { s: ScreenSummary | null; age: AgeBand | null } | 'reading';

export function ProgramLane({ lane, dunkHref = null }: { lane: LaneSlug; dunkHref?: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<LaneState>('reading');
  useEffect(() => {
    const tab = tabStorage();
    const r = recall(tab);
    const age = strictestAge(readAge(tab), r?.gate.ageBand);
    if (linksAllowed(age) && r && r.summary.lane && r.summary.lane !== lane) { router.replace(programPath(r.summary.lane)); return; }
    setState({ s: r ? r.summary : null, age });
  }, [lane, router]);

  return (
    <ScreenFrame back={RESULTS_PATH} title="Your Dunk Program">
      <ProgramLaneView lane={lane} state={state} dunkHref={dunkHref} />
    </ScreenFrame>
  );
}

/** The page's body for what the tab holds. Pure: the tests render it for every age answer. */
export function ProgramLaneView({ lane, state, dunkHref = null }: { lane: LaneSlug; state: LaneState; dunkHref?: string | null }) {
  if (state === 'reading') return <StepCard testId="reading"><p className="text-white/60">Reading your results…</p></StepCard>;
  if (state.age && !linksAllowed(state.age)) {
    return (
      <div data-parent-view className="space-y-3">
        <div className="space-y-1">
          <p className="text-[13px] text-white/60">{DISCLAIMER}</p>
          <StopLine />
        </div>
        <ParentCard />
        <Link href={RESULTS_PATH} prefetch={false} data-back-to-results className={quietBtn}>{BACK_TO_RESULTS}</Link>
      </div>
    );
  }
  if (!state.s) return <NotSavedCard />;
  return <LaneBody lane={lane} s={state.s} dunkHref={dunkHref} />;
}

export function LaneBody({ lane, s, dunkHref = null }: { lane: LaneSlug; s: ScreenSummary; dunkHref?: string | null }) {
  const L = LANES[lane];
  if (!s.lane) {
    return (
      <StepCard testId="no-pick">
        <p className="text-[13px] text-white/60">{DISCLAIMER}</p>
        <StopLine className="mt-1 text-[13px] text-white/70" />
        <p className="mt-3 text-[15px] leading-snug text-white/80">Your screen was not finished, so there is no program pick yet. {NO_PICK_LINE}</p>
        <Link href={RESULTS_PATH} prefetch={false} data-back-to-results className={`${quietBtn} mt-4`}>{BACK_TO_RESULTS}</Link>
      </StepCard>
    );
  }
  const flag = s.topFlag ? checkById(s.topFlag) : null;
  const band = s.topFlag ? s.checks.find((c) => c.id === s.topFlag)?.band ?? null : 'green';
  const drill = sampleDrill(lane, s.topFlag);
  return (
    <div data-lane-page={lane} className="space-y-3">
      <div className="space-y-1">
        <p className="text-[13px] text-white/60">{DISCLAIMER}</p>
        <StopLine />
      </div>
      <section data-lane-header className="rounded-3xl border border-[#00E5FF]/30 bg-[#00E5FF]/[0.05] p-4">
        <div className="flex items-center gap-2 text-[#00E5FF]"><Dumbbell aria-hidden className="h-5 w-5" /><span className="text-[12px] font-bold uppercase tracking-[0.16em]">Program lane</span></div>
        <h2 className="mt-1 text-[22px] font-black leading-tight">{L.name}</h2>
        <div className="mt-1.5"><BandChip band={band} /></div>
      </section>
      <p data-top-flag className="px-1 text-[16px] font-bold leading-snug">
        {flag ? `Your top flag: ${flag.name.toLowerCase()}, so start with ${L.name}.` : WIN_LINE}
      </p>
      <section data-sample-drill className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/55">Free sample drill</p>
        <p className="mt-1 text-[15px] leading-snug">{drill.cue}<EarlyTag /></p>
        <div className="mt-2"><PreviewLabel /></div>
      </section>
      <section data-coming-soon className="rounded-2xl border border-dashed border-white/20 p-4">
        <p className="text-[16px] font-black">{PROGRAM_COMING}</p>
        <p className="mt-1 text-[13px] text-white/60">A full plan built from your screen. Nothing is saved or sent from this page.</p>
        {dunkHref && lane === 'dunking' ? <a href={dunkHref} data-build-dunk>Build my Dunk Program</a> : null}
      </section>
      <Link href={RESULTS_PATH} prefetch={false} data-back-to-results className={quietBtn}>{BACK_TO_RESULTS}</Link>
    </div>
  );
}
