/**
 * lib/workout/plan-generator.ts
 * =============================
 * PURE workout-plan generator. Turns a movement-screen weakness into a
 * structured 4-week plan (product plan_4w) and a 12-week upsell (program_12w).
 * The AI Coach can enrich copy at runtime, but the STRUCTURE is deterministic
 * and testable here.
 *
 * MIRROR-COACH P1 (2026-09-25): NOT ON SALE. /workout sold these plans for shards until today, and the owner pulled
 * them (decision #3): the same flat plan for everyone, sets and reps that never change across 12 weeks, and "Depth
 * Drop to Vertical" 4x4 in week 1 with no gate. Measured with tsx over every focus x tier: a depth drop on week 1
 * Friday in all 12 plans, and a power focus had one in each of weeks 1-4. The protocol gate holds that same depth drop
 * back until PRQ composite 70, flexibility 60, recovery 65 and a scan inside 7 days (lib/profile/protocol.ts:189-202).
 * The relaunch will be built on FEL templates behind that gate. Until then this generator only has to agree with the
 * revision of the plans already bought (lib/workout/plan-revision.ts).
 *
 * MIRROR-COACH P2 (2026-09-25), owner decision #22: NO DEPTH DROP IN ANY WEEK. P1 swapped weeks 1-4 only and left
 * weeks 5-12 carrying the depth drop (held, for an adult). Measured over the 12 plans /workout stored (legacyWeeks
 * below): 36 depth drops in 36 weeks — a power focus has one in every week, every other focus in weeks 1, 6 and 11 of
 * a 12-week plan (week 1 of a 4-week one). Now every one of them is swapped, by the same function the revision uses
 * (swapInWeek), so a plan made now and a stored plan once revised are still the same plan (plan-revision.test.ts).
 *
 * P2 also fixes P1's known wart: P1 picked "the lowest-landing exercise of the same pool not already on that DAY", so
 * week 1's Friday depth drop became a Trap-Bar Jump — already on that week's Monday. The swap now may not repeat
 * anything in the WEEK. Measured: in all 36 of those weeks the power pool's other two exercises (Trap-Bar Jump and
 * Approach Bound) are both already in the week — the rotation puts each power exercise on one of the three days — so
 * the same pool never has an option left, and every swap falls through to NO_FLIGHT_FALLBACK (depthDropSwap).
 */

import type { Pillar, ScreenResult } from './movement-screen';
import { PILLAR_LABELS } from './movement-screen';

export interface PlanExercise {
  name: string; sets: number; reps: string; cue: string; targets: Pillar;
  /** Only on a stored plan the revision changed (plan-revision.ts): the name of the exercise this one replaced. */
  replaced?: string;
  /**
   * P1 only (2026-09-25): an adult's depth drop after week 4 was kept and marked held (HELD_FOR_PROTOCOL). Since
   * MIRROR-COACH P2 no revision makes this mark and the revision swaps every marked depth drop out, so a plan read
   * through the plan route never carries one; the field stays so components/workout-view.tsx still type-checks.
   */
  held?: string;
}
export interface PlanDay { day: string; block: string; exercises: PlanExercise[] }
export interface PlanWeek {
  week: number; theme: string; days: PlanDay[];
  /** Only on a week of a stored plan the revision changed: which revision (plan-revision.ts). */
  revision?: string;
}
export interface WorkoutPlanStruct { tier: 'plan_4w' | 'program_12w'; focus: Pillar; focusLabel: string; weeks: PlanWeek[] }

// TUNE(elijah) — corrective exercise pools keyed by weakest pillar.
const POOLS: Record<Pillar, PlanExercise[]> = {
  power: [
    { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'Absorb soft, explode tall', targets: 'power' },
    { name: 'Trap-Bar Jump', sets: 5, reps: '3', cue: 'Drive the floor away', targets: 'power' },
    { name: 'Approach Bound', sets: 4, reps: '5 ea', cue: 'Penultimate long, last short', targets: 'power' },
  ],
  mobility: [
    { name: 'ATG Split Squat', sets: 3, reps: '8 ea', cue: 'Knee over toe, control', targets: 'mobility' },
    { name: 'Cossack Squat', sets: 3, reps: '6 ea', cue: 'Stay tall through the shift', targets: 'mobility' },
    { name: 'Ankle Rocker w/ Band', sets: 3, reps: '10 ea', cue: 'Heel glued down', targets: 'mobility' },
  ],
  symmetry: [
    { name: 'Single-Leg RDL', sets: 3, reps: '8 ea', cue: 'Hips square, slow lower', targets: 'symmetry' },
    { name: 'Rear-Foot Elevated Split Squat', sets: 3, reps: '8 ea', cue: 'Even push both legs', targets: 'symmetry' },
    { name: 'Single-Arm Carry', sets: 3, reps: '30m ea', cue: 'Resist the lean', targets: 'symmetry' },
  ],
  stability: [
    { name: 'Lateral Bound + Stick', sets: 4, reps: '5 ea', cue: 'Land quiet, knee tracks toe', targets: 'stability' },
    { name: 'Copenhagen Plank', sets: 3, reps: '20s ea', cue: 'Adductor drives up', targets: 'stability' },
    { name: 'Banded Monster Walk', sets: 3, reps: '12 ea', cue: 'Knees push out', targets: 'stability' },
  ],
  cadence: [
    { name: 'A-Skip', sets: 4, reps: '20m', cue: 'Quick ground contact', targets: 'cadence' },
    { name: 'Metronome Stride 180', sets: 4, reps: '30s', cue: 'Match the beep', targets: 'cadence' },
    { name: 'Wall Drive March', sets: 3, reps: '10 ea', cue: 'Punch knee, cycle fast', targets: 'cadence' },
  ],
  posture: [
    { name: 'Wall Posture Hold', sets: 3, reps: '30s', cue: 'Ribs down, tall spine', targets: 'posture' },
    { name: 'Landing Trunk Control', sets: 4, reps: '5', cue: 'Chest proud on landing', targets: 'posture' },
    { name: 'Deadbug w/ Reach', sets: 3, reps: '8 ea', cue: 'Low back pinned', targets: 'posture' },
  ],
};

/** The pools, read-only, so a test can rebuild what a plan looked like before the revision. */
export const PLAN_POOLS: Readonly<Record<Pillar, readonly PlanExercise[]>> = POOLS;

/**
 * P1's boundary (owner decision #3, 2026-09-25): weeks 1 to this one lost their depth drops first. Since MIRROR-COACH
 * P2 no week carries one (decision #22); the constant stays for the P1 proofs' "weeks 1-4 / weeks 5 on" split
 * (app/dev/mirror-coach-p1, scripts/probes/_mirror-baseline.mts).
 */
export const EARLY_WEEKS = 4;

/** A plyometric depth drop, whatever the variation calls itself ("Depth Drop to Vertical", "depth-drop jump"). */
export function isDepthDrop(ex: { name?: unknown } | null | undefined): boolean {
  return typeof ex?.name === 'string' && /\bdepth[\s-]*drops?\b/i.test(ex.name);
}

// How hard each pool exercise lands, lowest first. An exercise not listed has no flight phase, so it lands nothing (0).
// assumption: ranked by the landing each one asks for, not measured. A depth drop falls from a box and rebounds (3). A
// bound lands on one leg at speed, again and again (2). A trap-bar jump, a skip and the landing drill land from the
// athlete's own height with no drop (1). Every exercise in the power pool has a landing, so its lowest is the trap-bar
// jump: it lands softer than the depth drop it replaces, but it is not impact-free.
const LANDING: Readonly<Record<string, number>> = {
  'Depth Drop to Vertical': 3,
  'Approach Bound': 2, 'Lateral Bound + Stick': 2,
  'Trap-Bar Jump': 1, 'A-Skip': 1, 'Landing Trunk Control': 1,
};
export const landingOf = (name: string): number => LANDING[name] ?? 0;

/**
 * No-flight stand-ins, in order: what a depth drop becomes when its own pool has nothing left that is not already in
 * the week (every depth-drop week of every stored plan, measured above), and what a youth reader's jump becomes when
 * its pool is all jumps (plan-revision.ts youthSwap, where P1 named this list YOUTH_FALLBACK). Each lands nothing
 * (landingOf 0), so each is lower-landing than anything in the power pool. assumption: chosen as the no-flight
 * exercises nearest a jump's intent (drive, hip strength, single-leg control), not measured.
 */
export const NO_FLIGHT_FALLBACK: readonly string[] = ['Wall Drive March', 'Banded Monster Walk', 'Single-Leg RDL', 'Deadbug w/ Reach'];

const lowestLanding = (xs: readonly PlanExercise[]): PlanExercise | null =>
  xs.length ? xs.reduce((a, b) => (landingOf(b.name) < landingOf(a.name) ? b : a)) : null;

/**
 * What a depth drop becomes (MIRROR-COACH P2, 2026-09-25), first match wins, as a copy a caller may mark:
 *   1. the lowest-landing exercise of the SAME pool that is not a depth drop and not already in the WEEK (pool order
 *      breaks a tie) — the owner's rule, and P1's, with the week (not the day) as what it may not repeat;
 *   2. else the first NO_FLIGHT_FALLBACK exercise not already in the week (the case for every stored plan: see above);
 *   3. else, the last resort for a shape no stored plan has, the lowest-landing same-pool exercise not on the DAY
 *      (P1's rule);
 *   4. else null: the caller removes the depth drop.
 * `pool` null (a depth drop no pool lists and with no targets tag) skips 1 and 3.
 */
export function depthDropSwap(pool: Pillar | null, notInWeek: readonly string[] = [], notOnDay: readonly string[] = []): PlanExercise | null {
  const same = pool ? (POOLS[pool] ?? []).filter((e) => !isDepthDrop(e)) : [];
  const all = Object.values(POOLS).flat();
  const pick = lowestLanding(same.filter((e) => !notInWeek.includes(e.name)))
    ?? NO_FLIGHT_FALLBACK.map((n) => all.find((e) => e.name === n)).find((e): e is PlanExercise => !!e && !notInWeek.includes(e.name))
    ?? lowestLanding(same.filter((e) => !notOnDay.includes(e.name)));
  return pick ? { ...pick } : null;
}

/** The pool an exercise came from: its own `targets` tag, or else the pool that lists it by name. */
export function poolOf(ex: { name?: unknown; targets?: unknown }): Pillar | null {
  if (typeof ex.targets === 'string' && Object.prototype.hasOwnProperty.call(POOLS, ex.targets)) return ex.targets as Pillar;
  return (Object.keys(POOLS) as Pillar[]).find((p) => POOLS[p].some((e) => e.name === ex.name)) ?? null;
}

type Loose = Record<string, unknown>;
const isLoose = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const nameOf = (v: unknown): string | null => (isLoose(v) && typeof v.name === 'string' ? v.name : null);

/**
 * One week's days with each slot `repick` names filled by depthDropSwap — the one swap both the generator and the
 * revision of a stored plan (plan-revision.ts reviseDepthDrops) run, so the two cannot drift. MIRROR-COACH P2
 * (2026-09-25).
 *
 *   - Slots go in day order, then slot order. What a pick may not repeat is everything else in the week as it stands
 *     at that moment: what is kept, what was swapped in before this slot, and what is still to come.
 *   - The pool is the depth drop's own; for a slot that is not a depth drop (P1's swap for one, re-picked) it is the
 *     pool of the exercise that slot `replaced`, else its own.
 *   - A depth drop with no swap left is removed. Any other slot keeps itself when nothing different is left for it.
 *   - `mark` puts `replaced` on each new pick: the name the slot held before any revision (a re-picked P1 swap keeps
 *     the depth drop it replaced). A generated plan carries no marks.
 *   - Shapes it does not know are left as they are. When nothing changed, `days` is the very array passed in; a day
 *     nothing changed on is the very object passed in.
 */
export function swapInWeek(days: readonly unknown[], repick: (ex: Loose) => boolean, mark: boolean): { days: unknown[]; changed: boolean } {
  const work: unknown[][] = days.map((d) => (isLoose(d) && Array.isArray(d.exercises) ? [...d.exercises] : []));
  const touched = new Set<number>();
  for (let di = 0; di < work.length; di++) {
    for (let si = 0; si < work[di].length; si++) {
      const ex = work[di][si];
      if (!isLoose(ex) || !repick(ex)) continue;
      const others = (d: number) => work[d].filter((_, k) => !(d === di && k === si)).map(nameOf).filter((s): s is string => !!s);
      const inWeek = work.flatMap((_, d) => others(d));
      const drop = isDepthDrop(ex);
      const was = typeof ex.replaced === 'string' ? ex.replaced : nameOf(ex) ?? 'Depth drop';
      const pool = drop ? poolOf(ex) : (poolOf({ name: ex.replaced }) ?? poolOf(ex));
      const swap = depthDropSwap(pool, inWeek, others(di));
      if (!drop && (!swap || swap.name === nameOf(ex))) continue;
      touched.add(di);
      if (!swap) { work[di].splice(si, 1); si--; continue; }
      work[di][si] = mark ? { ...swap, replaced: was } : swap;
    }
  }
  if (!touched.size) return { days: days as unknown[], changed: false };
  return { days: days.map((d, di) => (touched.has(di) ? { ...(d as Loose), exercises: work[di] } : d)), changed: true };
}

const DAYS_4 = ['Mon', 'Wed', 'Fri'];
const THEMES = ['Foundation', 'Build', 'Intensify', 'Express'];

/** The pool rotation every plan has used since /workout shipped, before any swap. */
function rotatedWeek(week: number, focus: Pillar): PlanWeek {
  const primary = POOLS[focus];
  // Rotate a secondary pool so the plan is balanced, not one-note.
  const secondaryKey = (Object.keys(POOLS) as Pillar[]).filter((p) => p !== focus)[(week - 1) % 5];
  const secondary = POOLS[secondaryKey];
  const days: PlanDay[] = DAYS_4.map((d, i) => ({
    day: d, block: i === 1 ? 'Corrective + Skill' : 'Strength + Power',
    exercises: [primary[(week + i) % primary.length], secondary[(week + i) % secondary.length]].map((e) => ({ ...e })),
  }));
  return { week, theme: THEMES[(week - 1) % THEMES.length], days };
}

function weekFor(week: number, focus: Pillar): PlanWeek {
  const raw = rotatedWeek(week, focus);
  // MIRROR-COACH P2 (2026-09-25): no depth drop in ANY week (P1 stopped at week 4), by the revision's own swap.
  return { ...raw, days: swapInWeek(raw.days, isDepthDrop, false).days as PlanDay[] };
}

export function generatePlan(screen: ScreenResult, tier: 'plan_4w' | 'program_12w' = 'plan_4w'): WorkoutPlanStruct {
  const focus = screen.weakest;
  const weekCount = tier === 'program_12w' ? 12 : 4;
  const weeks: PlanWeek[] = [];
  for (let w = 1; w <= weekCount; w++) weeks.push(weekFor(w, focus));
  return { tier, focus, focusLabel: PILLAR_LABELS[focus], weeks };
}

/**
 * The weeks /workout stored for a plan bought before 2026-09-25 (the POST route saved generatePlan's weeks as they
 * were): the same rotation, depth drops and all, as plain JSON — what the database hands back. For tests, the dev
 * proofs and nothing else: nothing may be generated this way again.
 */
export function legacyWeeks(focus: Pillar, tier: 'plan_4w' | 'program_12w'): PlanWeek[] {
  const weeks: PlanWeek[] = [];
  for (let w = 1; w <= (tier === 'program_12w' ? 12 : 4); w++) weeks.push(rotatedWeek(w, focus));
  return JSON.parse(JSON.stringify(weeks));
}
