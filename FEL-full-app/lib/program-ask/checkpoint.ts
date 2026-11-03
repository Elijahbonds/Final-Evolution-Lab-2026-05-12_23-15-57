// lib/program-ask/checkpoint.ts — PROGRAM-ASK (2026-11-02): what a block's checkpoint decides, and the plan with those
// decisions laid over it.
//
// THE RULE (the signature programs' own, lib/signature/adapt.ts, read for a plan with no camera retests):
//   1. Something hurt (the person says so, or today's pain decision is anything but 'continue': adapt.ts painHolds)
//      → never move up: the block's lighter week runs again;
//   2. readiness Low on DRAFT_LOW_CHECKS or more days of the last week (lib/coach/readiness/thresholds.ts, read through
//      adapt.ts readinessRead) → repeat the block;
//   3. most sets reached the target with reps to spare → advance (the next block's harder versions);
//   4. otherwise → repeat the block once. A block repeats at most MAX_REPEATS times; after that the plan moves on, since
//      the next block starts back at the low end of the reps anyway.
// The person answers one question on the phone (copy.ts CHECKPOINT_LINES.question); nothing is measured or sent.
//
// Pure. Client-safe.
import type { PainDecision } from '@/lib/health/painRule';
import { DRAFT_LOW_CHECKS } from '@/lib/coach/readiness/thresholds';
import { painHolds, readinessRead } from '@/lib/signature/adapt';
import { CHECKPOINT_LINES } from './copy';
import type { BuiltProgram, ProgramWeek } from './types';

export const MAX_REPEATS = 1;
/** Something hurt: the lighter week may run again up to this many times before the plan simply holds where it is. */
export const MAX_LIGHTER_RUNS = 3;

export type CheckpointKind = 'advance' | 'repeat' | 'repeat-lighter';

export interface CheckpointInput {
  /** Did most sets of the last hard week reach the target with 2+ reps left? null = not answered. */
  hitTargets: boolean | null;
  /** The person said something hurt. */
  pain: boolean;
  /** Today's pain decision, when the server has one. */
  painDecision?: PainDecision | null;
  /** Low readiness days in the last week (null: no checks). */
  lowDays?: number | null;
  /** Times this block has already repeated. */
  repeats: number;
}

export interface CheckpointDecision { kind: CheckpointKind; line: string }

export function checkpointDecision(i: CheckpointInput): CheckpointDecision {
  if (i.pain || painHolds(i.painDecision ?? null)) return { kind: 'repeat-lighter', line: CHECKPOINT_LINES.pain };
  const roomToRepeat = i.repeats < MAX_REPEATS;
  if (readinessRead(i.lowDays ?? null, DRAFT_LOW_CHECKS) === 'down' && roomToRepeat) return { kind: 'repeat', line: CHECKPOINT_LINES.repeat };
  if (i.hitTargets === true || !roomToRepeat) return { kind: 'advance', line: CHECKPOINT_LINES.advance };
  return { kind: 'repeat', line: CHECKPOINT_LINES.repeat };
}

/** True when a decision makes the plan harder (the never-harder-on-pain guard's test reads it). */
export const isHarder = (k: CheckpointKind): boolean => k === 'advance';

export interface Decision { afterWeek: number; kind: CheckpointKind }

/**
 * The plan as it will be run: the built weeks with each checkpoint's decision applied. 'repeat' runs the block's weeks
 * again; 'repeat-lighter' runs only its lighter week again; 'advance' goes on. Week numbers and session ids are the
 * running order's ("w6:d1"), so the device's done marks stay put once a decision is taken.
 */
export function plannedWeeks(p: Pick<BuiltProgram, 'weeks'>, decisions: readonly Decision[]): ProgramWeek[] {
  const out: ProgramWeek[] = [];
  const push = (w: ProgramWeek) => {
    const n = out.length + 1;
    out.push({ ...w, n, days: w.days.map((d, k) => ({ ...d, id: `w${n}:d${k + 1}` })) });
  };
  const blocks = [...new Set(p.weeks.map((w) => w.block))];
  for (const b of blocks) {
    const weeks = p.weeks.filter((w) => w.block === b);
    for (const w of weeks) push(w);
    let repeats = 0, lighterRuns = 0;
    for (;;) {
      const d = decisions.find((x) => x.afterWeek === out.length);
      if (!d || d.kind === 'advance') break;
      if (d.kind === 'repeat-lighter') {
        if (lighterRuns >= MAX_LIGHTER_RUNS) break;
        lighterRuns++;
        push(weeks[weeks.length - 1]);
        continue;
      }
      if (repeats >= MAX_REPEATS) break;
      repeats++;
      for (const w of weeks) push(w);
    }
  }
  return out;
}

export interface Position {
  week: ProgramWeek | null;
  dayIndex: number;
  /** A checkpoint week whose sessions are all done and whose decision has not been taken. */
  pendingCheckpoint: ProgramWeek | null;
  done: number;
  total: number;
}

/** The next session to play, in order (the first not done), and any checkpoint waiting for its answer. */
export function positionIn(weeks: readonly ProgramWeek[], done: Readonly<Record<string, string>>, decisions: readonly Decision[]): Position {
  let total = 0, n = 0;
  let next: { week: ProgramWeek; dayIndex: number } | null = null;
  let pending: ProgramWeek | null = null;
  for (const w of weeks) {
    w.days.forEach((d, k) => { total++; if (done[d.id]) n++; else if (!next && !pending) next = { week: w, dayIndex: k }; });
    if (!pending && w.checkpoint && w.days.every((d) => done[d.id]) && !decisions.some((x) => x.afterWeek === w.n)) pending = w;
  }
  const nx = next as { week: ProgramWeek; dayIndex: number } | null;
  return { week: pending ? null : nx?.week ?? null, dayIndex: pending ? 0 : nx?.dayIndex ?? 0, pendingCheckpoint: pending, done: n, total };
}
