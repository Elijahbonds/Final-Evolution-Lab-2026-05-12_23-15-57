// lib/signature/server.ts — SIGNATURE-PROGRAMS (2026-10-25): the programs' server half. The pages and routes
// (app/train/programs/**, app/api/signature-programs/**, app/coach/admin/programs, app/api/admin/signature-programs) are a few lines over these.
//
//   · WHO SEES WHAT (./access.ts): approved programs for everyone signed in; drafts for the admin role only, labelled.
//   · WHO KEEPS WHAT: an adult's enrollment is one row (./store.ts, pending SQL); under youth rules nothing is written —
//     the page keeps the free week's progress on the phone (./deviceProgress.ts), as the Mirror's and the readiness
//     check's under-18 progress is kept.
//   · TODAY'S GATES (./serve.ts) come from the drills page's context (lib/coach/warmupServer.ts loadWarmupContext: youth,
//     today's pain decision, the red flag, the protocol gate's jump gate) and today's readiness check under FEL's
//     default rule (no coach: lib/coach/readiness/rules.ts DEFAULT_RULE, "ease off"). A context that cannot be read is
//     the careful one.
//   · DONE: marking a session done (once per session instance, race-safe in SQL), then — when it finishes a checkpoint
//     week — the retests are read (./facts.ts) and the decision kept (./adapt.ts; once per week). Through the game:
//     the session counts toward the daily streak the way a Studio creation does (lib/session-payout.ts streakStep
//     'creation': the day counts, no Lab Credits change hands, the day's first game still pays its streak LC) and pays
//     SESSION_XP account XP, once per session instance.
//   · PREMIUM: week 1 free; later weeks need an active FEL Pro (lib/pro-guard.ts isProUser). The server refuses to mark a
//     locked week's session and never sends its content.
//
// Takes its database and its reads as `deps`, so the route tests run the real code over stand-ins.
import 'server-only';
import { prisma } from '@/lib/db';
import { isProUser } from '@/lib/pro-guard';
import { isPurchaseOpen } from '@/lib/payments/allowlist';
import { youthRules } from '@/lib/coach/taxonomy';
import { loadWarmupContext } from '@/lib/coach/warmupServer';
import { FALLBACK_WARMUP_CONTEXT, type WarmupContext } from '@/lib/coach/warmup';
import { libraryState } from '@/lib/library/server';
import type { LibraryExercise } from '@/lib/library/types';
import { checksFor } from '@/lib/coach/readiness/store';
import { factsOf } from '@/lib/coach/readiness/server';
import { DEFAULT_RULE, applyRule } from '@/lib/coach/readiness/rules';
import { READINESS_TODAY_HOURS, TWICE_GAP_DAYS } from '@/lib/coach/readiness/thresholds';
import { isPlausibleToday } from '@/lib/health/readiness';
import { scanSaveUserWhere } from '@/lib/profile-v2/gate';
import { JUMP_SCAN_KINDS } from '@/lib/profile-v2/load';
import { jumpCmOf } from '@/lib/profile-v2/assemble';
import { valueFromRow } from '@/lib/mirror/progressReading';
import { SHOT_SCAN_KIND, shotMade } from '@/lib/daily-drill/skills';
import { streakStep } from '@/lib/session-payout';
import { getOrCreateProfile } from '@/lib/profile-service';
import { weekAccess, statusOf, type ReviewStatus, type Viewer } from './access';
import { decide } from './adapt';
import { programProblems } from './check';
import { SIGNATURE_PROGRAMS, signatureProgram } from './content';
import { applyEdits, cleanEdits, type ProgramEdits } from './edits';
import { NO_ROWS, READINESS_DAYS, START_BEFORE_DAYS, readsFrom, type RetestRows } from './facts';
import { expandPlan, positionIn } from './plan';
import type { DayGate, ExerciseLite, Lookup } from './serve';
import {
  addEvent, markDone, readEnrollment, readEnrollments, readReviews, signatureReady, startEnrollment, stopEnrollment, writeReview,
  type RawDb, type StoredEnrollment, type StoredReview,
} from './store';
import type { PlanEvent, SignatureId, SignatureProgram } from './types';
import { buildProgramView, programCard, type ProgramCard, type ProgramView } from './view';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Account XP for a finished program session: the same as a finished lesson (app/api/education/complete: 20). (new) */
export const SESSION_XP = 20;

export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });

/** Everything the server reads, so a test can stand in for each. */
export interface SignatureDeps {
  raw: RawDb;
  /** The signed-in user's birth year (youth rules), or null. */
  dobYear: (userId: string) => Promise<number | null>;
  isPro: (userId: string) => Promise<boolean>;
  warmup: (userId: string, now: Date) => Promise<WarmupContext>;
  /** The library, as a lookup (the overlay of the owner's library decisions included). */
  library: () => Promise<(id: string) => LibraryExercise | null>;
  retestRows: (userId: string, startedAt: Date, gate: DayGate, now: Date) => Promise<RetestRows>;
  readinessToday: (userId: string, now: Date) => Promise<{ low: boolean }>;
  /** A finished session through the game: the streak day and the XP. */
  reward: (userId: string, now: Date) => Promise<{ streakCounted: boolean; streakDays: number | null; xp: number }>;
  purchasesOpen: () => boolean;
}

const raw = (): RawDb => prisma as unknown as RawDb;
const soft = <T>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

/** The real reads. */
export function defaultDeps(): SignatureDeps {
  return {
    raw: raw(),
    dobYear: async (userId) => (await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null))?.dobYear ?? null,
    isPro: (userId) => isProUser(userId).catch(() => false),
    warmup: (userId, now) => loadWarmupContext(prisma, userId, now).catch(() => FALLBACK_WARMUP_CONTEXT),
    library: async () => {
      const { index } = await libraryState();
      return (id) => index.docs[index.byId.get(id) ?? -1] ?? null;
    },
    retestRows: loadRetestRows,
    readinessToday: soloReadinessToday,
    reward: rewardSession,
    purchasesOpen: () => isPurchaseOpen('fel_pro'), // VIRTUAL_PURCHASES_ENABLED + PURCHASES_ALLOWLIST (payments-ready)
  };
}

// ── the reads ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The retests' rows for one adult since the start window (./facts.ts); each read fails soft to no number. */
export async function loadRetestRows(userId: string, startedAt: Date, gate: DayGate, now: Date): Promise<RetestRows> {
  const since = new Date(startedAt.getTime() - START_BEFORE_DAYS * DAY_MS);
  const canSave = scanSaveUserWhere(now);
  const [scans, shots, mirror, checks, week] = await Promise.all([
    soft(prisma.workoutScan.findMany({ where: { userId, kind: { in: [...JUMP_SCAN_KINDS] }, createdAt: { gte: since }, user: { is: canSave } }, select: { kind: true, metrics: true, createdAt: true }, take: 400 }), []),
    soft(prisma.workoutScan.findMany({ where: { userId, kind: SHOT_SCAN_KIND, createdAt: { gte: since }, user: { is: canSave } }, select: { metrics: true, createdAt: true }, take: 600 }), []),
    soft(prisma.mirrorSession.findMany({ where: { userId, patternId: { in: ['squat', 'lunge'] }, createdAt: { gte: since }, user: { is: canSave } }, select: { patternId: true, reps: true, faultCounts: true, createdAt: true }, take: 400 }), []),
    soft(checksFor(raw(), userId, since, 200, now.getTime()), null),
    soft(checksFor(raw(), userId, new Date(now.getTime() - READINESS_DAYS * DAY_MS), 14, now.getTime()), null),
  ]);
  const jumps: RetestRows['jumps'] = [];
  for (const s of scans) { const cm = jumpCmOf(s.kind, s.metrics); if (cm !== null) jumps.push({ at: s.createdAt.getTime(), cm }); }
  for (const c of checks ?? []) jumps.push({ at: Date.parse(c.createdAt), cm: c.bestCm });
  const form: RetestRows['form'] = [];
  for (const m of mirror) { const v = valueFromRow(m); if (v !== null) form.push({ at: m.createdAt.getTime(), share: v }); }
  const shotRows: RetestRows['shots'] = [];
  for (const s of shots) { const made = shotMade(s.metrics); if (made !== null) shotRows.push({ at: s.createdAt.getTime(), made }); }
  return { jumps, form, shots: shotRows, readinessLowDays: week ? new Set(week.filter((c) => c.band === 'low').map((c) => c.day)).size : null, landingPassed: gate.jumpGate.closed === false };
}

/** Today's saved readiness check under FEL's default rule (a signature program has no coach to set one). */
export async function soloReadinessToday(userId: string, now: Date): Promise<{ low: boolean }> {
  const nowMs = now.getTime();
  const recent = await soft(checksFor(raw(), userId, new Date(nowMs - (TWICE_GAP_DAYS + 1) * DAY_MS), 8, nowMs), null);
  const today = recent?.find((c) => Date.parse(c.createdAt) >= nowMs - READINESS_TODAY_HOURS * HOUR_MS && isPlausibleToday(c.day, now));
  if (!today || !recent) return { low: false };
  const prev = recent.filter((c) => c.day < today.day).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const read = applyRule(factsOf(today), DEFAULT_RULE, prev ? { ...prev } : null, today.day);
  return { low: read.band === 'low' && read.ease };
}

/**
 * The streak day, the way a Studio creation counts it (app/api/sessions/route.ts, the creation branch): when the day is
 * due, conditional on the lastStreakAt this request read (two finishes count one day), streakDays and lastStreakAt only —
 * no Lab Credits (the day's first game still pays its streak LC: streakStep's `owed`). Then SESSION_XP account XP.
 */
export async function rewardSession(userId: string, now: Date): Promise<{ streakCounted: boolean; streakDays: number | null; xp: number }> {
  const profile = await getOrCreateProfile(userId);
  const step = streakStep(profile as never, now.getTime(), 'creation');
  let counted = false;
  if (step.due) {
    const seen = (profile as { lastStreakAt?: Date | null }).lastStreakAt;
    const r = await prisma.playerProfile.updateMany({ where: { userId, ...(seen ? { lastStreakAt: seen } : {}) }, data: { streakDays: step.streakDays, lastStreakAt: now } });
    counted = r.count > 0;
  }
  await prisma.playerProfile.update({ where: { userId }, data: { xp: { increment: SESSION_XP } } });
  return { streakCounted: counted, streakDays: counted ? step.streakDays : (profile as { streakDays?: number }).streakDays ?? null, xp: SESSION_XP };
}

// ── the viewer and the day ───────────────────────────────────────────────────────────────────────────────────────

export async function signatureViewer(userId: string, role: string | undefined, deps: SignatureDeps): Promise<Viewer> {
  const [dobYear, hasPro] = await Promise.all([deps.dobYear(userId), deps.isPro(userId)]);
  return { userId, isAdmin: role === 'admin', youth: youthRules(dobYear), hasPro };
}

export async function dayGate(viewer: Viewer, deps: SignatureDeps, now: Date): Promise<DayGate> {
  const [ctx, ready] = await Promise.all([deps.warmup(viewer.userId, now), viewer.youth ? Promise.resolve({ low: false }) : deps.readinessToday(viewer.userId, now).catch(() => ({ low: false }))]);
  return {
    youth: viewer.youth || ctx.isYouth, hardStopped: ctx.hardStopped, painDecision: ctx.painDecision, jumpGate: ctx.jumpGate,
    ...(ctx.unavailable ? { unavailable: true } : {}), readinessLow: ready.low,
  };
}

export const toLite = (e: LibraryExercise): ExerciseLite => ({
  id: e.id, name: e.name, setup: e.setup, cues: [...e.cues], faults: e.faults.map((f) => ({ ...f })), pattern: e.pattern, category: e.category,
  youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: { sets: e.dosage.sets, reps: e.dosage.reps, seconds: e.dosage.seconds, restSec: e.dosage.restSec },
});

const liteLookup = (full: (id: string) => LibraryExercise | null): Lookup => (id) => { const e = full(id); return e ? toLite(e) : null; };

/** The program as the owner has edited it, and its review state. */
function reviewed(id: SignatureId, reviews: ReadonlyMap<string, StoredReview> | null): { program: SignatureProgram; status: ReviewStatus; review: StoredReview | null } | null {
  const base = signatureProgram(id);
  if (!base) return null;
  const review = reviews?.get(id) ?? null;
  return { program: applyEdits(base, cleanEdits(base, review?.edits ?? {})), status: statusOf(id, reviews), review };
}

// ── the athlete ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The list: approved programs (the admin also sees drafts), each with the athlete's place in it. */
export async function programsOverview(viewer: Viewer, deps: SignatureDeps, now: Date = new Date()): Promise<{ ready: boolean; admin: boolean; youth: boolean; programs: ProgramCard[] }> {
  const reviews = await readReviews(deps.raw, now.getTime());
  const enrollments = reviews && !viewer.youth ? (await readEnrollments(deps.raw, viewer.userId, now.getTime())) ?? [] : [];
  const programs = SIGNATURE_PROGRAMS.flatMap((base) => {
    const r = reviewed(base.id, reviews)!;
    if (r.status !== 'approved' && !viewer.isAdmin) return [];
    return [programCard(r.program, r.status, enrollments.find((e) => e.programId === base.id) ?? null, viewer.youth)];
  });
  return { ready: !!reviews, admin: viewer.isAdmin, youth: viewer.youth, programs };
}

/** The athlete's active program's one line for Train (the first one, by last activity), or null. */
export async function trainLine(viewer: Viewer, deps: SignatureDeps, now: Date = new Date()): Promise<ProgramCard | null> {
  if (viewer.youth) return null;
  const o = await programsOverview(viewer, deps, now).catch(() => null);
  return o?.programs.find((p) => p.progress && !p.draft) ?? null;
}

/** Take any checkpoint decision that is due (a done week whose decision was not kept yet). Idempotent. */
async function settle(viewer: Viewer, program: SignatureProgram, e: StoredEnrollment, gate: DayGate, deps: SignatureDeps, now: Date): Promise<StoredEnrollment> {
  let cur = e;
  for (let guard = 0; guard < 4; guard++) {
    const weeks = expandPlan(program, { youth: false, events: cur.events });
    const pos = positionIn(weeks, cur.done, cur.events);
    const w = pos.pendingCheckpoint;
    if (!w) return cur;
    const rows = await deps.retestRows(viewer.userId, new Date(cur.startedAt), gate, now).catch(() => NO_ROWS);
    const nextPhase = program.phases[program.phases.findIndex((p) => p.id === w.phaseId) + 1] ?? null;
    const d = decide({ program, events: cur.events, week: w, reads: readsFrom(rows, Date.parse(cur.startedAt), now.getTime()), painDecision: gate.painDecision, hardStopped: gate.hardStopped, nextLabel: nextPhase?.label ?? null });
    const ev: PlanEvent = { ...d, at: now.toISOString() };
    await addEvent(deps.raw, viewer.userId, program.id, ev);
    cur = (await readEnrollment(deps.raw, viewer.userId, program.id, now.getTime())) ?? { ...cur, events: [...cur.events, ev] };
  }
  return cur;
}

/** The program page's view, or null when this viewer may not see it. */
export async function programPage(viewer: Viewer, id: SignatureId, deps: SignatureDeps, now: Date = new Date()): Promise<ProgramView | null> {
  const reviews = await readReviews(deps.raw, now.getTime());
  const r = reviewed(id, reviews);
  if (!r) return null;
  const [gate, full] = await Promise.all([dayGate(viewer, deps, now), deps.library()]);
  let enrollment: StoredEnrollment | null = null;
  if (reviews && !viewer.youth && r.status === 'approved') {
    enrollment = (await readEnrollment(deps.raw, viewer.userId, id, now.getTime())) ?? null;
    if (enrollment) enrollment = await settle(viewer, r.program, enrollment, gate, deps, now);
  }
  return buildProgramView({ program: r.program, status: r.status, viewer, ready: !!reviews, enrollment, gate, lookup: liteLookup(full), purchasesOpen: deps.purchasesOpen() });
}

export async function startProgram(viewer: Viewer, id: SignatureId, deps: SignatureDeps, now: Date = new Date()): Promise<Res> {
  const reviews = await readReviews(deps.raw, now.getTime());
  if (!reviews) return res(503, { error: 'signature_not_ready' });
  const r = reviewed(id, reviews);
  if (!r || r.status !== 'approved') return res(404, { error: 'not_found' });
  if (viewer.youth) return res(200, { ok: true, keep: 'device' });
  await startEnrollment(deps.raw, viewer.userId, id, now.getTime());
  return res(200, { ok: true, keep: 'server' });
}

export async function stopProgram(viewer: Viewer, id: SignatureId, deps: SignatureDeps, now: Date = new Date()): Promise<Res> {
  if (!(await signatureReady(deps.raw, now.getTime()))) return res(503, { error: 'signature_not_ready' });
  if (viewer.youth) return res(200, { ok: true, keep: 'device' });
  return (await stopEnrollment(deps.raw, viewer.userId, id)) ? res(200, { ok: true }) : res(404, { error: 'not_enrolled' });
}

/**
 * Mark a session done. Refused: no enrollment; a session that is not in the CURRENT week (no skipping ahead); a locked
 * week (FEL Pro); a standing red flag. A second tap answers `already` and pays nothing.
 */
export async function completeSession(viewer: Viewer, id: SignatureId, sessionId: unknown, deps: SignatureDeps, now: Date = new Date()): Promise<Res> {
  if (typeof sessionId !== 'string' || !/^w\d{1,2}:[A-Z]$/.test(sessionId)) return res(400, { error: 'bad_session' });
  const reviews = await readReviews(deps.raw, now.getTime());
  if (!reviews) return res(503, { error: 'signature_not_ready' });
  const r = reviewed(id, reviews);
  if (!r || r.status !== 'approved') return res(404, { error: 'not_found' });
  if (viewer.youth) return res(200, { ok: true, keep: 'device' });
  const e0 = await readEnrollment(deps.raw, viewer.userId, id, now.getTime());
  if (!e0) return res(404, { error: 'not_enrolled' });
  const gate = await dayGate(viewer, deps, now);
  if (gate.hardStopped) return res(409, { error: 'red_flag' });
  // a checkpoint left undecided (a failed read last time) is decided before anything moves past it
  const e = await settle(viewer, r.program, e0, gate, deps, now);
  const weeks = expandPlan(r.program, { youth: false, events: e.events });
  const pos = positionIn(weeks, e.done, e.events);
  if (e.done[sessionId]) return res(200, { ok: true, already: true });
  if (!pos.week || !pos.week.sessions.some((s) => s.id === sessionId)) return res(409, { error: 'not_this_week' });
  if (weekAccess(pos.week.n, viewer) === 'locked') return res(402, { error: 'pro_required', week: pos.week.n });
  const marked = await markDone(deps.raw, viewer.userId, id, sessionId, now);
  if (!marked) return res(200, { ok: true, already: true });
  const reward = await deps.reward(viewer.userId, now).catch(() => ({ streakCounted: false, streakDays: null, xp: 0 }));
  const after = await readEnrollment(deps.raw, viewer.userId, id, now.getTime());
  const settled = after ? await settle(viewer, r.program, after, gate, deps, now) : null;
  const decided = settled?.events.find((ev) => !e.events.some((x) => x.afterWeek === ev.afterWeek)) ?? null;
  return res(200, { ok: true, reward, decision: decided ? { kind: decided.kind, line: decided.line } : null });
}

// ── the owner's review ───────────────────────────────────────────────────────────────────────────────────────────

export interface ReviewRow {
  id: SignatureId; title: string; status: ReviewStatus; note: string | null; updatedAt: string | null;
  edits: ProgramEdits; problems: string[];
  exercises: number; draftExercises: string[]; gaps: string[];
  program: SignatureProgram;
  names: Record<string, string>;
}

/** Every program as the owner reviews it: its checks, its library entries still in draft, its gaps, its edits. */
export async function reviewOverview(deps: SignatureDeps, now: Date = new Date()): Promise<{ ready: boolean; programs: ReviewRow[] }> {
  const [reviews, full] = await Promise.all([readReviews(deps.raw, now.getTime()), deps.library()]);
  const programs = SIGNATURE_PROGRAMS.map((base): ReviewRow => {
    const r = reviewed(base.id, reviews)!;
    const ids = [...new Set(r.program.phases.flatMap((ph) => ph.sessions.flatMap((s) => s.items.flatMap((i) => [i.ex, ...(i.down ? [i.down] : [])]))))];
    const names: Record<string, string> = {};
    for (const x of ids) names[x] = full(x)?.name ?? x;
    return {
      id: base.id, title: base.title, status: r.status, note: r.review?.note ?? null, updatedAt: r.review?.updatedAt ?? null,
      edits: r.review?.edits ?? {}, problems: programProblems(r.program, full),
      exercises: ids.length, draftExercises: ids.filter((x) => full(x)?.review.status !== 'approved'), gaps: [...base.gaps],
      program: r.program, names,
    };
  });
  return { ready: !!reviews, programs };
}

export type ReviewAction =
  | { action: 'approve' | 'reject' | 'draft'; id: string; note?: string }
  | { action: 'edit'; id: string; edits: unknown; note?: string };

/** Approve, reject, send back to draft, or save edits. An edit or an approval of a program with any problem is refused. */
export async function reviewAct(adminId: string, body: ReviewAction, deps: SignatureDeps, now: Date = new Date()): Promise<Res> {
  const reviews = await readReviews(deps.raw, now.getTime());
  if (!reviews) return res(503, { error: 'signature_not_ready' });
  const base = signatureProgram(body.id);
  if (!base) return res(404, { error: 'not_found' });
  const prev = reviews.get(base.id) ?? null;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : prev?.note ?? null;
  const full = await deps.library();
  if (body.action === 'edit') {
    const edits = cleanEdits(base, body.edits);
    const problems = programProblems(applyEdits(base, edits), full);
    if (problems.length) return res(422, { error: 'invalid_program', problems });
    // an edit keeps the program's standing status (the owner's approved default included): saving edits never hides it
    const keep = statusOf(base.id, reviews);
    await writeReview(deps.raw, { programId: base.id, status: keep, reviewerId: adminId, note, edits }, now.getTime());
    return res(200, { ok: true, status: keep });
  }
  const edits = prev?.edits ?? {};
  if (body.action === 'approve') {
    const problems = programProblems(applyEdits(base, cleanEdits(base, edits)), full);
    if (problems.length) return res(422, { error: 'invalid_program', problems });
  }
  const status: ReviewStatus = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : 'draft';
  await writeReview(deps.raw, { programId: base.id, status, reviewerId: adminId, note, edits }, now.getTime());
  return res(200, { ok: true, status });
}
