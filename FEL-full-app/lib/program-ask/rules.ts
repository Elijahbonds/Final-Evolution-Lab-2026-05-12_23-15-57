// lib/program-ask/rules.ts — PROGRAM-ASK (2026-11-02): the programming rules, as data. Every number a program is built
// from is here, named, with where it comes from. docs/PROGRAM-ASK.md prints them with the sources.
//
// WHAT THE OLD GENERATOR GOT WRONG, AND WHERE EACH IS FIXED (lib/workout/plan-generator.ts header; owner decision #3):
//   1. "every plan was the same flat plan"        → the split, the slots, the dose and the time all come from the request
//      (SPLITS, GOAL_DOSE, VOLUME_RANGES); program-ask.test.ts builds a matrix of asks and proves they differ.
//   2. "sets and reps never changed across weeks" → BLOCK_WEEKS: every week of a block changes reps, sets, effort or the
//      variation, and every block ends with a lighter week and a checkpoint (./checkpoint.ts).
//   3. "a depth drop in week 1 past the gate"     → jump work is only ever picked when the protocol gate is open
//      (lib/coach/protocolGate.ts), never in a block's first week, never for youth; a depth drop never (./slots.ts).
//
// Pure. Client-safe.
import type { WaveBand } from '@/lib/coach/templates/waves';
import type { WeekDayName } from '@/lib/coach/offDay';
import type { LevelId } from '@/lib/library/vocab';
import type { AgeBand, DayFocus, ProgramGoal, SlotId, VolumeGroup } from './types';

// ── the request's limits and defaults ───────────────────────────────────────────────────────────────────────────────

export const DAYS = { min: 2, max: 6, fallback: 3 } as const;
export const MINUTES = { min: 20, max: 90, fallback: 40, step: 5 } as const;
export const WEEKS = { min: 4, max: 12, fallback: 4 } as const;

/** The time window a session must land in: the stated minutes ± 10% (owner brief). */
export const TIME_TOLERANCE = 0.1;

// ── the block: a lighter week by level ──────────────────────────────────────────────────────────────────────────────

/**
 * Weeks per block, the last one lighter. A beginner builds for four weeks and eases in the fifth; an intermediate or
 * advanced lifter eases every fourth (the coach templates' wave, owner decision #10). FEL's choice, the common practice
 * (newer lifters recover from a session faster relative to what they can do, so they can build a week longer).
 * A plan shorter than a block ends with its lighter week anyway: no plan ends on a hard week.
 */
export const BLOCK_WEEKS: Record<LevelId, number> = { beginner: 5, intermediate: 4, advanced: 4 };

/** FEL's measure of "lighter" (lib/coach/templates/waves.ts WEEK4_MAX_SHARE): the lighter week's working sets are at most this share of the week before. */
export { WEEK4_MAX_SHARE as LIGHTER_MAX_SHARE } from '@/lib/coach/templates/waves';

/** What changes, week by week inside a block. `reps`: which of the dose's three steps (0 low, 1 mid, 2 top). */
export interface WeekStep {
  label: string;
  reps: 0 | 1 | 2;
  /** Extra sets on the day's key item (+1) or every item (−1, the lighter week). */
  keySets: number;
  allSets: number;
  /** Play the tempo version of the base this week (a real library variant, or the base with the tempo written). */
  tempo: boolean;
  /** The effort band for the key item, the other strength items, and the trunk / accessory items. */
  bands: { key: WaveBand; main: WaveBand; rest: WaveBand };
  /** Under 18: lib/coach/templates/waves.ts YOUTH_WAVE's bands for the same step (capped at Drive). */
  youthBands: { key: WaveBand; main: WaveBand; rest: WaveBand };
  lighter: boolean;
}

const LEARN: WeekStep = { label: 'Learn the moves', reps: 0, keySets: 0, allSets: 0, tempo: false, bands: { key: 'drive', main: 'cruise', rest: 'cruise' }, youthBands: { key: 'cruise', main: 'cruise', rest: 'cruise' }, lighter: false };
const BUILD: WeekStep = { label: 'Build', reps: 1, keySets: 1, allSets: 0, tempo: false, bands: { key: 'drive', main: 'drive', rest: 'drive' }, youthBands: { key: 'drive', main: 'cruise', rest: 'cruise' }, lighter: false };
const MORE: WeekStep = { label: 'Build more', reps: 2, keySets: 1, allSets: 0, tempo: false, bands: { key: 'surge', main: 'drive', rest: 'drive' }, youthBands: { key: 'drive', main: 'drive', rest: 'drive' }, lighter: false };
const TEMPO: WeekStep = { label: 'Slow it down', reps: 1, keySets: 1, allSets: 0, tempo: true, bands: { key: 'surge', main: 'drive', rest: 'drive' }, youthBands: { key: 'drive', main: 'drive', rest: 'drive' }, lighter: false };
const LIGHTER: WeekStep = { label: 'Lighter week', reps: 0, keySets: 0, allSets: -1, tempo: false, bands: { key: 'cruise', main: 'cruise', rest: 'cruise' }, youthBands: { key: 'cruise', main: 'cruise', rest: 'cruise' }, lighter: true };

/** The block's weeks, by block length. Intermediate and advanced reach the tempo version in week 3. */
export function blockSteps(len: number): WeekStep[] {
  if (len >= 5) return [LEARN, BUILD, MORE, TEMPO, LIGHTER];
  if (len === 4) return [LEARN, BUILD, TEMPO, LIGHTER];
  if (len === 3) return [LEARN, BUILD, LIGHTER];
  if (len === 2) return [LEARN, LIGHTER];
  return [LEARN];
}

/** Youth (owner decision #6, lib/coach/templates/waves.ts YOUTH_WAVE): the same rhythm one band lower, capped at Drive. */
export function bandFor(b: WaveBand, age: AgeBand): WaveBand {
  if (age === 'child') return b === 'idle' ? 'idle' : 'cruise';
  if (age === 'teen' && b === 'surge') return 'drive';
  return b;
}

// ── weekly volume: hard sets per group per week ─────────────────────────────────────────────────────────────────────

/**
 * Weekly working sets per volume group (knee-dominant legs, hips, pushing, pulling), by goal and level, counted the
 * fractional way (a split squat or lunge is half a set for the legs and half for the hips). Sources, printed in
 * docs/PROGRAM-ASK.md: Schoenfeld, Ogborn & Krieger 2017 (J Sports Sci 35:1073) sort weekly sets per muscle into low
 * (under 5), moderate (5–9) and high (10 or more), with more growth from more; trained lifters are usually given 10–20;
 * strength comes from fewer — about 5–9 a week already works, a little more helps (Ralston et al. 2017, Sports Med
 * 47:2585). So a beginner's range starts at moderate and an advanced lifter's reaches high; a beginner starts at 1–3 sets per exercise, 2–3 days a week (ACSM 2009
 * position stand, Med Sci Sports Exerc 41:687; ACSM 2011, MSSE 43:1334). Light loads taken close to the end of the set
 * build muscle about as well as heavy ones (Lopez et al. 2021, MSSE 53:1206), which is why a band works. The trunk
 * range is FEL's own (two trunk patterns most days).
 */
export const VOLUME_RANGES: Record<ProgramGoal, Record<LevelId, [number, number]>> = {
  'full-body': { beginner: [5, 12], intermediate: [8, 16], advanced: [10, 20] },
  strength: { beginner: [5, 12], intermediate: [6, 14], advanced: [8, 16] },
  muscle: { beginner: [8, 14], intermediate: [10, 20], advanced: [12, 22] },
  conditioning: { beginner: [4, 12], intermediate: [5, 14], advanced: [6, 16] },
  athletic: { beginner: [5, 12], intermediate: [6, 14], advanced: [8, 16] },
  sport: { beginner: [5, 12], intermediate: [6, 14], advanced: [8, 16] },
  mobility: { beginner: [2, 8], intermediate: [3, 8], advanced: [3, 10] },
};
export const TRUNK_RANGE: [number, number] = [4, 14];

/**
 * Youth: 1–3 sets per exercise, 6–15 reps, 2–3 non-consecutive days are the youth position stand's starting point
 * (Faigenbaum et al. 2009, J Strength Cond Res 23:S60). FEL caps the weekly range for under-18s at 12 and for under-13s
 * at 8, and never asks a teen for more than 3 sets of one exercise or a child for more than 2.
 */
export const YOUTH_RANGE_CAP: Record<Exclude<AgeBand, 'adult'>, number> = { teen: 12, child: 8 };
export const MAX_SETS: Record<AgeBand, number> = { adult: 5, teen: 3, child: 2 };

export function volumeRange(goal: ProgramGoal, level: LevelId, age: AgeBand, group: VolumeGroup): [number, number] {
  if (group === 'trunk') return age === 'child' ? [2, 8] : TRUNK_RANGE;
  const [lo, hi] = VOLUME_RANGES[goal][level];
  if (age === 'adult') return [lo, hi];
  const cap = YOUTH_RANGE_CAP[age];
  return [Math.min(lo, cap - 2), Math.min(hi, cap)];
}

/** What one set of a slot counts to, by group (fractional: a single-leg squat or lunge works the legs and the hips). */
export const SLOT_WEIGHT: Record<SlotId, Partial<Record<VolumeGroup, number>>> = {
  knee: { knee: 1 }, single: { knee: 0.5, hip: 0.5 }, hinge: { hip: 1 }, calf: {},
  hpush: { push: 1 }, vpush: { push: 1 }, triceps: { push: 0.5 },
  hpull: { pull: 1 }, vpull: { pull: 1 }, rear: { pull: 1 }, biceps: { pull: 0.5 },
  antiExt: { trunk: 1 }, antiRot: { trunk: 1 },
  power: {}, speed: {}, cond: {}, mobility: {},
};
export const slotWeight = (slot: SlotId, g: VolumeGroup): number => SLOT_WEIGHT[slot][g] ?? 0;

// ── the dose by goal ────────────────────────────────────────────────────────────────────────────────────────────────

export interface Dose {
  /** Target reps for weeks at step 0, 1 and 2 (a counted item). */
  reps: [number, number, number];
  /** Seconds of work for a timed item, same three steps. */
  secs: [number, number, number];
  /** Rest after a round of a pair (seconds): the least and the most the time-fit may use. */
  rest: [number, number];
  /** Working sets per main item before the volume and time fit. */
  sets: number;
  /** Tempo written on the "slow it down" week when the library has no tempo variant (down-pause-up-pause). */
  tempo: string;
}

/**
 * The dose for the MAIN strength items. Sources: ACSM 2009 (novices 8–12 reps; strength 1–6 reps for the trained, rest
 * 2–3 min for the big lifts, 1–2 min otherwise; muscle 6–12, rest 1–2 min). A band or bodyweight cannot be loaded to a
 * 3-rep max, so the strength dose stays at 5–8 and gets harder through the variation (tempo, pauses, single leg, the
 * library's harder links) rather than the load. Muscle work with light loads goes higher (Lopez et al. 2021).
 */
export const GOAL_DOSE: Record<ProgramGoal, Record<LevelId, Dose>> = {
  'full-body': {
    beginner: { reps: [8, 10, 12], secs: [20, 25, 30], rest: [45, 90], sets: 2, tempo: '3-1-1-0' },
    intermediate: { reps: [8, 10, 12], secs: [25, 30, 40], rest: [45, 90], sets: 3, tempo: '3-1-1-0' },
    advanced: { reps: [6, 8, 10], secs: [30, 40, 45], rest: [60, 120], sets: 3, tempo: '3-1-1-1' },
  },
  strength: {
    beginner: { reps: [6, 8, 10], secs: [20, 25, 30], rest: [75, 120], sets: 3, tempo: '3-1-1-0' },
    intermediate: { reps: [5, 6, 8], secs: [25, 30, 40], rest: [90, 150], sets: 3, tempo: '4-1-1-0' },
    advanced: { reps: [4, 5, 6], secs: [30, 40, 45], rest: [90, 180], sets: 4, tempo: '4-2-1-0' },
  },
  muscle: {
    beginner: { reps: [10, 12, 15], secs: [25, 30, 40], rest: [45, 90], sets: 3, tempo: '3-0-1-1' },
    intermediate: { reps: [12, 15, 20], secs: [30, 40, 45], rest: [45, 120], sets: 3, tempo: '3-0-1-1' },
    advanced: { reps: [10, 15, 20], secs: [30, 40, 50], rest: [60, 150], sets: 4, tempo: '3-1-1-1' },
  },
  conditioning: {
    beginner: { reps: [10, 12, 15], secs: [25, 30, 35], rest: [30, 60], sets: 2, tempo: '2-0-1-0' },
    intermediate: { reps: [12, 15, 15], secs: [30, 35, 40], rest: [30, 60], sets: 3, tempo: '2-0-1-0' },
    advanced: { reps: [12, 15, 20], secs: [35, 40, 45], rest: [30, 60], sets: 3, tempo: '2-0-1-0' },
  },
  athletic: {
    beginner: { reps: [6, 8, 10], secs: [20, 25, 30], rest: [60, 120], sets: 2, tempo: '3-1-1-0' },
    intermediate: { reps: [5, 6, 8], secs: [25, 30, 40], rest: [75, 150], sets: 3, tempo: '3-1-1-0' },
    advanced: { reps: [4, 5, 6], secs: [30, 40, 45], rest: [90, 150], sets: 3, tempo: '3-2-1-0' },
  },
  sport: {
    beginner: { reps: [6, 8, 10], secs: [20, 25, 30], rest: [60, 120], sets: 2, tempo: '3-1-1-0' },
    intermediate: { reps: [5, 6, 8], secs: [25, 30, 40], rest: [75, 150], sets: 3, tempo: '3-1-1-0' },
    advanced: { reps: [4, 5, 6], secs: [30, 40, 45], rest: [90, 150], sets: 3, tempo: '3-2-1-0' },
  },
  mobility: {
    beginner: { reps: [8, 10, 12], secs: [20, 25, 30], rest: [30, 60], sets: 2, tempo: '3-1-1-0' },
    intermediate: { reps: [8, 10, 12], secs: [25, 30, 40], rest: [30, 60], sets: 2, tempo: '3-1-1-0' },
    advanced: { reps: [8, 10, 12], secs: [30, 40, 45], rest: [30, 60], sets: 2, tempo: '3-1-1-0' },
  },
};

/** Trunk, calves and arm work: smaller muscles, shorter rest, a little higher. */
export const ACCESSORY_DOSE: Dose = { reps: [10, 12, 15], secs: [20, 30, 40], rest: [30, 60], sets: 2, tempo: '2-1-1-1' };
/** A youth dose never goes under 6 reps (Faigenbaum 2009: 6–15); a child's never under 10. */
export const YOUTH_MIN_REPS: Record<AgeBand, number> = { adult: 1, teen: 6, child: 10 };

/** Jump work (gate open only): low contacts, full rest. FEL's choice, well under the dunk program's weekly ladder. */
export const POWER_DOSE = { sets: 3, reps: [3, 4, 5] as const, rest: 90, contactsPerRep: 1 } as const;

/** Speed drills (no jumps): short, crisp, full recovery. */
export const SPEED_DOSE = { sets: 3, secs: [10, 12, 15] as const, rest: 60 } as const;

/** Conditioning finisher rounds: work then rest, in seconds. */
export const FINISHER = { work: [20, 30, 40] as const, rest: 20 } as const;
/** A mobility round in the lighter week or a mobility day: one hold or flow, then a breath. */
export const MOBILITY_ROUND = { work: 40, rest: 10 } as const;

// ── splits ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DayPlan { key: string; focus: DayFocus; day: WeekDayName }

const WEEKDAYS: Record<number, WeekDayName[]> = {
  2: ['Mon', 'Thu'],
  3: ['Mon', 'Wed', 'Fri'],
  4: ['Mon', 'Tue', 'Thu', 'Fri'],
  5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
  6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const extraDay = (goal: ProgramGoal): DayFocus =>
  goal === 'mobility' ? 'mobility' : goal === 'athletic' || goal === 'sport' ? 'athletic' : goal === 'strength' || goal === 'muscle' ? 'full' : 'conditioning';

/**
 * The split by days (owner brief): 2–3 days full body each day (A/B alternating, so the main lifts repeat enough to
 * learn them); 4 days upper/lower for strength or muscle, full body A/B for the rest; 5 days upper/lower around one goal
 * day; 6 days push/pull/legs twice for strength or muscle, otherwise upper/lower with two goal days. Training days are
 * spread so no muscle group is trained hard two days running where the days allow it.
 */
export function splitFor(days: number, goal: ProgramGoal): DayPlan[] {
  const d = Math.min(DAYS.max, Math.max(DAYS.min, Math.round(days)));
  const wd = WEEKDAYS[d];
  const lifting = goal === 'strength' || goal === 'muscle';
  let focus: { key: string; focus: DayFocus }[];
  if (d <= 3) focus = ([{ key: 'A', focus: 'full' }, { key: 'B', focus: 'full' }, { key: 'A', focus: 'full' }] as { key: string; focus: DayFocus }[]).slice(0, d);
  else if (d === 4) focus = lifting
    ? [{ key: 'U1', focus: 'upper' }, { key: 'L1', focus: 'lower' }, { key: 'U2', focus: 'upper' }, { key: 'L2', focus: 'lower' }]
    : [{ key: 'A', focus: 'full' }, { key: 'B', focus: 'full' }, { key: 'A', focus: 'full' }, { key: 'B', focus: 'full' }];
  else if (d === 5) focus = [{ key: 'U1', focus: 'upper' }, { key: 'L1', focus: 'lower' }, { key: 'X', focus: extraDay(goal) }, { key: 'U2', focus: 'upper' }, { key: 'L2', focus: 'lower' }];
  else focus = lifting
    ? [{ key: 'P1', focus: 'push' }, { key: 'Q1', focus: 'pull' }, { key: 'G1', focus: 'legs' }, { key: 'P2', focus: 'push' }, { key: 'Q2', focus: 'pull' }, { key: 'G2', focus: 'legs' }]
    : [{ key: 'U1', focus: 'upper' }, { key: 'L1', focus: 'lower' }, { key: 'X1', focus: extraDay(goal) }, { key: 'U2', focus: 'upper' }, { key: 'L2', focus: 'lower' }, { key: 'X2', focus: extraDay(goal) }];
  return focus.map((f, i) => ({ ...f, day: wd[i] }));
}

/** A day's blocks as slots, in order. A pair alternates its two items set for set (A1, A2). 'B' variants differ in order and choice. */
export function dayTemplate(focus: DayFocus, key: string, goal: ProgramGoal, minutes: number): SlotId[][] {
  const second = /2$|^B$/.test(key);
  const core: SlotId[] = ['antiExt', 'antiRot'];
  switch (focus) {
    case 'full': {
      // EVERY-SCREEN P3: a session of 25 minutes or less runs its six jobs as one circuit (one rest a round, the
      // conditioning day's shape): as pairs, with the 6-minute warm-up, every 20-minute full-body plan above beginner ran
      // 22–24 minutes and the server refused it (the grid: 436 of 1,680 twenty-minute requests)
      if (minutes <= SHORT_SESSION && goal !== 'mobility') {
        const circuit: SlotId[][] = [second ? ['hinge', 'hpush', 'knee', 'hpull', 'single', 'vpush'] : ['knee', 'hpull', 'hinge', 'hpush', 'single', 'vpull'], core];
        if (goal === 'athletic' || goal === 'sport') circuit.unshift(['speed']);
        return circuit;
      }
      const blocks: SlotId[][] = second
        ? [['hinge', 'hpush'], ['knee', 'hpull'], ['single', 'vpush'], core]
        : [['knee', 'hpull'], ['hinge', 'hpush'], ['single', 'vpull'], core];
      if (goal === 'athletic' || goal === 'sport') blocks.unshift(['speed']);
      if (goal === 'mobility') blocks.unshift(['mobility', 'mobility']);
      if (goal === 'conditioning') return [['knee', 'hpush', 'hinge', 'hpull', 'single', second ? 'vpush' : 'vpull'], core];
      return blocks;
    }
    case 'upper': return second
      ? [['vpush', 'vpull'], ['hpush', 'hpull'], ['triceps', 'biceps'], ['rear', 'antiRot']]
      : [['hpush', 'hpull'], ['vpush', 'vpull'], ['rear', 'triceps'], ['biceps', 'antiRot']];
    case 'lower': return second
      ? [['hinge', 'antiExt'], ['knee', 'antiRot'], ['single', 'calf']]
      : [['knee', 'antiExt'], ['hinge', 'antiRot'], ['single', 'calf']];
    case 'push': return [['hpush', 'antiExt'], ['vpush', 'antiRot'], ['triceps', 'calf']];
    case 'pull': return [['hpull', 'antiExt'], ['vpull', 'antiRot'], ['rear', 'biceps']];
    case 'legs': return [['knee', 'antiExt'], ['hinge', 'antiRot'], ['single', 'calf']];
    case 'conditioning': return [['knee', 'hpush', 'hinge', 'hpull', 'cond', 'antiExt']];
    case 'athletic': return [['speed'], ['single', 'antiRot'], ['hinge', 'hpull']];
    case 'mobility': return [['mobility', 'mobility'], ['mobility', 'mobility'], core];
  }
  return [];
}

/** EVERY-SCREEN P3: at or under this many minutes a full-body day is one circuit (see dayTemplate). */
export const SHORT_SESSION = 25;

/** The slots a full-body day must cover (owner brief): knee, hinge, both pushes or pulls once, single leg, two trunk patterns. */
export const FULL_DAY_REQUIRED: readonly (SlotId | readonly SlotId[])[] = [
  'knee', 'hinge', 'hpush', 'hpull', ['vpush', 'vpull'], 'single', 'antiExt', 'antiRot',
];

/** The slots every WEEK must cover, whatever the split. */
export const WEEK_REQUIRED: readonly SlotId[] = ['knee', 'hinge', 'hpush', 'hpull', 'single', 'antiExt', 'antiRot'];

/** Pull sets are kept at or above push sets, and at most this much above (FEL's balance rule). */
export const PULL_PUSH_RATIO: [number, number] = [1, 1.5];
