/**
 * lib/workout/plan-revision.ts — the plans already bought on /workout, revised: no depth drop in any week.
 *
 * MIRROR-COACH P1 (2026-09-25), owner decision #3: past buyers get their plan regenerated without the early depth drops,
 * plus an in-app note. Every stored WorkoutPlan carries "Depth Drop to Vertical" 4x4 in week 1 (the route saved
 * generatePlan's weeks as they were, app/api/v1/workout/plan/route.ts:49-51 before P1; plan-generator.ts put the
 * depth drop in the power pool, which is every plan's secondary pool in week 1, and a power focus's primary pool every
 * week). The protocol gate holds the same depth drop back until PRQ composite 70, flexibility 60, recovery 65 and a
 * scan inside 7 days (lib/profile/protocol.ts:189-202); these plans never asked it.
 *
 * MIRROR-COACH P2 (2026-09-25), owner decisions #22 and #23 (painfree/DECISIONS-2.md) — what P1 left, and what is now:
 *   - P1 swapped weeks 1-4 only. An adult's later depth drops were HELD (kept, marked, "wait for the depth-drop
 *     protocol"): 18 of the 36 depth drops the 12 stored plan shapes carry sit in weeks 5-12 of a 12-week plan
 *     (measured, plan-revision.test.ts). #22: SWAP EVERY DEPTH DROP IN EVERY WEEK, for everyone. reviseDepthDrops now swaps them all, and swaps
 *     out P1's held ones too; no revision makes the held mark any more.
 *   - P1's swap was "the lowest-landing exercise of the same pool not already on that DAY", which put a Trap-Bar Jump on
 *     week 1's Friday of a plan that already had one on Monday. The swap now may not repeat anything in the WEEK
 *     (plan-generator.ts depthDropSwap; the power pool has nothing left in any stored depth-drop week, so the swap is a
 *     no-flight exercise). In a week P1 revised, a P1 swap that repeats the week is picked again by the same rule.
 *   - P1 revised a plan only when its buyer opened it. #22 includes the plans nobody opened: scripts/workout/revise-all
 *     -plans.ts runs this same revision over every WorkoutPlan row (dry run first; the main session runs it at deploy).
 *   - #23: no refund. The note says what changed and that the new training plans are free for them when they ship (no
 *     date: P8 has none).
 *
 * What stays from P1:
 *   - Surgical, not a regeneration from scratch: each depth drop is replaced in its slot; every other exercise, every
 *     dose, the themes, the tier and the focus are left exactly as they were.
 *   - Marked once: each week the revision changed carries `revision`, and each replacement names what it replaced
 *     (`replaced`). The note comes from those marks, so it is on the plan from then on.
 *   - Idempotent: a week this revision marked is never revised by it again (it has no depth drop left, and its swaps
 *     are only re-picked in a week P1 marked), so a second pass changes nothing and writes nothing. Two passes racing
 *     compute the same weeks from the same row.
 *   - For WHO the plan belongs to (owner decision #6, #20): YOUTH — under 18, or a birth year the account never gave —
 *     gets no jump, bound, skip or landing drill in any week (reviseForYouth). Since the P2 review (2026-09-26) that is
 *     a READ-TIME view, never stored: stored, it outlived an adult birth year (undoYouthRevision).
 *   - Only this buyer's rows, and `weeks` only: the write is by the plan's id AND its owner's user id, and never moves
 *     tier or createdAt (dead-buys.ts matches a store charge to a plan by those two).
 *   - Never breaks the read: if the write fails, the reader still gets the revised plan and the note, and the next read
 *     tries the write again.
 * The data export (lib/prq-data-rights.ts) carries no WorkoutPlan rows, so there is no unrevised copy to reach there.
 */

import type { Prisma, PrismaClient } from '@/public/_prisma/client';
import { NO_FLIGHT_FALLBACK, PLAN_POOLS, isDepthDrop, landingOf, poolOf, swapInWeek, type PlanExercise } from './plan-generator';
import type { Pillar } from './movement-screen';
import { RELAUNCH_FREE_LINE } from './plan-sale';

/**
 * P1's mark (2026-09-25) on a week whose early depth drops it swapped, or whose later ones it held. Still recognised:
 * its swaps are picked again by the week rule, and its note is the P2 note once no depth drop is left.
 */
export const PLAN_REVISION = 'early-weeks-no-depth-drops-2026-09-25';
/** The mark a week the P2 revision changed carries (owner decision #22). A week with it is never revised by it again. */
export const PLAN_REVISION_ALL_WEEKS = 'every-week-no-depth-drops-p2-2026-09-25';
/** The mark a week the youth revision changed carries. */
export const PLAN_REVISION_YOUTH = 'youth-no-jumps-2026-09-25';

/**
 * The in-app notes. FEL's draft wording, for the owner to approve: decisions #3 and #22 asked for "an in-app note" and
 * gave no words. #23 (MIRROR-COACH P2, 2026-09-25): no refund, so none is offered; the corrected plan, and free access
 * to the relaunched plans "when they ship" — no date, because P8 has none (plan-sale.ts RELAUNCH_FREE_LINE).
 */
export const PLAN_REVISED_NOTE =
  `We changed your plan: every depth drop, in every week, is swapped for a move with a softer landing or none. ${RELAUNCH_FREE_LINE} Nothing to do.`;
export const PLAN_REVISED_NOTE_YOUTH =
  `We changed your plan: it no longer includes depth drops or jumps unless a coach assigns them. ${RELAUNCH_FREE_LINE} Nothing to do.`;

/**
 * P1's held mark and the line the page showed beside it. MIRROR-COACH P2: no revision makes the mark any more, and the
 * revision swaps out every depth drop that has it, so a plan read through the plan route never carries one. Both stay
 * exported only because components/workout-view.tsx (not this lane's file this phase) still renders them; delete them
 * with that line.
 */
export const HELD_FOR_PROTOCOL = 'depth-drop-protocol';
export const HELD_LINE = 'Held: wait until the depth-drop protocol opens for you.';

/** Who is reading a plan, for the revision. */
export type PlanAudience = 'adult' | 'youth';

/**
 * YOUTH unless the birth year makes them certainly 18 or over. An unknown age is youth — the same default as
 * lib/creator/cardProgression-server.ts isAdult — and, stricter than that function's `>= 18`, a birth year 18 years back
 * is youth too: born in December of that year they are still 17. assumption: a year-only birth date, so an 18-year-old
 * born early in the year reads as youth until the calendar year turns; for jumps in a pulled plan that errs the safe way.
 */
export function planAudience(dobYear: number | null | undefined, now: Date = new Date()): PlanAudience {
  if (typeof dobYear !== 'number' || !Number.isFinite(dobYear) || dobYear < 1900) return 'youth';
  return now.getFullYear() - dobYear > 18 ? 'adult' : 'youth';
}

/** A jump, bound, hop, skip, depth drop or landing drill: anything with a flight phase and a landing. */
export function isPlyometric(ex: { name?: unknown } | null | undefined): boolean {
  if (typeof ex?.name !== 'string') return false;
  return isDepthDrop(ex) || landingOf(ex.name) > 0 || /\b(jumps?|bounds?|hops?|skips?|plyo\w*)\b/i.test(ex.name);
}

/** P1's name for the no-flight stand-ins; since P2 the list lives in plan-generator.ts, where the depth-drop swap uses it too. */
export const YOUTH_FALLBACK: readonly string[] = NO_FLIGHT_FALLBACK;

/** A no-flight replacement for a plyometric exercise: the same pool first (pool order), then YOUTH_FALLBACK. Null when none is left. */
export function youthSwap(pool: Pillar | null, notOnDay: readonly string[] = []): PlanExercise | null {
  const ok = (e: PlanExercise) => !isPlyometric(e) && !notOnDay.includes(e.name);
  const same = pool ? PLAN_POOLS[pool].find(ok) : undefined;
  if (same) return { ...same };
  const all = Object.values(PLAN_POOLS).flat();
  for (const name of YOUTH_FALLBACK) { const e = all.find((x) => x.name === name); if (e && ok(e)) return { ...e }; }
  return null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const nameOf = (v: unknown): string | null => (isObj(v) && typeof v.name === 'string' ? v.name : null);

/**
 * The plan's weeks with no depth drop in ANY week (owner decision #22; MIRROR-COACH P2, 2026-09-25). In every week,
 * each depth drop — P1's held ones included — is swapped by plan-generator.ts swapInWeek (lowest landing from the same
 * pool not already in the week, else the first no-flight stand-in not in the week), and in a week P1 marked, each swap
 * P1 made for a depth drop that repeats something else in the week is picked again by that rule. A week this changed carries
 * PLAN_REVISION_ALL_WEEKS; a week it already marked is never revised again. `changed` is false when there was nothing
 * to do, and then `weeks` is the very value passed in. Never throws: a shape it does not recognise is left as it is.
 */
export function reviseDepthDrops(weeks: unknown): { weeks: unknown; changed: boolean } {
  if (!Array.isArray(weeks)) return { weeks, changed: false };
  let changed = false;
  const out = weeks.map((wk: unknown) => {
    if (!isObj(wk) || !Array.isArray(wk.days)) return wk;
    // In a week P1 marked, P1's swap for a depth drop is picked again only when it repeats something else in the week
    // (P1's wart; measured on P1's own output, all 18 of its swaps did). One that does not repeat is left as it is.
    const p1Week = wk.revision === PLAN_REVISION;
    const names = p1Week ? wk.days.flatMap((d: unknown) => (isObj(d) && Array.isArray(d.exercises) ? d.exercises.map(nameOf) : [])) : [];
    const repeatsInWeek = (ex: Obj) => names.filter((n) => n !== null && n === nameOf(ex)).length > 1;
    const repick = (ex: Obj) => isDepthDrop(ex)
      || (p1Week && typeof ex.replaced === 'string' && isDepthDrop({ name: ex.replaced }) && repeatsInWeek(ex));
    const r = swapInWeek(wk.days, repick, true);
    if (!r.changed) return wk;
    changed = true;
    return { ...wk, days: r.days, revision: PLAN_REVISION_ALL_WEEKS };
  });
  return changed ? { weeks: out, changed } : { weeks, changed };
}

/**
 * @deprecated P1's name, from when the adult revision stopped at week 4. It is reviseDepthDrops now (every week), kept
 * only so scripts/probes/_mirror-baseline.mts (P1's recorded baseline, not type-checked) still runs.
 */
export const reviseEarlyDepthDrops = reviseDepthDrops;

/**
 * A YOUTH reader's plan: in every week, every plyometric exercise (isPlyometric) is replaced by one with no flight
 * phase (youthSwap), or removed when none is left. Owner decision #6: no depth drops or plyometric primers for an
 * under-18 unless a coach assigns them — and nothing on a bought /workout plan was assigned by a coach. Idempotent.
 */
export function reviseForYouth(weeks: unknown): { weeks: unknown; changed: boolean } {
  if (!Array.isArray(weeks)) return { weeks, changed: false };
  let changed = false;
  const out = weeks.map((wk: unknown) => {
    if (!isObj(wk) || !Array.isArray(wk.days)) return wk;
    let weekChanged = false;
    const days = wk.days.map((day: unknown) => {
      if (!isObj(day) || !Array.isArray(day.exercises) || !day.exercises.some((ex: unknown) => isPlyometric(ex as Obj))) return day;
      weekChanged = true;
      const exercises: unknown[] = [];
      day.exercises.forEach((ex: unknown, j: number) => {
        if (!isPlyometric(ex as Obj)) { exercises.push(ex); return; }
        const onDay = [...exercises, ...(day.exercises as unknown[]).slice(j + 1)].map(nameOf).filter((x): x is string => !!x);
        const swap = youthSwap(poolOf(ex as Obj), onDay);
        const was = isObj(ex) && typeof ex.replaced === 'string' ? ex.replaced : nameOf(ex) ?? 'A jump';
        if (swap) exercises.push({ ...swap, replaced: was });
      });
      return { ...day, exercises };
    });
    if (!weekChanged) return wk;
    changed = true;
    return { ...wk, days, revision: PLAN_REVISION_YOUTH };
  });
  return changed ? { weeks: out, changed } : { weeks, changed };
}

/**
 * Undo a STORED youth revision (MIRROR-COACH P2 review, 2026-09-26). In every week reviseForYouth marked, each exercise
 * that names what it replaced goes back to that exercise as the pool lists it (a stored plan's exercises are pool
 * entries copied whole — plan-generator.ts rotatedWeek), and the youth mark comes off. An exercise whose `replaced`
 * name is in no pool is left as it is. `changed` is false, and `weeks` the very value, when no week carried the mark.
 *
 * WHY. P1's read path, and P2's backfill as first written, STORED the youth revision for every owner with no birth
 * year (decision #20: blank = youth rules until answered), and nothing ever undid it: the depth-drop revision had
 * nothing left to swap, and the note preferred the youth line. Measured on legacyWeeks(·, 'program_12w') for all six
 * focuses, revised as youth and then as adult: 0 jumps left, against the 30 (power), 22 (stability, cadence, posture)
 * and 12 (mobility, symmetry) an adult-only revision keeps — an adult who answered their birth year after that kept a
 * youth plan and the youth note for good. Youth rules are now a READ-TIME view (revisePlan); only the depth-drop
 * revision, which #22 requires for everyone, is ever stored, and a youth revision already stored is undone here.
 */
export function undoYouthRevision(weeks: unknown): { weeks: unknown; changed: boolean } {
  if (!Array.isArray(weeks)) return { weeks, changed: false };
  const byName = new Map(Object.values(PLAN_POOLS).flat().map((e) => [e.name, e]));
  let changed = false;
  const out = weeks.map((wk: unknown) => {
    if (!isObj(wk) || wk.revision !== PLAN_REVISION_YOUTH || !Array.isArray(wk.days)) return wk;
    changed = true;
    const { revision: _youth, ...rest } = wk;
    return {
      ...rest,
      days: wk.days.map((day: unknown) => (!isObj(day) || !Array.isArray(day.exercises) ? day : {
        ...day,
        exercises: day.exercises.map((ex: unknown) => {
          const was = isObj(ex) && typeof ex.replaced === 'string' ? byName.get(ex.replaced) : undefined;
          return was ? { ...was } : ex;
        }),
      })),
    };
  });
  return changed ? { weeks: out, changed } : { weeks, changed };
}

/**
 * What is STORED for a plan, whoever owns it: any stored youth revision undone, then no depth drop in any week
 * (decision #22, for everyone). Idempotent: its output carries no youth mark and no depth drop, so a second pass
 * changes nothing. The plan route's read and the backfill (lib/workout/plan-backfill.ts) both write exactly this, so
 * a row revised by both at once gets the same weeks from each — the stored weeks no longer depend on the reader.
 */
export function revisePlanForStorage(weeks: unknown): { weeks: unknown; changed: boolean } {
  const undone = undoYouthRevision(weeks);
  const adult = reviseDepthDrops(undone.weeks);
  return { weeks: adult.weeks, changed: undone.changed || adult.changed };
}

/**
 * The plan AS A READER SEES IT. ADULT: the stored revision (no depth drop in any week). YOUTH — under 18, or no birth
 * year (decisions #6, #20): no jump of any kind in any week (reviseForYouth over the stored revision), computed on
 * every read and NEVER stored (P2 review: stored, it could not be undone when an adult birth year arrived). `changed`
 * says whether the view differs from what was passed in.
 */
export function revisePlan(weeks: unknown, audience: PlanAudience): { weeks: unknown; changed: boolean } {
  const stored = revisePlanForStorage(weeks);
  if (audience !== 'youth') return stored;
  const youth = reviseForYouth(stored.weeks);
  return { weeks: youth.weeks, changed: stored.changed || youth.changed };
}

/** The note to show on this plan, or null when no revision changed it. */
export function planRevisionNote(weeks: unknown): string | null {
  if (!Array.isArray(weeks)) return null;
  const wks = weeks.filter(isObj);
  if (wks.some((w) => w.revision === PLAN_REVISION_YOUTH)) return PLAN_REVISED_NOTE_YOUTH;
  return wks.some((w) => w.revision === PLAN_REVISION_ALL_WEEKS || w.revision === PLAN_REVISION) ? PLAN_REVISED_NOTE : null;
}

/** A stored plan as the reader sees it once revised. */
export type RevisedPlanRow<T> = T & { revisionNote: string | null };

/**
 * Revise each of this buyer's plans on read, for who they are (planAudience), and store the STORAGE revision when it
 * changed (revisePlanForStorage: depth drops swapped, a stored youth revision undone — never a youth revision; P2
 * review, 2026-09-26). The reader gets their view: a youth reader the youth revision over it, on every read. So a
 * failed birth-year read (the route treats it as youth) shows a youth plan once and stores nothing that depends on it.
 * `rows` are the reader's own WorkoutPlan rows (the caller queried them by userId, all of them); the write is scoped by
 * userId again, so a row that is not theirs is never written.
 */
export async function revisePlansOnRead<T extends { id: string; weeks: unknown }>(
  db: Pick<PrismaClient, 'workoutPlan'>,
  userId: string,
  rows: readonly T[],
  audience: PlanAudience,
): Promise<RevisedPlanRow<T>[]> {
  const out: RevisedPlanRow<T>[] = [];
  for (const row of rows) {
    const stored = revisePlanForStorage(row.weeks);
    if (stored.changed) {
      try {
        await db.workoutPlan.updateMany({ where: { id: row.id, userId }, data: { weeks: stored.weeks as Prisma.InputJsonValue } });
      } catch (e) {
        console.error('[workout/plan-revision] the revised plan was not stored; it is shown revised anyway and the next read tries again', e);
      }
    }
    const view = audience === 'youth' ? reviseForYouth(stored.weeks).weeks : stored.weeks;
    out.push({ ...row, weeks: view, revisionNote: planRevisionNote(view) });
  }
  return out;
}
