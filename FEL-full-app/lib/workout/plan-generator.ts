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
 * revision of the plans already bought (lib/workout/plan-revision.ts): weeks 1-4 carry no depth drop.
 */

import type { Pillar, ScreenResult } from './movement-screen';
import { PILLAR_LABELS } from './movement-screen';

export interface PlanExercise {
  name: string; sets: number; reps: string; cue: string; targets: Pillar;
  /** Only on a stored plan the revision changed (plan-revision.ts): the name of the exercise this one replaced. */
  replaced?: string;
  /**
   * Only on an adult's stored plan, on a depth drop after week 4 (plan-revision.ts holdLateDepthDrops): why it is held
   * back (HELD_FOR_PROTOCOL) — kept on the plan, not to be done until the depth-drop protocol opens.
   */
  held?: string;
}
export interface PlanDay { day: string; block: string; exercises: PlanExercise[] }
export interface PlanWeek {
  week: number; theme: string; days: PlanDay[];
  /** Only on a week of a stored plan the revision changed: which revision (PLAN_REVISION in plan-revision.ts). */
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

/** The weeks that may not carry a depth drop (owner decision #3, 2026-09-25): week 1 to this one, inclusive. */
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
 * What an early week gets instead of a depth drop: the lowest-landing exercise of the SAME pool that is not a depth
 * drop and is not already on that day (pool order breaks a tie). A copy, so a caller may mark it. Null only when the
 * pool has nothing else left.
 */
export function earlyWeekSwap(pool: Pillar, notOnDay: readonly string[] = []): PlanExercise | null {
  const options = (POOLS[pool] ?? []).filter((e) => !isDepthDrop(e) && !notOnDay.includes(e.name));
  if (!options.length) return null;
  const best = options.reduce((a, b) => (landingOf(b.name) < landingOf(a.name) ? b : a));
  return { ...best };
}

/** The pool an exercise came from: its own `targets` tag, or else the pool that lists it by name. */
export function poolOf(ex: { name?: unknown; targets?: unknown }): Pillar | null {
  if (typeof ex.targets === 'string' && Object.prototype.hasOwnProperty.call(POOLS, ex.targets)) return ex.targets as Pillar;
  return (Object.keys(POOLS) as Pillar[]).find((p) => POOLS[p].some((e) => e.name === ex.name)) ?? null;
}

const DAYS_4 = ['Mon', 'Wed', 'Fri'];
const THEMES = ['Foundation', 'Build', 'Intensify', 'Express'];

function weekFor(week: number, focus: Pillar): PlanWeek {
  const primary = POOLS[focus];
  // Rotate a secondary pool so the plan is balanced, not one-note.
  const secondaryKey = (Object.keys(POOLS) as Pillar[]).filter((p) => p !== focus)[(week - 1) % 5];
  const secondary = POOLS[secondaryKey];
  const days: PlanDay[] = DAYS_4.map((d, i) => {
    const picked = [primary[(week + i) % primary.length], secondary[(week + i) % secondary.length]];
    // MIRROR-COACH P1 (2026-09-25): no depth drop in weeks 1-4. It is the same swap the revision gives a plan bought
    // before today, so a plan made now and a stored plan once revised are the same plan (plan-revision.test.ts).
    const exercises = week > EARLY_WEEKS ? picked : picked.map((ex, j) => (
      isDepthDrop(ex) ? earlyWeekSwap(ex.targets, picked.filter((_, k) => k !== j).map((o) => o.name)) ?? ex : ex
    ));
    return { day: d, block: i === 1 ? 'Corrective + Skill' : 'Strength + Power', exercises };
  });
  return { week, theme: THEMES[(week - 1) % THEMES.length], days };
}

export function generatePlan(screen: ScreenResult, tier: 'plan_4w' | 'program_12w' = 'plan_4w'): WorkoutPlanStruct {
  const focus = screen.weakest;
  const weekCount = tier === 'program_12w' ? 12 : 4;
  const weeks: PlanWeek[] = [];
  for (let w = 1; w <= weekCount; w++) weeks.push(weekFor(w, focus));
  return { tier, focus, focusLabel: PILLAR_LABELS[focus], weeks };
}
