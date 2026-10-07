// The client's Today — read and save (MIRROR-COACH P2, 2026-09-25).
//
// GET /api/coach/me/today and POST /api/coach/me/log are this module plus the session check. Like the builder's
// server half (lib/coach/builderServer.ts) it takes the database as an argument, so the dev harness
// (app/dev/coach-today) runs the SAME code over an in-memory store on a lane whose database is offline on purpose,
// and lib/coach/today-route.test.ts runs the real routes over it.
//
// What changed, and why:
//   · READ. The tree's query now selects the catalogue's coaching (lib/coach/server.ts TREE_INCLUDE), and each of
//     today's exercises goes out as a TodayExercise (lib/coach/today.ts): cues, faults, the demo, the easier version
//     by NAME (a second read: the link is a bare id, and only the program coach's own rows are resolved), the set-up
//     picks and the band in words, and the timers. The open log comes with its SetLogs. The payload's `block` is the
//     block's own fields — it used to be the whole block, every session and exercise in it, for one label.
//   · SAVE. A log may carry `sets` (lib/coach/setLog.ts). Its sets replace what was saved for that exercise in one
//     transaction, and the per-exercise columns are derived from them, so the inbox and every older reader see a
//     weight, never the "RPE7" the old card pre-filled into the load box. A log without `sets` (the /training
//     step-through, the smoke probe, an old tab) saves exactly as before.
//   · MIRROR-COACH P8 (2026-09-29): THE PROTOCOL GATE RUNS HERE, server-side, before the session leaves. A plyometric or
//     a depth drop (lib/coach/protocolGate.ts gatedKind) reaches the athlete as written only when their gate is open —
//     an adult (or a coach's own assignment for an under-18), a complete intake with no red flag, today's pain decision
//     'continue', and a landing check from the last 4 weeks. Otherwise the item goes out as its ladder's easier step
//     (regressionOfId, walked down past gated rungs, from the coach's own catalogue) carrying `protocolGate` — the one
//     line saying why — or, with no ungated rung, in `session.held` instead of `session.exercises`. It keeps its
//     SessionExercise id, so a log of the easier step saves against the slot the coach prescribed. The gate's reads
//     (lib/coach/protocolGateServer.ts) are made only when today's session HAS a gated item: every other Today costs
//     exactly what it did.
import type { PrismaClient } from '@/public/_prisma/client';
import { nextSession, orderedSessions, progressSeries, validateLog, type CleanLog, type LogRow, type ProgressPoint } from './loop';
import { TREE_INCLUDE, toTree } from './server';
import { logEntryIsEmpty, logHasWork, summaryToWrite, type CleanSet } from './setLog';
import { CATALOGUE_COACHING_SELECT, todayExercise, variationIds, type CatalogueCoachingRow, type TodayExercise, type TodayHeldItem } from './today';
import { youthRules } from './taxonomy';
import { isHardStopped, latestIntake, RED_FLAG_COPY } from '../health/intake';
import { weekView, type WeekEntry } from './offDay';
import {
  GATE_UNREAD_LINE, GATE_UNREAD_REASON, athleteWhy, easierUngatedStep, gateAction, heldLine, isProtocolGated, leadReason, protocolReasons,
  swapPrescription, swappedLine, unreadGateAction, type GateAction, type GateRow,
} from './protocolGate';
import { coachAssignedProgram, loadLadder, loadProtocolFacts } from './protocolGateServer';

// MIRROR-COACH P8 (2026-09-29): + the four tables the protocol gate reads (protocolGateServer.ts) — only touched when
// today's session holds a gated item.
export type TodayDb = Pick<PrismaClient, 'coachingProgram' | 'user' | 'exerciseLog' | 'programExercise' | 'session' | 'clientSession' | 'setLog' | 'healthIntake' | 'healthConsent' | 'painCheckIn' | 'workoutScan' | 'facilitatorProfile' | '$transaction'>;

export interface OpenSetLog { id: string; setIndex: number; reps: number | null; weightKg: number | null; rir: number | null; effort: number | null; workSeconds: number | null; note: string | null }
export interface OpenLog {
  id: string; sessionExerciseId: string; actualSets: number | null; actualReps: string | null; actualLoad: string | null; rpe: number | null;
  clientNote: string | null; videoUrl: string | null; coachComment: string | null; completedAt: Date | string | null; setLogs: OpenSetLog[];
}

export interface TodayPayload {
  program: { id: string; name: string; coachName: string } | null;
  today: {
    block: { id: string; order: number; label: string; targetDate: string | null };
    /**
     * MIRROR-COACH P6 (2026-09-29): `kind` — 'recovery' for an off day (lib/coach/offDay.ts): Today shows it as an off
     * day, with no generated warm-up and no automatic cool-down (its own Cool-down section is both).
     */
    session: {
      id: string; order: number; label: string; kind: 'training' | 'recovery'; exercises: TodayExercise[];
      /** MIRROR-COACH P8: gated items with no ungated easier step, held back today with the one line why. Present only
       *  when there is one — a session with none is exactly the shape it always was. */
      held?: TodayHeldItem[];
    };
    index: number; total: number;
    /** MIRROR-COACH P6: this week (today's block), every session in order with its state, off days named. */
    week: { label: string; entries: WeekEntry[] };
    /**
     * MIRROR-PROGRESS (2026-10-07; plan Phase 4): per today's SessionExercise id, the newest completed log of the same
     * exercise in this program (lib/coach/loop.ts progressSeries) — Today's "Last time: 3×8 @ 60 kg" line (loop.ts
     * lastTimeLine). Optional: an exercise never done before has no entry, and a payload without it reads as before.
     */
    lastTime?: Record<string, ProgressPoint>;
  } | null;
  /** `cooldownDone` (MIRROR-COACH P6): the open session's automatic cool-down was already tapped done. */
  open: { id: string; logs: OpenLog[]; cooldownDone: boolean } | null;
  recentComments: { exercise: string; comment: string | null; at: Date | string | null }[];
  /**
   * MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "General training … is not gated by the intake's
   * red-flag hard stop": lib/health/intake.ts's own doc comment on RED_FLAG_COPY claims it is "shown whenever a
   * red-flag answer hard-stops the Mirror, pain check-ins and training features" — Today (this payload) is that
   * third surface, and until this fix nothing here ever read it. True only while a standing HealthIntake red flag
   * has not been self-attested cleared (lib/health/intake.ts isHardStopped). today-view.tsx blocks logging on this,
   * and saveClientLog below refuses a save server-side too — a client is never trusted to enforce this alone.
   */
  hardStopped: boolean;
  redFlagCopy: string | null;
}

const SET_ORDER = { setLogs: { orderBy: { setIndex: 'asc' as const } } };

/** The ladder rows a swap serves: the catalogue's coaching, plus the row's own tempo (a jump's is not the step's). */
const GATE_LADDER_SELECT = { ...CATALOGUE_COACHING_SELECT, defaultTempo: true } as const;

/**
 * Today's session through the protocol gate (MIRROR-COACH P8, 2026-09-29): what to serve for each prescribed item, and
 * the ladder rows a swap serves. Empty when the session has no gated item — and then nothing is read.
 */
async function gateToday(
  db: TodayDb, userId: string, program: { coachId: string; clientId: string },
  exercises: readonly { id: string; exerciseId: string }[], rows: ReadonlyMap<string, CatalogueCoachingRow>,
  pre: { dobYear: number | null; latestIntake: Awaited<ReturnType<typeof latestIntake>> }, now: Date,
): Promise<Map<string, GateAction>> {
  const actions = new Map<string, GateAction>();
  const rowOf = (e: { id: string; exerciseId: string }): GateRow => ({ ...(rows.get(e.id) ?? {}), id: e.exerciseId });
  const gated = exercises.filter((e) => isProtocolGated(rowOf(e)));
  if (!gated.length) return actions;
  // MIRROR-COACH P8 FIX (2026-09-30, code review): a failed read CLOSES the gate for this read (protocolGate.ts
  // unreadGateAction, the one line GATE_UNREAD_LINE) — it used to throw, and Today answered 500 for any session with a
  // gated item. The ladder failing leaves only the prescribed rows to walk (so the item is held); the assignment failing
  // reads as "not the coach's" (the youth rule stays). None of the three can open anything.
  const unread = (what: string) => (e: unknown) => { console.error(`[coach/today] the protocol gate's ${what} could not be read; gated items stay closed on this read`, e); return null; };
  const [facts, coachAssigned, ladder] = await Promise.all([
    loadProtocolFacts(db, userId, now, pre).catch(unread('facts')),
    coachAssignedProgram(db, program).catch(() => false),
    loadLadder(db, program.coachId, gated.map(rowOf), GATE_LADDER_SELECT).catch(unread('ladder')),
  ]);
  const byId: ReadonlyMap<string, GateRow> = ladder ?? new Map(gated.map((e) => [rowOf(e).id, rowOf(e)]));
  const athlete = facts ? protocolReasons(facts, now) : null;
  for (const e of gated) actions.set(e.id, athlete ? gateAction(rowOf(e), athlete, byId, { coachAssigned }) : unreadGateAction(rowOf(e), byId));
  return actions;
}

/**
 * "Last time" for today's exercises (MIRROR-PROGRESS, 2026-10-07): the newest completed log, with work in it, of what the
 * athlete actually did — the gate's easier step when that is what was logged (servedExerciseId), else the prescribed
 * row — matched by catalogue id, so the same exercise on another day of the program counts and two rows sharing a name
 * never merge. Read from the program rows loadToday already holds: no extra query. assumption: this program only — a
 * log from an earlier program is not read.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastTimeFor(p: any, exercises: readonly TodayExercise[]): Record<string, ProgressPoint> {
  const catalogueOf = new Map<string, string>();
  for (const b of p.blocks ?? []) for (const s of b.sessions ?? []) for (const e of s.exercises ?? []) catalogueOf.set(e.id, e.exerciseId);
  const rows: LogRow[] = [];
  for (const cs of p.clientSessions ?? []) {
    for (const l of cs.exerciseLogs ?? []) {
      if (!l.completedAt || !logHasWork(l)) continue;
      const did = l.servedExerciseId ?? catalogueOf.get(l.sessionExerciseId);
      if (!did) continue;
      // progressSeries groups by `exerciseName`; the catalogue id is the key here (see above)
      rows.push({ exerciseName: did, completedAt: l.completedAt, actualLoad: l.actualLoad, actualReps: l.actualReps, rpe: l.rpe, actualSets: l.actualSets });
    }
  }
  const series = progressSeries(rows);
  const out: Record<string, ProgressPoint> = {};
  for (const e of exercises) {
    const points = series[e.exerciseId];
    if (points?.length) out[e.id] = points[points.length - 1];
  }
  return out;
}

/** GET /api/coach/me/today — the client's next session across their active programs, with the open log and recent coach comments. */
export async function loadToday(db: TodayDb, userId: string, now: Date = new Date()): Promise<TodayPayload> {
  // MIRROR-COACH P5 FIX (2026-09-29, code review): computed once, ahead of the program loop, so it lands in every
  // return below regardless of which one this call takes (a live session, a finished program, or no program at all —
  // a standing red flag should read as blocked on every one of those, not just the common case).
  const intake = await latestIntake(db, userId);
  const hardStopped = isHardStopped(intake);
  const redFlagCopy = hardStopped ? RED_FLAG_COPY : null;

  const programs = await db.coachingProgram.findMany({
    where: { clientId: userId, isActive: true }, orderBy: { startDate: 'asc' },
    include: { ...TREE_INCLUDE, clientSessions: { where: { clientId: userId }, include: { exerciseLogs: { include: SET_ORDER } }, orderBy: { createdAt: 'desc' } } },
  });
  let finished: (typeof programs)[number] | null = null;
  for (const p of programs) {
    const tree = toTree(p);
    const done = p.clientSessions.filter((c) => c.completedAt).map((c) => c.sessionId);
    const next = nextSession(tree, done);
    // nextSession is null for a finished program AND for one with no sessions at all (a camp plan saved with no
    // milestones has none). Only the first is "Program complete" (MIRROR-COACH P2 review, 2026-09-26).
    if (!next) { if (!finished && orderedSessions(tree).length > 0) finished = p; continue; }
    const open = p.clientSessions.find((c) => c.sessionId === next.session.id && !c.completedAt) ?? null;
    const coach = await db.user.findUnique({ where: { id: p.coachId }, select: { name: true, email: true } });
    const recentComments = await db.exerciseLog.findMany({
      where: { clientSession: { clientId: userId, programId: p.id }, coachComment: { not: null } }, orderBy: { coachCommentAt: 'desc' }, take: 5,
      include: { sessionExercise: { include: { exercise: { select: { name: true } } } } },
    });

    // the coaching: each prescribed exercise's catalogue row, off the same query
    const rows = new Map<string, CatalogueCoachingRow>();
    for (const b of p.blocks) for (const s of b.sessions) if (s.id === next.session.id) for (const e of s.exercises) rows.set(e.id, e.exercise as CatalogueCoachingRow);
    const dobYear = (await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }))?.dobYear ?? null;
    // MIRROR-COACH P8 (2026-09-29): the protocol gate, before anything is built from the rows (see the header)
    const actions = await gateToday(db, userId, p, next.session.exercises, rows, { dobYear, latestIntake: intake }, now);
    const swapRows = [...actions.values()].flatMap((a) => (a.kind === 'swap' ? [a.to as CatalogueCoachingRow] : []));
    // the easier/harder links are bare ids: resolve the names, from THIS coach's catalogue only (a swapped-in easier
    // step's own links included)
    const ids = variationIds([...rows.values(), ...swapRows]);
    const names = new Map<string, string>();
    if (ids.length) for (const r of await db.programExercise.findMany({ where: { id: { in: ids }, coachId: p.coachId }, select: { id: true, name: true } })) names.set(r.id, r.name);
    // MIRROR-COACH P2 review (2026-09-26): youth rules for the reading client (decisions #6, #20: under 18, or no birth
    // year) — no adults-only band and no max-effort cue on their card (lib/coach/today.ts todayExercise)
    const youth = youthRules(dobYear);

    const exercises: TodayExercise[] = [];
    const held: TodayHeldItem[] = [];
    for (const e of next.session.exercises) {
      const a = actions.get(e.id);
      if (a && a.kind !== 'keep') {
        const { why, href } = a.unread ? { why: GATE_UNREAD_LINE, href: null } : athleteWhy(a.reasons);
        const reason = a.unread ? GATE_UNREAD_REASON : leadReason(a.reasons) ?? '';
        if (a.kind === 'hold') { held.push({ id: e.id, name: e.name, line: heldLine(e.name, why), href, reason }); continue; }
        const to = a.to as CatalogueCoachingRow & GateRow & { defaultTempo?: unknown };
        const toName = typeof to.name === 'string' ? to.name : e.name;
        // MIRROR-COACH P8 FIX (2026-09-30, code review — blocker): the easier step is served with ITS prescription —
        // the jump noun off the reps, no landing cue, its own tempo, the coach's jump note said as the jump's
        // (protocolGate.ts swapPrescription). It kept the jump's "3 × 3 jumps" and "Land quiet" on a squat.
        exercises.push({
          ...todayExercise(swapPrescription({ ...e, exerciseId: to.id, name: toName }, to, e.name), to, names, { youth }),
          protocolGate: { from: { id: e.exerciseId, name: e.name }, line: swappedLine(e.name, why), href, reason },
        });
        continue;
      }
      exercises.push(todayExercise(e, rows.get(e.id), names, { youth }));
    }

    return {
      program: { id: p.id, name: p.name, coachName: coach?.name ?? coach?.email?.split('@')[0] ?? 'coach' },
      today: {
        block: { id: next.block.id, order: next.block.order, label: next.block.label, targetDate: next.block.targetDate },
        session: {
          id: next.session.id, order: next.session.order, label: next.session.label, kind: next.session.kind === 'recovery' ? 'recovery' : 'training',
          exercises,
          ...(held.length ? { held } : {}),
        },
        index: next.index, total: next.total,
        week: { label: next.block.label, entries: weekView(next.block.sessions, done, next.session.id) },
        lastTime: lastTimeFor(p, exercises),
      },
      open: open ? { id: open.id, logs: open.exerciseLogs as unknown as OpenLog[], cooldownDone: !!open.cooldownDoneAt } : null,
      recentComments: recentComments.map((l) => ({ exercise: l.sessionExercise.exercise.name, comment: l.coachComment, at: l.coachCommentAt })),
      hardStopped, redFlagCopy,
    };
  }
  // Every active program is finished. This used to answer { program: null } too, so a client who had just pressed Done
  // on the last session read "No active program yet. A certified coach assigns one…" — Today's "Program complete"
  // line (today-view.tsx) was unreachable. Now the finished program is named, with no session. A program with NO
  // sessions is not finished: P2 named programs[0] whatever it held, so a client whose only program had no sessions yet
  // read "Program complete — nothing left on the plan"; that falls through to "no active program", as before P2.
  if (finished) {
    const coach = await db.user.findUnique({ where: { id: finished.coachId }, select: { name: true, email: true } });
    return { program: { id: finished.id, name: finished.name, coachName: coach?.name ?? coach?.email?.split('@')[0] ?? 'coach' }, today: null, open: null, recentComments: [], hardStopped, redFlagCopy };
  }
  return { program: null, today: null, open: null, recentComments: [], hardStopped, redFlagCopy };
}

/**
 * WHAT THE ATHLETE DID ON A SLOT THE GATE DECIDES — MIRROR-COACH P8 FIX (2026-09-30, code review — "The coach's inbox
 * credits the athlete with the jump when they logged the easier step"). A swapped item keeps its SessionExercise id on
 * purpose (the log lands on the slot the coach prescribed), and ExerciseLog stored nothing about what was done, so the
 * inbox read "Box Jump and Stick: 3 sets done" when the athlete did Fast Bodyweight Squat — and a coach reading that as
 * landings tolerated might progress them toward the depth drop, the exact decision the gate exists to inform. Now the
 * log carries ExerciseLog.servedExerciseId (additive, nullable: prisma/pending/2026-09-29-mirror-coach-p8-served-
 * exercise.sql): the easier step's catalogue id, or null for "done as written".
 *
 * SERVER-CHECKED. Only a slot whose prescribed row is gated (protocolGate.ts isProtocolGated) gets a value, and only:
 *   · the page's claim, when it names exactly that slot's ladder step (easierUngatedStep over the coach's own rows) —
 *     the step Today served, even if the gate opened between the page's load and the save; or `null` ("as written");
 *   · otherwise (a page that did not say — an old tab, a probe — or a claim naming anything else) the gate re-run now:
 *     a swap records its step, anything else null.
 * A read that fails records nothing (the log saves as before): the save never fails over this.
 */
async function servedOnSlots(
  db: TodayDb, userId: string, program: { coachId: string; clientId: string },
  slots: readonly { id: string; exerciseId: string }[], claims: ReadonlyMap<string, string | null | undefined>, now: Date = new Date(),
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const logged = slots.filter((x) => claims.has(x.id));
  if (!logged.length) return out;
  try {
    const rows = await db.programExercise.findMany({
      where: { id: { in: [...new Set(logged.map((x) => x.exerciseId))] }, coachId: program.coachId },
      select: { id: true, coachId: true, name: true, category: true, skillLayer: true, regressionOfId: true },
    }) as unknown as GateRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const gated = logged.filter((x) => isProtocolGated(byId.get(x.exerciseId)));
    if (!gated.length) return out;
    const ladder = await loadLadder(db, program.coachId, gated.map((x) => byId.get(x.exerciseId)!));
    // the gate's facts, read once and only when a slot needs re-deciding
    let verdict: { athlete: ReturnType<typeof protocolReasons>; coachAssigned: boolean } | null = null;
    for (const x of gated) {
      const row = byId.get(x.exerciseId)!;
      const step = easierUngatedStep(row, ladder);
      const claim = claims.get(x.id);
      if (claim === null) { out.set(x.id, null); continue; }
      if (claim !== undefined && step && claim === step.id) { out.set(x.id, claim); continue; }
      if (!verdict) {
        const pre = { latestIntake: await latestIntake(db, userId) };
        const [athlete, coachAssigned] = await Promise.all([loadProtocolFacts(db, userId, now, pre).then((f) => protocolReasons(f, now)), coachAssignedProgram(db, program)]);
        verdict = { athlete, coachAssigned };
      }
      const a = gateAction(row, verdict.athlete, ladder, { coachAssigned: verdict.coachAssigned });
      out.set(x.id, a.kind === 'swap' ? a.to.id : null);
    }
    return out;
  } catch (e) {
    console.error('[coach/log] what the gate served could not be worked out; the log saves without it', e);
    return new Map();
  }
}

export type SaveResult =
  | { ok: true; clientSession: unknown }
  | { ok: false; status: number; error: string; sessionExerciseId?: string; set?: number };

const fail = (status: number, error: string, extra: { sessionExerciseId?: string; set?: number } = {}): SaveResult => ({ ok: false, status, error, ...extra });

/**
 * POST /api/coach/me/log — the client logs a session.
 *  { programId, sessionId, logs: [{ sessionExerciseId, sets?: [{ reps?, weight?, unit?, rir?, effort?, workSeconds?, note? }],
 *    actualSets?, actualReps?, actualLoad?, rpe?, clientNote?, videoUrl? }], complete?: boolean }
 * Opens (or reuses) the client's open ClientSession for that session, upserts one ExerciseLog per exercise (and its
 * SetLogs when `sets` is sent), and marks the session complete when asked. The client can only log their own active
 * program. Every entry is validated before anything is written, so a refused set saves nothing.
 */
export async function saveClientLog(db: TodayDb, userId: string, body: Record<string, unknown>): Promise<SaveResult> {
  // MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "General training … is not gated by the intake's
  // red-flag hard stop": the client is never trusted to enforce loadToday's own `hardStopped` flag by itself —
  // this is the server-side half, checked before any read or write below.
  if (isHardStopped(await latestIntake(db, userId))) return fail(403, 'health_hard_stopped');

  const programId = String(body.programId ?? ''), sessionId = String(body.sessionId ?? '');
  const program = await db.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, clientId: true, coachId: true, isActive: true } });
  if (!program || program.clientId !== userId) return fail(403, 'forbidden');
  if (!program.isActive) return fail(409, 'program_inactive');
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { block: { select: { programId: true } }, exercises: { select: { id: true, exerciseId: true } } } });
  if (!session || session.block.programId !== programId) return fail(404, 'session_not_found');
  const allowed = new Set(session.exercises.map((e) => e.id));

  const logs = Array.isArray(body.logs) ? body.logs.slice(0, 40) : [];
  const cleaned: CleanLog[] = [];
  // MIRROR-COACH P8 FIX: what the page says it served on each slot (undefined = it did not say; see servedOnSlots)
  const claims = new Map<string, string | null | undefined>();
  for (const raw of logs) {
    const v = validateLog(raw && typeof raw === 'object' ? raw : {});
    if (!v.ok) return fail(400, v.error, { ...(raw && typeof raw.sessionExerciseId === 'string' ? { sessionExerciseId: raw.sessionExerciseId } : {}), ...(v.set ? { set: v.set } : {}) });
    if (!allowed.has(v.log.sessionExerciseId)) return fail(400, 'exercise_not_in_session');
    cleaned.push(v.log);
    const claim = raw && typeof raw === 'object' && 'servedExerciseId' in raw ? (raw as { servedExerciseId?: unknown }).servedExerciseId : undefined;
    claims.set(v.log.sessionExerciseId, claim === undefined ? undefined : typeof claim === 'string' && claim ? claim : null);
  }
  const served = await servedOnSlots(db, userId, { coachId: program.coachId, clientId: program.clientId }, session.exercises, claims);

  let cs = await db.clientSession.findFirst({ where: { programId, sessionId, clientId: userId, completedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!cs) cs = await db.clientSession.create({ data: { programId, sessionId, clientId: userId } });
  const now = new Date();
  const setWrites: { exerciseLogId: string; sets: CleanSet[] }[] = [];
  for (const l of cleaned) {
    const existing = await db.exerciseLog.findFirst({ where: { clientSessionId: cs.id, sessionExerciseId: l.sessionExerciseId }, include: { setLogs: { select: { id: true } } } });
    const summary = summaryToWrite(
      { actualSets: l.actualSets, actualReps: l.actualReps, actualLoad: l.actualLoad, rpe: l.rpe }, l.sets,
      { exists: !!existing, hadSets: (existing?.setLogs.length ?? 0) > 0 },
    );
    // MIRROR-COACH P2 review (2026-09-26): an untouched exercise writes no NEW row. Today sends every exercise on Save,
    // and an empty ExerciseLog read as logged coached work on the coach's boards and blocked the builder's remove
    // (lib/coach/setLog.ts logHasContent). Completing the session still writes one per exercise, as it always did.
    if (!existing && !body.complete && logEntryIsEmpty(summary, l)) continue;
    const data = {
      ...summary, clientNote: l.clientNote, videoUrl: l.videoUrl, completedAt: body.complete ? now : existing?.completedAt ?? null,
      // MIRROR-COACH P8 FIX: only on a slot the gate decides; every other log writes exactly what it always did
      ...(served.has(l.sessionExerciseId) ? { servedExerciseId: served.get(l.sessionExerciseId) ?? null } : {}),
    };
    const row = existing
      ? await db.exerciseLog.update({ where: { id: existing.id }, data })
      : await db.exerciseLog.create({ data: { clientSessionId: cs.id, sessionExerciseId: l.sessionExerciseId, ...data } });
    if (l.sets !== null) setWrites.push({ exerciseLogId: row.id, sets: l.sets });
  }
  // the sets, all exercises at once and all-or-nothing: the list sent is the whole list, so rows past its end go
  // (a set the client cleared) and each (log, setIndex) is written in place (@@unique([exerciseLogId, setIndex]))
  if (setWrites.length) {
    await db.$transaction(setWrites.flatMap(({ exerciseLogId, sets }) => [
      db.setLog.deleteMany({ where: { exerciseLogId, setIndex: { gte: sets.length } } }),
      ...sets.map((s) => {
        const { setIndex, ...fields } = s;
        return db.setLog.upsert({ where: { exerciseLogId_setIndex: { exerciseLogId, setIndex } }, create: { exerciseLogId, setIndex, ...fields }, update: fields });
      }),
    ]));
  }
  if (body.complete) {
    cs = await db.clientSession.update({ where: { id: cs.id }, data: { completedAt: now } });
    await db.exerciseLog.updateMany({ where: { clientSessionId: cs.id, completedAt: null }, data: { completedAt: now } });
  }
  const out = await db.clientSession.findUnique({ where: { id: cs.id }, include: { exerciseLogs: { include: SET_ORDER } } });
  return { ok: true, clientSession: out };
}
