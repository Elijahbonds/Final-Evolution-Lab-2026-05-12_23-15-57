// duplicate — copy a program onto another athlete, or onto a squad.
//
// THE RETENTION FEATURE, from the audit: "no programming leverage — no templates, no duplicate-and-tweak, no
// assigning one program to a squad. TrueCoach's whole retention story is that programming is fast; a coach who
// writes ten identical programs by hand leaves." Programs here were created BLANK, one client at a time, and every
// block, session and exercise typed again for the eleventh athlete.
//
// One primitive covers both jobs, because they are the same operation: take a program that exists, and write it for
// somebody else starting on a new date. Duplicating for the same athlete is the n=1 case of assigning to a squad.
//
// WHAT IT CARRIES AND WHAT IT DELIBERATELY DROPS:
//
//   · CARRIES the shape — blocks, sessions, exercises, sets, reps, load, tempo, rest, and the coach's own notes on
//     the prescription, because that is the thinking that took the time.
//   · DROPS everything that belonged to the first athlete: their logs, their completions, their thread, and the
//     block target DATES, which are rebased onto the new start. A copied program that arrives pre-marked with
//     another athlete's progress is worse than no copy at all, and dates that point at last month make the new
//     athlete's first session already overdue.
//
// Pure: a tree in, the payloads to write out. The route does the writing.
import type { ProgramTree, TreeBlock } from './loop';

export interface DuplicateSpec {
  /** What to call the copies. `{name}` is replaced with the source program's name. */
  nameTemplate?: string;
  /** Day the copy starts. Block target dates are rebased relative to the source's first block. */
  startDate: Date;
}

export interface BlockDraft {
  order: number; label: string; targetDate: string | null;
  sessions: { order: number; label: string; exercises: Omit<ProgramTree['blocks'][number]['sessions'][number]['exercises'][number], 'id'>[] }[];
}

export interface ProgramDraft {
  coachId: string;
  clientId: string;
  name: string;
  startDate: Date;
  blocks: BlockDraft[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The first dated block in the source, which every other date is measured against. */
function anchorDate(blocks: readonly TreeBlock[]): number | null {
  const dated = blocks
    .map((b) => (b.targetDate ? Date.parse(b.targetDate) : NaN))
    .filter((t) => Number.isFinite(t)) as number[];
  return dated.length ? Math.min(...dated) : null;
}

/**
 * Rebase one block's target date onto a new start, keeping the GAPS between blocks intact. A four-week block that sat
 * three weeks after the first one still sits three weeks after the new first one.
 */
export function rebaseTargetDate(targetDate: string | null, anchorMs: number | null, startDate: Date): string | null {
  if (!targetDate || anchorMs == null) return null;
  const t = Date.parse(targetDate);
  if (!Number.isFinite(t)) return null;
  const offsetDays = Math.round((t - anchorMs) / DAY_MS);
  return new Date(startDate.getTime() + offsetDays * DAY_MS).toISOString();
}

/** Copy a program for one athlete. */
export function draftCopy(source: ProgramTree, clientId: string, spec: DuplicateSpec): ProgramDraft {
  const anchor = anchorDate(source.blocks);
  const name = (spec.nameTemplate ?? '{name}').replace('{name}', source.name);
  return {
    coachId: source.coachId,
    clientId,
    name,
    startDate: spec.startDate,
    blocks: [...source.blocks]
      .sort((a, b) => a.order - b.order)
      .map((b) => ({
        order: b.order,
        label: b.label,
        targetDate: rebaseTargetDate(b.targetDate, anchor, spec.startDate),
        sessions: [...b.sessions]
          .sort((x, y) => x.order - y.order)
          .map((s) => ({
            order: s.order,
            label: s.label,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            exercises: [...s.exercises].sort((x, y) => x.order - y.order).map(({ id, ...rest }) => ({ ...rest })),
          })),
      })),
  };
}

/**
 * Assign one program to many athletes at once — the squad case.
 *
 * A client already holding a copy is SKIPPED rather than given a second one: a coach who taps assign twice should
 * not owe nine athletes an explanation for the duplicate in their app.
 */
export function draftSquad(
  source: ProgramTree,
  clientIds: readonly string[],
  spec: DuplicateSpec,
  alreadyHave: Iterable<string> = [],
): { drafts: ProgramDraft[]; skipped: string[] } {
  const have = new Set(alreadyHave);
  const drafts: ProgramDraft[] = [];
  const skipped: string[] = [];
  for (const id of new Set(clientIds)) {
    if (id === source.coachId) { skipped.push(id); continue; }   // a coach is not their own client
    if (have.has(id)) { skipped.push(id); continue; }
    drafts.push(draftCopy(source, id, spec));
  }
  return { drafts, skipped };
}
