// lib/coach/offDay.ts — MIRROR-COACH P6 (2026-09-29): the off day, as a coached session and as a day in the week.
//
// WHAT WAS MISSING. The crossref (matrix row "Recovery sessions, cool-down, off days": "There is no recovery-day
// session type and no tracking of easy-cardio minutes"; audit item 8: "no cool-down, no off-day template") — and the
// weeks themselves: /workout's plan viewer (components/workout-view.tsx PlanViewer) listed Mon, Wed and Fri and nothing
// else, so four days of every week were blanks; a coach's week (a Block of N sessions, lib/coach/programs.ts
// programSchedule) had no way to write an easy day at all except as another training session.
//
// WHAT THIS IS.
//   1. THE TEMPLATE (OFF_DAY_ITEMS): FEL's own 18-minute off day in P2's session structure — an Easy Walk in the Key
//      section (12 timed minutes: the walk, bike or easy jog whose minutes the set timer logs into SetLog.workSeconds,
//      which is what P9 reads as easy-cardio minutes), then the Cool-down section: three rock-and-hold stretches
//      (FEL's step, lib/coach/warmupContent.ts — standing, then seated, then side-lying, so the floor work flows down to
//      the ground) and the owner's recovery breath (Neuro-Mechanic Playbook ch9) for 15 breaths, the Playbook's "15
//      rounds is better". Every item is band Idle ("you could talk through the set"), tempo 0-0-0-0, no rest timer, no
//      load, braced 'none'. offDay.test.ts runs each through P2's own validators (the catalogue's, the prescription's,
//      the session's warnings) and the claims screen.
//   2. THE KIND: a session made from it is Session.kind = 'recovery' (prisma/schema.prisma SessionKind), added to a
//      client's week by the builder (lib/coach/builderServer.ts action 'add_off_day'), done on Today like any session,
//      and completed as a ClientSession — "a coached session of kind recovery" — which P9's PRQ recovery counts by
//      COMPLETED_OFF_DAY_WHERE (now in ./recoverySources, re-exported here). No new model: one additive column.
//   3. THE WEEK: fullWeek() puts a plan week's named days into Mon→Sun with every unnamed day an OFF day that says
//      what an off day is (the /workout viewer), and weekView() is a coached client's current week on Today, the off
//      days in it named as off days.
//
// YOUTH (owner decision #6). Nothing here leaves the floor, loads, pins or asks for a max effort; the band is Idle,
// which youth rules allow (lib/coach/taxonomy.ts). The builder adds it to a youth client's week like any adult's.
//
// HONESTY. An off day builds capacity for the next session; nothing here says it lowers the chance of anything, names
// a condition, or scores anything. The copy doesn't say "not scored" either: P9 will count completed off days toward
// PRQ recovery (owner decision #12), and a line that turns false the day P9 lands is not one to ship.
//
// Pure: no Prisma client value (types only), no DOM.
import type { BraceMode, MovementPattern, SessionSection } from '@/public/_prisma/client';
import { HOLD_SEC, ROCK_HOLDS, ROCK_HOLD_ROUNDS, ROCK_SEC } from './warmupContent';
import { RECOVERY_BREATH, RECOVERY_BREATH_STEP, breathCycleSec } from './cooldown';
// MIRROR-COACH P9 (2026-09-30): the off-day kind and the two recovery filters moved to a leaf (./recoverySources) so the
// PRQ recovery path can read them without importing this file's warm-up/cool-down graph; re-exported here unchanged.
import { OFF_DAY_KIND } from './recoverySources';
export { COMPLETED_OFF_DAY_WHERE, COOLDOWN_DONE_WHERE, OFF_DAY_KIND } from './recoverySources';

// ── the template ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** An off-day session's label in the builder, on Today and in the coach's inbox. */
export const OFF_DAY_LABEL = 'Off day · recovery';
/** The walk's timed minutes. FEL's choice: long enough to count, short enough that an off day stays an easy one. */
export const OFF_DAY_WALK_MIN = 12;
/** The breath's rounds on an off day: the Playbook's "15 rounds is better" (ch9), where the cool-down uses its minimum. */
export const OFF_DAY_BREATH_ROUNDS = 15;
/** The three stretches (warmupContent ROCK_HOLDS ids), in the order they are done: standing, seated, side-lying. */
export const OFF_DAY_STRETCH_IDS = ['wall-calf-rock', 'ninety-ninety-rock', 'open-book-rock'] as const;
/** The whole day's length, as the template adds it up (offDay.test.ts holds it inside 15–20). */
export const OFF_DAY_RANGE_MIN = { min: 15, max: 20 } as const;

/** The catalogue row an off-day item prescribes (lib/coach/catalogue.ts CleanCatalogueItem's fields). */
export interface OffDayCatalogueRow {
  name: string; category: string; primaryCues: string[]; pattern: MovementPattern; braceMode: BraceMode; skillLayer: string;
  defaultTempo: string; equipment: string[];
}

/** An off-day item's prescription, as the builder's add takes it (lib/coach/loop.ts validateExerciseSpec's input). */
export interface OffDayPrescription {
  section: SessionSection; isKeySet: false; supersetGroup: null; sets: number; reps: string; load: string; tempo: string; restSeconds: number;
  workSeconds: number; holdSeconds: number | null; effortBand: 'idle'; setupCues: string[]; coachNote: string | null;
}

export interface OffDayItem {
  key: string;
  catalogue: OffDayCatalogueRow;
  prescription: OffDayPrescription;
  /** How long it takes, all sets (s). */
  seconds: number;
  youthSafe: true;
  impact: false;
}

const WALK: OffDayItem = {
  key: 'easy-walk',
  catalogue: {
    name: 'Easy Walk', category: 'recovery', pattern: 'locomotion', braceMode: 'none', skillLayer: 'reset', defaultTempo: '0-0-0-0', equipment: [],
    primaryCues: [
      'An easy pace you could hold a conversation at the whole way.',
      'A bike, a swim or an easy jog counts too.',
      "Breathe through your nose if you can. If you can't, slow down.",
    ],
  },
  prescription: {
    section: 'key', isKeySet: false, supersetGroup: null, sets: 1, reps: `${OFF_DAY_WALK_MIN * 60} s`, load: '', tempo: '0-0-0-0', restSeconds: 0,
    workSeconds: OFF_DAY_WALK_MIN * 60, holdSeconds: null, effortBand: 'idle', setupCues: [], coachNote: null,
  },
  seconds: OFF_DAY_WALK_MIN * 60, youthSafe: true, impact: false,
};

/**
 * A rock-and-hold's words as catalogue cues: the position, the rocks, the hold — three cues, each inside the catalogue's
 * 140-character cap (lib/coach/catalogue.ts CATALOGUE_LIMITS.cue). Found by offDay.test.ts: the Open Book's and the
 * Kneeling Reach's one-line cues are 141 characters each (measured), so the catalogue refused the Open Book and the
 * builder's off day would have failed to save.
 */
export function rockHoldCues(r: { setup: string; cue: string }): string[] {
  const at = r.cue.indexOf('Then hold');
  return at > 0 ? [r.setup, r.cue.slice(0, at).trim(), r.cue.slice(at).trim()] : [r.setup, r.cue];
}

function stretchItem(id: (typeof OFF_DAY_STRETCH_IDS)[number]): OffDayItem {
  const r = ROCK_HOLDS.find((x) => x.id === id)!;
  return {
    key: r.id,
    catalogue: {
      name: r.name, category: 'mobility', pattern: 'mobility', braceMode: 'none', skillLayer: 'joints', defaultTempo: '0-0-0-0', equipment: [],
      primaryCues: rockHoldCues(r),
    },
    prescription: {
      // one round a side for a one-sided position (left, then right), the two-sided ones twice: the warm-up's rounds
      section: 'cooldown', isKeySet: false, supersetGroup: null, sets: ROCK_HOLD_ROUNDS, reps: r.sides === 'each' ? `${ROCK_SEC} s left, then right` : `${ROCK_SEC} s`,
      load: '', tempo: '0-0-0-0', restSeconds: 0, workSeconds: ROCK_SEC, holdSeconds: HOLD_SEC, effortBand: 'idle', setupCues: [], coachNote: null,
    },
    seconds: ROCK_HOLD_ROUNDS * (ROCK_SEC + HOLD_SEC), youthSafe: true, impact: false,
  };
}

const BREATH_SEC = breathCycleSec(RECOVERY_BREATH) * OFF_DAY_BREATH_ROUNDS;
const BREATH: OffDayItem = {
  key: RECOVERY_BREATH_STEP.id,
  catalogue: {
    name: RECOVERY_BREATH_STEP.name, category: 'breath', pattern: 'breath', braceMode: 'none', skillLayer: 'reset', defaultTempo: '0-0-0-0', equipment: [],
    primaryCues: [
      'On your back, one hand on your belly, one on your lower ribs.',
      'In through the nose for 4, out slow through pursed lips for 6.',
      'A short pause, then the next breath. No forcing.',
    ],
  },
  prescription: {
    section: 'cooldown', isKeySet: false, supersetGroup: null, sets: 1, reps: `${BREATH_SEC} s`, load: '', tempo: '0-0-0-0', restSeconds: 0,
    workSeconds: BREATH_SEC, holdSeconds: null, effortBand: 'idle', setupCues: [], coachNote: null,
  },
  seconds: BREATH_SEC, youthSafe: true, impact: false,
};

/** The off day, in the order it is done. */
export const OFF_DAY_ITEMS: readonly OffDayItem[] = [WALK, ...OFF_DAY_STRETCH_IDS.map(stretchItem), BREATH];

/** The off day's length (s) and whole minutes. */
export const OFF_DAY_SEC = OFF_DAY_ITEMS.reduce((s, i) => s + i.seconds, 0);
export const OFF_DAY_MINUTES = Math.round(OFF_DAY_SEC / 60);

/** The line under an off-day session's title on Today and in the builder. */
export const OFF_DAY_LINE =
  `An easy day, about ${OFF_DAY_MINUTES} minutes: a walk you could talk through, three slow stretches and a long-exhale breath. It builds capacity for your next session.`;
/** What the builder's button says it adds. */
export const OFF_DAY_ADD_LINE = `Adds an off day after this session: ${OFF_DAY_MINUTES} easy minutes (walk, three stretches, the recovery breath).`;

// ── where an off day may go ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Would an off day put here come BEFORE a session the client already completed? MIRROR-COACH P6 FIX (2026-09-29, code
 * review): Today is "the first session not done" in program order (lib/coach/loop.ts nextSession — block order, then
 * session order). add_off_day inserts at `after.order + 1` (or the block's end) and moves every later session in the
 * block down one, completed ones too. So with Day 1 and Day 2 done, "Off day after this" under Day 1 made the new off day
 * the first not-done session: Today went BACK to it instead of Day 3, and the week read done → today(Off day) → done.
 * The same happens for any block ahead of the client (an off day at the end of Week 1 while they are in Week 2). True
 * when any completed session sits at or after the insertion point in the running order: the builder hides the button
 * (components/coach/program-builder.tsx) and the server refuses it (409 off_day_before_done).
 */
export function offDayWouldRewind(
  blocks: readonly { id: string; order: number; sessions: readonly { id: string; order: number }[] }[],
  blockId: string, afterSessionId: string | null, completedSessionIds: Iterable<string>,
): boolean {
  const done = new Set(completedSessionIds);
  const block = blocks.find((b) => b.id === blockId);
  if (!block || !done.size) return false;
  const after = afterSessionId ? block.sessions.find((x) => x.id === afterSessionId) : null;
  const at = after ? after.order + 1 : block.sessions.reduce((m, x) => Math.max(m, x.order), 0) + 1;
  const behind = [
    ...block.sessions.filter((x) => x.order >= at),
    ...blocks.filter((b) => b.order > block.order).flatMap((b) => b.sessions),
  ];
  return behind.some((x) => done.has(x.id));
}

// ── what P9 reads ────────────────────────────────────────────────────────────────────────────────────────────────────
//
// COMPLETED_OFF_DAY_WHERE and COOLDOWN_DONE_WHERE (P6, with their review fixes) now live in ./recoverySources and are
// re-exported above; P9's PRQ recovery (lib/prq-recovery.ts) reads them from there.

// ── the week ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type WeekDayName = (typeof WEEK_DAYS)[number];

/** A plan's day name ("Mon", "monday", "Wed ") as its place in the week, or -1 when it is not a day of the week. */
export function dayIndex(name: unknown): number {
  if (typeof name !== 'string') return -1;
  const s = name.trim().toLowerCase();
  const full = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return WEEK_DAYS.findIndex((d, i) => s === d.toLowerCase() || s === full[i]);
}

export type WeekSlot<T> = { day: WeekDayName; kind: 'training'; entries: T[] } | { day: WeekDayName; kind: 'off' };

/**
 * A plan week's days as the whole week, Mon → Sun: each named day with its entries (two on one day stay together, in
 * the plan's order), every day the plan does not name an OFF day. null when the plan has no days, or names a day that
 * is not a day of the week ("Day 1", "Session A") — then there is no honest way to say which days are off, and the
 * caller shows the plan as it is.
 */
export function fullWeek<T extends { day?: unknown }>(days: readonly T[]): WeekSlot<T>[] | null {
  if (!days.length) return null;
  // a stored plan is read defensively: a day that is not even an object (null, a string) cannot be placed either
  const at = days.map((d) => dayIndex((d as { day?: unknown } | null | undefined)?.day));
  if (at.some((i) => i < 0)) return null;
  return WEEK_DAYS.map((day, i) => {
    const entries = days.filter((_, k) => at[k] === i);
    return entries.length ? { day, kind: 'training' as const, entries } : { day, kind: 'off' as const };
  });
}

/** An off day in a plan's week (the /workout viewer), under "<day> — Off day": what it is, in one line. Optional, and
 *  says so. */
export const OFF_DAY_WEEK_LINE =
  `Rest, or if you want to move: about ${OFF_DAY_MINUTES} easy minutes, a walk you could talk through, three slow stretches and a long-exhale breath. It builds capacity for the next session.`;

export interface WeekEntry { id: string; label: string; kind: 'training' | 'recovery'; state: 'done' | 'today' | 'upcoming' }

/**
 * A coached client's current week (the Block Today's session is in) as Today shows it: every session in order, done /
 * today / coming up, and an off-day session named as an off day rather than one more "Session N".
 */
export function weekView(
  sessions: readonly { id: string; order: number; label: string; kind?: string | null }[], done: Iterable<string>, todayId: string,
): WeekEntry[] {
  const doneSet = new Set(done);
  return [...sessions].sort((a, b) => a.order - b.order).map((s) => ({
    id: s.id,
    label: s.kind === OFF_DAY_KIND ? 'Off day' : s.label,
    kind: s.kind === OFF_DAY_KIND ? 'recovery' : 'training',
    state: s.id === todayId ? 'today' : doneSet.has(s.id) ? 'done' : 'upcoming',
  }));
}
