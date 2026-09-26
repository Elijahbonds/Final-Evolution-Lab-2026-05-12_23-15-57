/**
 * lib/workout/plan-revision.ts — the plans already bought on /workout, revised on read: no depth drop in weeks 1-4.
 *
 * MIRROR-COACH P1 (2026-09-25), owner decision #3: past buyers get their plan regenerated without the early depth drops,
 * plus an in-app note. Every stored WorkoutPlan carries "Depth Drop to Vertical" 4x4 in week 1 (the route saved
 * generatePlan's weeks as they were, app/api/v1/workout/plan/route.ts:49-51 before today; plan-generator.ts put the
 * depth drop in the power pool, which is every plan's secondary pool in week 1, and a power focus's primary pool every
 * week). The protocol gate holds the same depth drop back until PRQ composite 70, flexibility 60, recovery 65 and a
 * scan inside 7 days (lib/profile/protocol.ts:189-202); these plans never asked it.
 *
 * No script runs against the database, so the revision is lazy, the pattern lib/wallet/dead-buy-refunds.ts uses: the
 * first read of a buyer's plans after the deploy revises each one and writes it back.
 *
 *   - Surgical, not a regeneration from scratch: in weeks 1-4 only, each depth drop is replaced by the lowest-landing
 *     exercise of the same pool not already on that day (plan-generator.ts earlyWeekSwap). A depth drop whose pool
 *     cannot be found is removed without a replacement. Everything else in the plan is left exactly as it was: every
 *     other exercise, every dose, weeks 5 and on, the tier and the focus.
 *   - Idempotent: a revised plan has no depth drop left in weeks 1-4, so a second read changes nothing and writes
 *     nothing. Two reads racing write the same weeks.
 *   - Marked once: each week the revision changed carries `revision: PLAN_REVISION`, and each replacement names what it
 *     replaced (`replaced`). The note comes from that mark, so it is on the plan from then on.
 *   - Only this buyer's rows: the write is by the plan's id AND the reader's user id.
 *   - Writes `weeks` and nothing else. dead-buys.ts matches a store charge to a plan by its tier and createdAt, and
 *     neither moves.
 *   - Never breaks the read: if the write fails, the reader still gets the revised plan and the note, and the next read
 *     tries the write again.
 *
 * FOUND IN THE P1 REVIEW, SAME DAY — the revision above stopped at week 4, and owner decision #6 does not:
 *   - Under-18s get no depth drops or plyometric primers unless a coach assigns them. A 12-week plan kept "Depth Drop to
 *     Vertical" 4x4 in weeks 5-12 (18 of them across the six foci; a mobility focus in weeks 6 and 11), and the week 1-4
 *     swap put a Trap-Bar Jump or a bound in its place. Buying needed only an "I am 13 or older" tick, and the GET route
 *     served these plans with no age check although User.dobYear exists. So the revision now knows who is reading
 *     (planAudience): for YOUTH — under 18, or an age the account never gave — every jump, bound, skip and landing drill
 *     in EVERY week is replaced by an exercise with no flight phase (reviseForYouth). For an ADULT the early depth drops
 *     are swapped as before, and each later one is HELD — kept, marked, and said to wait for the depth-drop protocol
 *     (holdLateDepthDrops) — rather than shipped with no gate.
 *   - The note's words are FEL's draft, not the owner's: decision #3 asked for "an in-app note" and gave no wording
 *     (DECISIONS.md has none), so these lines are for the owner to approve.
 *   - Every plan the buyer holds is revised on read, not the newest ten (the route read `take: 10`).
 * The data export (lib/prq-data-rights.ts) carries no WorkoutPlan rows, so there is no unrevised copy to reach there.
 */

import type { Prisma, PrismaClient } from '@/public/_prisma/client';
import { EARLY_WEEKS, PLAN_POOLS, earlyWeekSwap, isDepthDrop, landingOf, poolOf, type PlanExercise } from './plan-generator';
import type { Pillar } from './movement-screen';

/** The mark a week the adult revision changed carries. A later revision would take a new id, so this one is never re-applied by it. */
export const PLAN_REVISION = 'early-weeks-no-depth-drops-2026-09-25';
/** The mark a week the youth revision changed carries. */
export const PLAN_REVISION_YOUTH = 'youth-no-jumps-2026-09-25';

/**
 * The in-app notes. FEL's draft wording, pending the owner's approval: decision #3 asked for an in-app note and gave no
 * words (MIRROR-COACH P1 review, 2026-09-25 — this used to say "word for word (owner decision #3)", which was not so).
 */
export const PLAN_REVISED_NOTE = 'We changed your plan: early weeks no longer include depth drops. Nothing to do.';
export const PLAN_REVISED_NOTE_HELD =
  'We changed your plan: early weeks no longer include depth drops, and the later ones are held until the depth-drop protocol opens for you. Nothing to do.';
export const PLAN_REVISED_NOTE_YOUTH =
  'We changed your plan: it no longer includes depth drops or jumps unless a coach assigns them. Nothing to do.';

/** What a later-week depth drop on an adult's plan is marked with, and what the page says beside it. */
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

/**
 * When a pool has nothing without a landing (the power pool is all jumps), these stand in, first one not already on
 * the day. assumption: chosen as the no-flight exercises nearest a jump's intent (drive, hip strength, single-leg
 * control), not measured.
 */
export const YOUTH_FALLBACK: readonly string[] = ['Wall Drive March', 'Banded Monster Walk', 'Single-Leg RDL', 'Deadbug w/ Reach'];

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
 * The plan's weeks without a depth drop in weeks 1-4. `changed` is false when there was nothing to take out, and then
 * `weeks` is the very value passed in. Never throws: a shape it does not recognise is left as it is.
 */
export function reviseEarlyDepthDrops(weeks: unknown): { weeks: unknown; changed: boolean } {
  if (!Array.isArray(weeks)) return { weeks, changed: false };
  let changed = false;
  const out = weeks.map((wk: unknown, i: number) => {
    if (!isObj(wk) || !Array.isArray(wk.days)) return wk;
    const n = typeof wk.week === 'number' && Number.isFinite(wk.week) ? wk.week : i + 1;
    if (n > EARLY_WEEKS) return wk;
    let weekChanged = false;
    const days = wk.days.map((day: unknown) => {
      if (!isObj(day) || !Array.isArray(day.exercises) || !day.exercises.some(isDepthDrop)) return day;
      weekChanged = true;
      const exercises: unknown[] = [];
      day.exercises.forEach((ex: unknown, j: number) => {
        if (!isDepthDrop(ex as Obj)) { exercises.push(ex); return; }
        // what else is on the day: what is already kept or swapped in, and what is still to come
        const onDay = [...exercises, ...(day.exercises as unknown[]).slice(j + 1)].map(nameOf).filter((s): s is string => !!s);
        const pool = poolOf(ex as Obj);
        const swap = pool ? earlyWeekSwap(pool, onDay) : null;
        if (swap) exercises.push({ ...swap, replaced: nameOf(ex) ?? 'Depth drop' });
      });
      return { ...day, exercises };
    });
    if (!weekChanged) return wk;
    changed = true;
    return { ...wk, days, revision: PLAN_REVISION };
  });
  return changed ? { weeks: out, changed } : { weeks, changed };
}

/**
 * An adult's weeks after week 4: each depth drop is kept and marked `held` (HELD_FOR_PROTOCOL), so the page says to
 * wait for the depth-drop protocol instead of prescribing it ungated. Idempotent; never throws.
 */
export function holdLateDepthDrops(weeks: unknown): { weeks: unknown; changed: boolean } {
  if (!Array.isArray(weeks)) return { weeks, changed: false };
  let changed = false;
  const out = weeks.map((wk: unknown, i: number) => {
    if (!isObj(wk) || !Array.isArray(wk.days)) return wk;
    const n = typeof wk.week === 'number' && Number.isFinite(wk.week) ? wk.week : i + 1;
    if (n <= EARLY_WEEKS) return wk;
    let weekChanged = false;
    const days = wk.days.map((day: unknown) => {
      if (!isObj(day) || !Array.isArray(day.exercises)) return day;
      if (!day.exercises.some((ex: unknown) => isDepthDrop(ex as Obj) && (ex as Obj).held !== HELD_FOR_PROTOCOL)) return day;
      weekChanged = true;
      return { ...day, exercises: day.exercises.map((ex: unknown) => (isDepthDrop(ex as Obj) ? { ...(ex as Obj), held: HELD_FOR_PROTOCOL } : ex)) };
    });
    if (!weekChanged) return wk;
    changed = true;
    return { ...wk, days, revision: PLAN_REVISION };
  });
  return changed ? { weeks: out, changed } : { weeks, changed };
}

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
 * The whole revision for one reader. ADULT: no depth drop in weeks 1-4 (swapped), later ones held. YOUTH: no jump of
 * any kind in any week. `weeks` is the very value passed in when nothing changed.
 */
export function revisePlan(weeks: unknown, audience: PlanAudience): { weeks: unknown; changed: boolean } {
  if (audience === 'youth') return reviseForYouth(weeks);
  const early = reviseEarlyDepthDrops(weeks);
  const late = holdLateDepthDrops(early.weeks);
  return { weeks: late.weeks, changed: early.changed || late.changed };
}

/** The note to show on this plan, or null when no revision changed it. */
export function planRevisionNote(weeks: unknown): string | null {
  if (!Array.isArray(weeks)) return null;
  const wks = weeks.filter(isObj);
  if (wks.some((w) => w.revision === PLAN_REVISION_YOUTH)) return PLAN_REVISED_NOTE_YOUTH;
  const exercises = wks.flatMap((w) => (Array.isArray(w.days) ? w.days : [])).filter(isObj)
    .flatMap((d) => (Array.isArray(d.exercises) ? d.exercises : [])).filter(isObj);
  if (exercises.some((e) => e.held === HELD_FOR_PROTOCOL)) return PLAN_REVISED_NOTE_HELD;
  return wks.some((w) => w.revision === PLAN_REVISION) ? PLAN_REVISED_NOTE : null;
}

/** A stored plan as the reader sees it once revised. */
export type RevisedPlanRow<T> = T & { revisionNote: string | null };

/**
 * Revise each of this buyer's plans on read, for who they are (planAudience), and store what changed. `rows` are the
 * reader's own WorkoutPlan rows (the caller queried them by userId); the write is scoped by userId again, so a row that
 * is not theirs is never written.
 */
export async function revisePlansOnRead<T extends { id: string; weeks: unknown }>(
  db: Pick<PrismaClient, 'workoutPlan'>,
  userId: string,
  rows: readonly T[],
  audience: PlanAudience,
): Promise<RevisedPlanRow<T>[]> {
  const out: RevisedPlanRow<T>[] = [];
  for (const row of rows) {
    const r = revisePlan(row.weeks, audience);
    if (r.changed) {
      try {
        await db.workoutPlan.updateMany({ where: { id: row.id, userId }, data: { weeks: r.weeks as Prisma.InputJsonValue } });
      } catch (e) {
        console.error('[workout/plan-revision] the revised plan was not stored; it is shown revised anyway and the next read tries again', e);
      }
    }
    out.push({ ...row, weeks: r.weeks, revisionNote: planRevisionNote(r.weeks) });
  }
  return out;
}
