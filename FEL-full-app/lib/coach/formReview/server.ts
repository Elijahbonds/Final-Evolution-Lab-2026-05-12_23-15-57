// lib/coach/formReview/server.ts — COACH-VIDEO-REVIEW (2026-10-24): the routes' logic, behind every gate.
//
//   POST   /api/coach/form-reviews              the client sends a set (pose data only): submitFormReview
//   GET    /api/coach/form-reviews              the coach's queue (or ?mine=1, the client's sent sets): coachQueue / mySets
//   GET    /api/coach/form-reviews/[id]         one set with its keypoint tracks, for its coach or its client
//   DELETE /api/coach/form-reviews/[id]         the client deletes a set they sent
//   POST   /api/coach/form-reviews/[id]/reply   the coach's preset cue and note, posted to the program's thread
//
// WHO SEES WHAT. A set is its client's and their coach's — the coach of the program it was sent for, while the client is
// on that coach's LIVE roster (a link ended since hides the set from the coach; the client keeps it). Every other account
// gets 404, never 403, so an id says nothing about whether it exists. The sending gates are ./gate.ts's.
//
// Server only. The table may not be there yet (./store.ts): every path answers "not available" instead of 500.

import 'server-only';
import type { PrismaClient } from '@/lib/generated/prisma';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { validateMessage } from '../loop';
import { readTeenGate, type TeenGateDb } from '../teenGateServer';
import { sendDecision, SEND_COPY, type RecordContext, type SendDecision } from './gate';
export type { RecordContext };
import { isReviewMovement, MOVEMENT_SPECS, reviewMovementFor, type ReviewMovement } from './movements';
import { parseSubmission, trackedReps } from './payload';
import { cleanNote, presetText, replyMessage, replyPresets } from './reply';
import { flagsFor, scoreReps, summarize, trendLine, type TrendPoint } from './score';
import {
  claimReview, deleteMine, formReviewById, formReviewsReady, insertFormReview, mySentReviews, queueForCoach, setReplyMessage,
  trendRows, unclaimReview, type FormReviewRow, type RawDb,
} from './store';

export type FormReviewDb = RawDb & Pick<PrismaClient,
  'coachingProgram' | 'coachClient' | 'user' | 'sessionExercise' | 'programMessage' | 'scanSaveOptIn' | 'guardianConsent'>;

export interface Res { status: number; body: Record<string, unknown> }
const ok = (body: Record<string, unknown>): Res => ({ status: 200, body });
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { error, ...extra } });

/** How far back the coach's trend reads. */
export const TREND_DAYS = 90;
/** The points a trend keeps per client × movement. */
export const TREND_POINTS = 6;

async function liveLink(db: FormReviewDb, coachId: string, clientId: string): Promise<boolean> {
  try {
    return !!(await db.coachClient.findFirst({ where: { coachId, clientId, endedAt: null }, select: { id: true } }));
  } catch {
    return false;
  }
}

/**
 * The send gate's facts for this athlete and program (./gate.ts decides). `canSaveScan` is lib/privacy/scanSaveGate.ts
 * canSaveScanNumbers, asked by the caller — the route and the page call it themselves, so GAP 1's table can see the gate
 * where the write is (lib/privacy/scan-save-coverage.test.ts). A failed read closes the gate.
 */
async function sendDecisionFor(db: FormReviewDb, userId: string, program: { coachId: string; clientId: string }, canSaveScan: boolean): Promise<SendDecision> {
  const linked = program.clientId === userId && program.coachId !== userId && (await liveLink(db, program.coachId, userId));
  if (!linked) return sendDecision({ linked: false, adult: false, canSaveScan: false, teen: null });
  let dobYear: number | null = null;
  try {
    dobYear = (await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }))?.dobYear ?? null;
  } catch {
    return sendDecision({ linked, adult: false, canSaveScan: false, teen: { ok: false, error: 'age_required' } });
  }
  const adult = verifiedAdult(dobYear);
  const teen = adult ? null : await readTeenGate(db as unknown as TeenGateDb, userId);
  return sendDecision({ linked, adult, canSaveScan: adult && canSaveScan, teen });
}

interface Slot { exerciseName: string; movement: ReviewMovement | null }

/** The program slot a set is for: its exercise's name and the movement the camera reads it as. Null: not this program's. */
async function slotFor(db: FormReviewDb, programId: string, sessionExerciseId: string): Promise<Slot | null> {
  const se = await db.sessionExercise.findUnique({
    where: { id: sessionExerciseId },
    select: { exercise: { select: { name: true, pattern: true } }, session: { select: { block: { select: { programId: true } } } } },
  });
  if (!se || se.session.block.programId !== programId) return null;
  return { exerciseName: se.exercise.name, movement: reviewMovementFor({ name: se.exercise.name, pattern: se.exercise.pattern }) };
}

// ── the page ──────────────────────────────────────────────────────────────────────────────────────────────────────


/**
 * What /coach/form-review needs to open: null when this is not the signed-in client's program slot. A slot (the Today
 * card's SessionExercise id) names its own program; without one, a program and a movement do.
 */
export async function recordContext(db: FormReviewDb, userId: string, q: { slot?: string | null; program?: string | null; movement?: string | null }, canSaveScan: boolean): Promise<RecordContext | null> {
  const id = /^[A-Za-z0-9_-]{1,64}$/;
  let programId = q.program && id.test(q.program) ? q.program : null;
  const slotId = q.slot && id.test(q.slot) ? q.slot : null;
  if (slotId) {
    const se = await db.sessionExercise.findUnique({ where: { id: slotId }, select: { session: { select: { block: { select: { programId: true } } } } } });
    if (!se) return null;
    programId = se.session.block.programId;
  }
  if (!programId) return null;
  const program = await db.coachingProgram.findUnique({ where: { id: programId }, select: { coachId: true, clientId: true } });
  if (!program || program.clientId !== userId) return null;
  let exerciseName: string;
  let movement: ReviewMovement | null;
  if (slotId) {
    const slot = await slotFor(db, programId, slotId);
    if (!slot) return null;
    ({ exerciseName, movement } = slot);
  } else {
    movement = isReviewMovement(q.movement) ? q.movement : null;
    exerciseName = movement ? MOVEMENT_SPECS[movement].label : '';
  }
  if (!movement) return null;
  const d = await sendDecisionFor(db, userId, program, canSaveScan);
  const ready = await formReviewsReady(db);
  return {
    programId, sessionExerciseId: slotId, exerciseName, movement, ready,
    send: d.ok ? { ok: true } : { ok: false, error: d.error, ...SEND_COPY[d.error] },
  };
}

// ── the client sends ──────────────────────────────────────────────────────────────────────────────────────────────

export async function submitFormReview(db: FormReviewDb, userId: string, raw: unknown, rawBytes: number, canSaveScan: boolean, now: number = Date.now()): Promise<Res> {
  const parsed = parseSubmission(raw, rawBytes);
  if (!parsed.ok) return fail(parsed.error === 'too_large' ? 413 : 400, parsed.error);
  const sub = parsed.value;
  const program = await db.coachingProgram.findUnique({ where: { id: sub.programId }, select: { coachId: true, clientId: true } });
  if (!program || program.clientId !== userId) return fail(404, 'not_found');
  let exerciseName = MOVEMENT_SPECS[sub.movement].label;
  if (sub.sessionExerciseId) {
    const slot = await slotFor(db, sub.programId, sub.sessionExerciseId);
    if (!slot) return fail(404, 'not_found');
    if (slot.movement !== sub.movement) return fail(400, 'movement_mismatch');
    exerciseName = slot.exerciseName;
  }
  const d = await sendDecisionFor(db, userId, program, canSaveScan);
  if (!d.ok) return fail(403, d.error, { message: SEND_COPY[d.error].message, href: SEND_COPY[d.error].href });
  if (!(await formReviewsReady(db, now))) return fail(503, 'form_review_not_ready');

  // the scores and flags are the server's own, from the reps' faults: the client's screen computed the same
  const reps = scoreReps(sub.movement, sub.reps);
  const flags = flagsFor(sub.movement, reps);
  const set = summarize(reps);
  const keep = new Set(trackedReps(reps, flags));
  const tracks = sub.tracks.filter((t) => keep.has(t.rep));
  const id = await insertFormReview(db, {
    clientId: userId, coachId: program.coachId, programId: sub.programId, sessionExerciseId: sub.sessionExerciseId,
    exerciseName, movement: sub.movement, band: d.band,
    summary: { v: 1, aspect: sub.aspect, durationMs: sub.durationMs, reps, flags, set },
    tracks,
  }, now);
  if (!id) return fail(503, 'form_review_not_ready');
  return ok({ id, set, flags });
}

/** The client's own sent sets, newest first. */
export async function mySets(db: FormReviewDb, userId: string, now: number = Date.now()): Promise<Res> {
  const rows = await mySentReviews(db, userId, now);
  if (!rows) return ok({ available: false, items: [] });
  return ok({
    available: true,
    items: rows.map((r) => ({ id: r.id, exerciseName: r.exerciseName, movement: r.movement, reps: r.reps, setScore: r.setScore, flags: r.summary.flags, status: r.status, createdAt: r.createdAt, reviewedAt: r.reviewedAt })),
  });
}

// ── the coach's queue ─────────────────────────────────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string;
  clientId: string;
  clientName: string;
  programId: string;
  exerciseName: string;
  movement: ReviewMovement;
  reps: number;
  read: number;
  setScore: number | null;
  flags: FormReviewRow['summary']['flags'];
  status: 'unreviewed' | 'reviewed';
  createdAt: string;
  reviewedAt: string | null;
  trend: { line: string; points: TrendPoint[] };
}

export async function coachQueue(db: FormReviewDb, coachId: string, now: number = Date.now()): Promise<Res> {
  const rows = await queueForCoach(db, coachId, now);
  if (!rows) return ok({ available: false, items: [], unreviewed: 0 });
  const links = await db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true } }).catch(() => [] as { clientId: string }[]);
  const live = new Set(links.map((l) => l.clientId));
  const mine = rows.filter((r) => live.has(r.clientId));
  const ids = [...new Set(mine.map((r) => r.clientId))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }).catch(() => [] as { id: string; name: string | null }[]) : [];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name?.trim() || 'Athlete';
  const history = await trendRows(db, coachId, ids, now - TREND_DAYS * 86_400_000, now);
  const items: QueueItem[] = mine.map((r) => {
    const points = history
      .filter((h) => h.clientId === r.clientId && h.movement === r.movement && h.at <= r.createdAt)
      .map((h) => ({ at: h.at, setScore: h.setScore }))
      .slice(-TREND_POINTS);
    return {
      id: r.id, clientId: r.clientId, clientName: nameOf(r.clientId), programId: r.programId, exerciseName: r.exerciseName,
      movement: r.movement, reps: r.reps, read: r.summary.set?.read ?? r.reps, setScore: r.setScore, flags: r.summary.flags,
      status: r.status, createdAt: r.createdAt, reviewedAt: r.reviewedAt, trend: { line: trendLine(points), points },
    };
  });
  return ok({ available: true, items, unreviewed: items.filter((i) => i.status === 'unreviewed').length });
}

// ── one set ───────────────────────────────────────────────────────────────────────────────────────────────────────

export async function formReviewDetail(db: FormReviewDb, userId: string, id: string, now: number = Date.now()): Promise<Res> {
  const row = await formReviewById(db, id, now);
  if (!row) return fail(404, 'not_found');
  const asCoach = row.coachId === userId && (await liveLink(db, userId, row.clientId));
  if (!asCoach && row.clientId !== userId) return fail(404, 'not_found');
  return ok({
    review: {
      id: row.id, exerciseName: row.exerciseName, movement: row.movement, status: row.status, createdAt: row.createdAt, reviewedAt: row.reviewedAt,
      aspect: row.summary.aspect, reps: row.summary.reps, flags: row.summary.flags, set: row.summary.set, tracks: row.tracks,
    },
    presets: asCoach ? replyPresets(row.movement, row.summary.flags) : [],
  });
}

export async function deleteFormReview(db: FormReviewDb, userId: string, id: string, now: number = Date.now()): Promise<Res> {
  if (!(await formReviewsReady(db, now))) return fail(503, 'form_review_not_ready');
  return (await deleteMine(db, id, userId, now)) ? ok({ deleted: true }) : fail(404, 'not_found');
}

// ── the coach replies ─────────────────────────────────────────────────────────────────────────────────────────────

export async function replyToFormReview(db: FormReviewDb, coachId: string, id: string, body: unknown, now: number = Date.now()): Promise<Res> {
  const b = (body && typeof body === 'object' ? body : {}) as { cueId?: unknown; note?: unknown; rep?: unknown; markOnly?: unknown };
  const row = await formReviewById(db, id, now);
  if (!row || row.coachId !== coachId || !(await liveLink(db, coachId, row.clientId))) return fail(404, 'not_found');
  const program = await db.coachingProgram.findUnique({ where: { id: row.programId }, select: { coachId: true } });
  if (!program || program.coachId !== coachId) return fail(404, 'not_found');
  const flags = row.summary.flags;
  const flag = flags.find((f) => f.rep === b.rep) ?? flags[0] ?? null;
  const cue = b.cueId === undefined || b.cueId === null || b.cueId === '' ? null : presetText(row.movement, flags, b.cueId);
  if (b.cueId && !cue) return fail(400, 'bad_cue');
  const note = cleanNote(b.note);
  const markOnly = b.markOnly === true;
  if (!markOnly && !cue && !note) return fail(400, 'reply_required');
  if (!(await claimReview(db, id, coachId, now))) return fail(409, 'already_reviewed');
  if (markOnly) return ok({ reviewed: true, message: null });
  const text = validateMessage(replyMessage({ movement: row.movement, exerciseName: row.exerciseName, flag, cue, note }));
  try {
    if (!text) throw new Error('empty');
    const m = await db.programMessage.create({ data: { programId: row.programId, authorId: coachId, body: text } });
    await setReplyMessage(db, id, m.id, now);
    return ok({ reviewed: true, message: { ...m, mine: true, fromCoach: true } });
  } catch (e) {
    console.warn('[coach] form_review_reply_failed', e instanceof Error ? e.name : typeof e);
    await unclaimReview(db, id, coachId, now);
    return fail(503, 'reply_failed');
  }
}
