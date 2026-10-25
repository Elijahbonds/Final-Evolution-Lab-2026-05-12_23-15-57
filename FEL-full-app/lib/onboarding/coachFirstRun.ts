// coachFirstRun — ONB-03: a new coach's first run, after the first win (one invite sent).
//
// /coach used to open cold: an empty roster, and the Clients tab only appears once somebody is on it. A coach who has
// just sent their first invite needs to know the next two things, in order, and to see what a finished day looks like
// before they have a single athlete:
//
//   1. invite      the first win (lib/onboarding/firstWin.ts FIRST_WINS.teach): one link made and sent.
//   2. template    when the athlete joins, open their program and start it from a template (the program builder's
//                  template picker, components/coach/program-builder.tsx) rather than an empty week.
//   3. session     run the first session with them (/coach/session: live, or the guided session on their phone).
//
// And a SAMPLE COMBINE (once #453 landed, it has): three made-up athletes through three stations, shown in the real
// combine report (components/combine/combine-report.tsx) and marked as sample data everywhere it appears. It is built
// here, in memory, every time: never saved, never sent, never a draft on the phone (lib/combine/draft.ts keepDraft is not
// called), and the athletes are not people.
//
// Pure, client-safe.

import { newEvent, recordAttempts } from '@/lib/combine/draft';
import { stationId } from '@/lib/combine/catalogue';
import type { CombineAthlete, CombineEvent } from '@/lib/combine/types';

export interface CoachStep {
  id: 'invite' | 'template' | 'session';
  title: string;
  line: string;
  href: string | null;
  cta: string | null;
}

export const COACH_STEPS: readonly CoachStep[] = [
  { id: 'invite', title: 'Invite your first client', line: 'One link, for one athlete. Done above.', href: null, cta: null },
  {
    id: 'template', title: 'Start their program from a template',
    line: 'When they join, open their program on your coach page and pick a starting template instead of an empty week.',
    href: '/coach', cta: 'Coach page',
  },
  {
    id: 'session', title: 'Run your first session',
    line: 'Live together, or a guided session on their phone. Their reps come back to you.',
    href: '/coach/session', cta: 'Sessions',
  },
];

/** Steps done so far: the invite is the only one this page can see happen. */
export function stepsDone(invited: boolean): Set<CoachStep['id']> {
  return new Set(invited ? ['invite'] : []);
}

/** The label every sample surface carries. */
export const SAMPLE_LABEL = 'Sample data';
export const SAMPLE_LINE = 'Three made-up athletes, so you can see the report before your first real combine. Nothing here is saved or sent.';
/** The real thing, for when they are ready. */
export const COMBINE_HREF = '/coach/combine';

/** A made-up athlete, open at every station (the gates are the real combine's job; sample athletes are adults). */
const sampleAthlete = (n: string): CombineAthlete => ({
  id: `sample:${n.toLowerCase()}`,
  name: `Sample athlete ${n}`,
  source: 'adhoc',
  access: { testable: true, camera: true, saveCamera: false, held: null, today: { jump: false, skills: [] } },
});

/** (new) The sample numbers: vertical jump (cm), 20 yd sprint (s), 5-10-5 (s). Plausible, different, made up. */
export const SAMPLE_RESULTS: Record<'A' | 'B' | 'C', { cmj: number[]; sprint: number[]; agility: number[] }> = {
  A: { cmj: [48.2, 51.0, 49.6], sprint: [3.12, 3.05], agility: [4.71, 4.64] },
  B: { cmj: [41.5, 43.8, 44.1], sprint: [2.98, 3.01], agility: [4.52, 4.58] },
  C: { cmj: [55.3, 53.9, 56.4], sprint: [3.24, 3.19], agility: [4.89, 4.80] },
};

/** The sample combine, built fresh. `now` fixes the timestamps (the report shows the date). */
export function sampleCombine(now: number = Date.now()): CombineEvent {
  const names = ['A', 'B', 'C'] as const;
  const cmj = stationId('cmj', 'standing');
  const sprint = stationId('sprint', '20yd');
  const agility = stationId('agility', 'pro-agility');
  let ev = newEvent({
    name: 'Sample combine',
    athletes: names.map(sampleAthlete),
    stations: [
      { id: cmj, kind: 'cmj', variant: 'standing', attempts: 3 },
      { id: sprint, kind: 'sprint', variant: '20yd', attempts: 2 },
      { id: agility, kind: 'agility', variant: 'pro-agility', attempts: 2 },
    ],
    teamName: SAMPLE_LABEL,
    now,
    localId: 'sample-combine',
  });
  for (const n of names) {
    const id = `sample:${n.toLowerCase()}`;
    const r = SAMPLE_RESULTS[n];
    ev = recordAttempts(ev, id, cmj, r.cmj.map((value) => ({ value })), now);
    ev = recordAttempts(ev, id, sprint, r.sprint.map((value) => ({ value })), now);
    ev = recordAttempts(ev, id, agility, r.agility.map((value) => ({ value })), now);
  }
  return ev;
}
