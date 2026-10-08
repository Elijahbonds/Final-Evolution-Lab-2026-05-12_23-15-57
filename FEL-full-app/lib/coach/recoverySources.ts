// lib/coach/recoverySources.ts — MIRROR-COACH P9 (2026-09-30): WHAT PRQ RECOVERY COUNTS, as database filters.
//
// Owner decision #12: PRQ recovery comes from completed cool-downs, off days and easy-cardio minutes, and it can fall.
// P6 wrote the first two filters for this phase (COMPLETED_OFF_DAY_WHERE, COOLDOWN_DONE_WHERE) in lib/coach/offDay.ts.
// They MOVED here, unchanged, and offDay.ts re-exports them, for one reason, measured on the import graph: offDay.ts
// imports lib/coach/cooldown.ts → lib/coach/warmup.ts → lib/health/painRule.ts. The PRQ recovery path
// (lib/prq-recovery.ts) reads these filters, and "no pain, readiness, intake or breath self-report ever reaches PRQ"
// (#12) is held by lib/prq-recovery-self-reports.test.ts on the WHOLE import graph of that path, not just its own
// imports — so the filters live in a leaf whose only imports are lib/coach/setLog.ts (→ structure → taxonomy, all
// pure) and Prisma types.
//
// The two filters P9 adds, each written the way P6's are (a Prisma filter the reader runs, so "what counts" is defined
// once, in the query):
//   · COACH_COOLDOWN_DONE_WHERE — a Cool-down section the COACH wrote, logged with work, on a completed training
//     session. P6's cooldownDoneAt only ever marks the cool-down Today ADDS when the coach wrote none
//     (lib/coach/cooldownServer.ts: "that one is logged like any exercise"), so without this a client whose coach writes
//     their own cool-downs could never earn cool-down recovery at all.
//   · EASY_CARDIO_SET_WHERE — a timed set (SetLog.workSeconds > 0) of a locomotion item prescribed at an easy band
//     (Idle or Cruise, lib/coach/taxonomy.ts EFFORT_BANDS: "you could talk through the set" / "smooth, easy") in a
//     completed coached session. The off day's Easy Walk is exactly this (lib/coach/offDay.ts: pattern 'locomotion',
//     band 'idle', its minutes logged by the set timer into SetLog.workSeconds — "which is what P9 reads as easy-cardio
//     minutes"). A sprint is locomotion too, but at Surge it is not easy, so it does not count; an item with no band set
//     does not count either (assumption: a coach who wants a walk counted as easy cardio says it is easy).
//
// What is NOT a source, on purpose: game minutes (Free Run, the Iron Paradise gym game, any controller mode — a thumb on
// a stick is not the player's cardio), and every self-report (readiness, pain, intake, breath logs). (P9 code review:
// this line was not true of the Iron Paradise game until lib/prq.ts MODE_ATTRS.training lost its 'recovery' token in the
// same fix — no game row names recovery now.) Nothing here reads
// an effort number the athlete typed either: the band is the coach's prescription, the minutes are the set timer's.
//
// Pure: Prisma types only, no client value, no DOM.
import type { Prisma } from '@/public/_prisma/client';
import { LOGGED_WORK_WHERE } from './setLog';

/** The session kind an off day is stored as (prisma/schema.prisma SessionKind). Moved from offDay.ts (re-exported there). */
export const OFF_DAY_KIND = 'recovery' as const;

/**
 * A completed off day: a coached session of kind recovery, marked Done WITH WORK LOGGED in it. P9's PRQ recovery counts
 * these (owner decision #12).
 *
 * MIRROR-COACH P6 FIX (2026-09-29, code review): it counted any off day marked Done. saveClientLog completes a session
 * even when every log is empty (lib/coach/todayServer.ts), and the off day sits in the running order, so a client who
 * simply rested has to press Done to reach their next training day — an empty tap that would have earned recovery
 * credit. The roster and attention readers already require LOGGED_WORK_WHERE for exactly this reason; so does this.
 */
export const COMPLETED_OFF_DAY_WHERE = {
  completedAt: { not: null }, session: { kind: OFF_DAY_KIND }, exerciseLogs: { some: LOGGED_WORK_WHERE },
} satisfies Prisma.ClientSessionWhereInput;
/**
 * A finished automatic cool-down (lib/coach/cooldown.ts; stamped by lib/coach/cooldownServer.ts) on a session that was
 * COMPLETED. MIRROR-COACH P6 FIX (2026-09-29, code review): the stamp alone counted, and a tap on the card of a session
 * nobody went on to train (it is on Today's screen from the start) opened a row that is never completed — P9 would
 * have counted a cool-down after no work. The stamp counts once Done lands on the same row.
 */
export const COOLDOWN_DONE_WHERE = { cooldownDoneAt: { not: null }, completedAt: { not: null } } satisfies Prisma.ClientSessionWhereInput;

/**
 * MIRROR-COACH P9 FIX (2026-09-30, code review): WHAT PRQ RECOVERY CREDITS for Today's automatic cool-down — P6's
 * COOLDOWN_DONE_WHERE (kept as it is, for anyone who reads "was it tapped and Done") AND work logged in that session.
 * The stamp plus Done was not enough: saveClientLog completes a session whose logs are all empty (Done with nothing
 * logged is the normal way past a day, lib/coach/todayServer.ts), and lib/coach/cooldown.ts cooldownTarget stamps the
 * newest unstamped row completed in the last two hours — so "tap the cool-down, press Done with nothing" was 0.6
 * recovery, four times a day to the cap, for no work. The off day and the coach's own cool-down already required
 * logged work (the same LOGGED_WORK_WHERE); now all three do.
 */
export const AUTO_COOLDOWN_CREDIT_WHERE = {
  AND: [COOLDOWN_DONE_WHERE, { exerciseLogs: { some: LOGGED_WORK_WHERE } }],
} satisfies Prisma.ClientSessionWhereInput;

/**
 * MIRROR-COACH P9: a coach-written Cool-down section with work logged in it, on a completed TRAINING session. (An off
 * day's own Cool-down section is part of the off day, which COMPLETED_OFF_DAY_WHERE already counts — so kind 'training'
 * here keeps one off day from counting twice.) The same "work logged" test as the off day's: an untouched cool-down
 * card sent along with Done is not a cool-down done.
 */
export const COACH_COOLDOWN_DONE_WHERE = {
  completedAt: { not: null },
  session: { kind: 'training' },
  exerciseLogs: { some: { AND: [LOGGED_WORK_WHERE, { sessionExercise: { section: 'cooldown' } }] } },
} satisfies Prisma.ClientSessionWhereInput;

/** The bands that make a locomotion item "easy cardio" (lib/coach/taxonomy.ts EFFORT_BANDS ids). */
export const EASY_CARDIO_BANDS = ['idle', 'cruise'] as const;
/** The catalogue pattern of a walk, a bike, an easy jog (prisma/schema.prisma MovementPattern). */
export const EASY_CARDIO_PATTERN = 'locomotion' as const;

/** MIRROR-COACH P9: one timed set of easy cardio, in a completed coached session. Its minutes are workSeconds / 60. */
export const EASY_CARDIO_SET_WHERE = {
  workSeconds: { gt: 0 },
  exerciseLog: {
    clientSession: { completedAt: { not: null } },
    sessionExercise: { effortBand: { in: [...EASY_CARDIO_BANDS] }, exercise: { pattern: EASY_CARDIO_PATTERN } },
  },
} satisfies Prisma.SetLogWhereInput;
