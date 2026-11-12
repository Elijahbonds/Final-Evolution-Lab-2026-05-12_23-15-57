'use client';
// ResumeProgramCard — EVERY-SCREEN P2 (2026-11-10). The plan's phase 2: "one obvious thing to do today; resume where you
// left off", and open the app → first exercise in ≤ 2 taps. An athlete training alone with a program the AI built had to
// go Train → Build my program → wait for the plan to rebuild → Start today: 3 taps and a scroll. When this phone keeps a
// program (lib/program-ask/device.ts), Train shows it first, and its one button opens the builder with the next session
// already starting (/train/build?start=today; components/program-ask/program-builder.tsx reads it once).
// Reads this phone only; draws nothing on the server's first render, and nothing when there is no saved program.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { readSaved } from '@/lib/program-ask/device';
import { START_TODAY } from '@/lib/program-ask/copy';
import { deviceStorage } from '@/lib/signature/deviceProgress';
import { TYPE } from '@/lib/design/type';

export const RESUME_PROGRAM_HREF = '/train/build?start=today';
/** DRAFT product copy for the owner: the card's eyebrow. */
export const RESUME_EYEBROW = 'Your program';

export interface ResumeView { title: string; done: number; total: number | null }

/** What the card says, from what this phone keeps (pure, for the test). */
export function resumeView(saved: ReturnType<typeof readSaved>): ResumeView | null {
  if (!saved) return null;
  const total = saved.program ? saved.program.weeks.reduce((n, w) => n + w.days.length, 0) : null;
  const done = Object.keys(saved.done ?? {}).length;
  if (total !== null && done >= total) return null;      // finished: the builder's checkpoint is the next step, not a session
  return { title: saved.program?.title ?? saved.question, done, total };
}

export function ResumeProgramView({ view }: { view: ResumeView }) {
  return (
    <Link href={RESUME_PROGRAM_HREF} data-resume-program
      className="fel-press mb-6 flex min-h-11 items-center gap-4 rounded-2xl border border-fel-cyan/35 bg-fel-cyan/[0.07] p-4 sm:p-5">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fel-cyan/15"><Play className="h-5 w-5 text-fel-cyan" /></span>
      <span className="min-w-0 flex-1">
        <span className={`${TYPE.label} block truncate text-fel-dim`}>{RESUME_EYEBROW}</span>
        <span className={`${TYPE.body} mt-1 block font-bold leading-tight text-white`}>{view.title}</span>
        {view.total !== null ? <span className={`${TYPE.small} mt-1 block text-fel-soft`}>{view.done} of {view.total} sessions done</span> : null}
      </span>
      <span className={`${TYPE.label} shrink-0 text-fel-cyan`}>{START_TODAY} →</span>
    </Link>
  );
}

export function ResumeProgramCard() {
  const [view, setView] = useState<ResumeView | null>(null);
  useEffect(() => { setView(resumeView(readSaved(deviceStorage()))); }, []);
  return view ? <ResumeProgramView view={view} /> : null;
}
