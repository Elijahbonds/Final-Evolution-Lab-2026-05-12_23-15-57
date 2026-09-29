'use client';

// The lane page (SCREEN-SHIP A3-4, A4-3), in this order: (1) the lane's header card, in the results' card style;
// (2) "Your top flag: <flag>, so start with <Lane>" (or the win line on a clean screen); (3) one free sample drill, its
// cue marked PROPOSED; (4) "Dunk Program coming soon"; then a visible "Back to my results".
//
// SAVES NOTHING and SENDS NOTHING: no email or phone box, no form, no fetch, no localStorage, IndexedDB or cookie. The
// flag is read from this tab's sessionStorage; the URL carries only the lane. A tab without a result shows "Your results
// aren't saved. Run the screen again" (no fallback lane); a lane that is not the result's own goes to the result's.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { checkById } from '@/lib/screen/PROPOSED-thresholds';
import { LANES, sampleDrill, type LaneSlug } from '@/lib/screen/PROPOSED-program-lanes';
import { recall, tabStorage } from '@/lib/screen/store';
import type { ScreenSummary } from '@/lib/screen/checks';
import { programSignupEnabled } from '@/lib/screen/config';
import { BACK_TO_RESULTS, DISCLAIMER, NO_PICK_LINE, PROGRAM_COMING, WIN_LINE } from '@/lib/screen/copy';
import { NotSavedCard } from '@/app/play/mirror/assess/_components/not-saved';
import { BandChip, PreviewLabel, ProposedTag, ScreenFrame, StepCard, quietBtn } from '@/app/play/mirror/assess/_components/screen-ui';

const RESULTS = '/play/mirror/assess/results';

export function ProgramLane({ lane }: { lane: LaneSlug }) {
  const router = useRouter();
  const [state, setState] = useState<ScreenSummary | 'none' | 'reading'>('reading');
  useEffect(() => {
    const r = recall(tabStorage());
    if (r && r.summary.lane && r.summary.lane !== lane) { router.replace(`/screen/program/${r.summary.lane}`); return; }
    setState(r ? r.summary : 'none');
  }, [lane, router]);

  return (
    <ScreenFrame back={RESULTS} title="Your Dunk Program">
      {state === 'reading' ? <StepCard testId="reading"><p className="text-white/60">Reading your results…</p></StepCard> : null}
      {state === 'none' ? <NotSavedCard /> : null}
      {typeof state === 'object' ? <LaneBody lane={lane} s={state} /> : null}
    </ScreenFrame>
  );
}

export function LaneBody({ lane, s, signupFlag = process.env.NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED }: { lane: LaneSlug; s: ScreenSummary; signupFlag?: string }) {
  const L = LANES[lane];
  if (!s.lane) {
    return (
      <StepCard testId="no-pick">
        <p className="text-[15px] leading-snug text-white/80">Your screen was not finished, so there is no program pick yet. {NO_PICK_LINE}</p>
        <Link href={RESULTS} prefetch={false} data-back-to-results className={`${quietBtn} mt-4`}>{BACK_TO_RESULTS}</Link>
      </StepCard>
    );
  }
  const flag = s.topFlag ? checkById(s.topFlag) : null;
  const band = s.topFlag ? s.checks.find((c) => c.id === s.topFlag)?.band ?? null : 'green';
  const drill = sampleDrill(lane, s.topFlag);
  return (
    <div data-lane-page={lane} className="space-y-3">
      <p className="text-[13px] text-white/60">{DISCLAIMER}</p>
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
        <p className="mt-1 text-[15px] leading-snug">{drill.cue}<ProposedTag /></p>
        <p className="mt-1 text-[12px] text-white/50">From {drill.from}.</p>
        <div className="mt-2"><PreviewLabel /></div>
      </section>
      <section data-coming-soon className="rounded-2xl border border-dashed border-white/20 p-4">
        <p className="text-[16px] font-black">{PROGRAM_COMING}</p>
        <p className="mt-1 text-[13px] text-white/60">A full plan built from your screen. Nothing is saved or sent from this page.</p>
        {programSignupEnabled(signupFlag) ? (
          // NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED is on: an INERT placeholder only (see lib/screen/config.ts). No form, no input, no request.
          <p data-signup-placeholder className="mt-2 text-[13px] text-white/70">Sign-up opens here later.</p>
        ) : null}
      </section>
      <Link href={RESULTS} prefetch={false} data-back-to-results className={quietBtn}>{BACK_TO_RESULTS}</Link>
    </div>
  );
}
