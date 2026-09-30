// lib/breath/rampServer.ts — MIRROR-COACH P7 (2026-09-29): GET/POST /api/breath/ramp's server half.
//
// THE CLIENT NEVER DECIDES. Today's key-set card asks GET whether to offer the Dial-Up Breath at all, and it starts the
// breath only after POST says yes. Both run the same pure gate (lib/breath/rampGate.ts rampGate) over facts this file
// reads for the signed-in athlete — the ONE thing the client sends is which exercise (sessionExerciseId), and that is
// checked against the session Today itself serves. Not even the day is taken from the client: the readiness gate reads
// every check-in that is "today" somewhere on Earth (rampGate.ts plausibleTodayKeys) and the most careful wins — so no
// choice of `date` can pick a day without a low check-in on it. Anything else in a body (an `eligible: true`, a
// `reasons: []`) is never read.
//
// WHAT IT READS, and from where (P5/P6's modules, never re-derived):
//   · User.dobYear — the age gate (lib/mirror/youth.ts via rampGate);
//   · the 'health_data' consent ledger — lib/health/consent.ts activeHealthDataConsent, and the ledger's OLDEST grant
//     (rampGate.ts consentOldEnough: a first opt-in waits a full window; erase keeps the ledger, so it does not
//     restart that clock). WITHOUT a live grant this
//     file does not read the pain, readiness or intake-history rows at all (P6's rule for readiness: FEL does not keep
//     processing health data after consent is withdrawn), and the verdict is simply "no".
//     MIRROR-COACH P7 FIX (2026-09-29, review): this line used to say the INTAKE was not read either, but loadToday
//     (below) reads the newest intake for every request — that is P5's own Today hard-stop read (lib/coach/todayServer.ts
//     latestIntake → isHardStopped), made whether or not the ramp is asked about, and this file does not judge it
//     without consent. ramp-route.test.ts now holds exactly that: without consent the only intake read is loadToday's
//     findFirst, never the ramp's own findMany;
//   · the newest intake — lib/health/intake.ts latestIntake — and every intake inside the intake's own year
//     (rampGate.ts RAMP_HISTORY_DAYS): a re-take does not erase an earlier lasting "yes" (rampIntakeHistoryReasons);
//   · today's pain decision — lib/coach/warmup.ts painDecisionToday over the stored PainCheckIn decisions in P6's
//     PAIN_LOOKBACK_DAYS window (the same read the warm-up's jump gate uses);
//   · today's readiness — every ReadinessCheckIn on a plausible today, read through lib/health/readiness.ts readReadiness;
//   · the Dial-Up uses in the rolling window — BreathLog, kind 'ramp';
//   · the set — lib/coach/todayServer.ts loadToday, i.e. EXACTLY the session Today shows, its key-set flag, its kind and
//     the open log's sets for that exercise (lib/breath/rampGate.ts keySetStarted).
//
// WHAT IT WRITES. POST writes one BreathLog row (kind 'ramp') when the breath STARTS — so an abandoned breath still
// counts against the limit (the careful direction). Then it re-reads the window and, if any OTHER use it can now see
// leaves no room for its own, it removes its own row and refuses ('raced'). MIRROR-COACH P7 FIX (2026-09-29, review):
// this used to back out only the LATER of two racers by insert time, which two racers can both fail to be — see
// rampGate.ts rampRaceReasons for the interleaving and why counting every visible use holds instead. Two racers can
// both back out; they can no longer both stay.
//
// Takes the database as an argument (the Today pattern), so lib/breath/ramp-route.test.ts runs the real route over the
// in-memory Today store on a lane whose database is offline on purpose.
import type { PrismaClient } from '@/public/_prisma/client';
import { loadToday, type TodayDb } from '../coach/todayServer';
import { PAIN_LOOKBACK_DAYS, painDecisionToday } from '../coach/warmup';
import { activeHealthDataConsent, type ConsentRow } from '../health/consent';
import { latestIntake } from '../health/intake';
import { readReadiness } from '../health/readiness';
import {
  RAMP_HISTORY_DAYS, RAMP_KIND, RAMP_LIMIT, RAMP_PACER, keySetStarted, mostCarefulReadiness, plausibleTodayKeys, rampGate, rampRaceReasons,
  rampWindowStart, type RampFacts, type RampReason, type RampTarget, type RampVerdict,
} from './rampGate';
import type { PacerSpec } from './pacer';

export type RampDb = TodayDb & Pick<PrismaClient, 'healthConsent' | 'painCheckIn' | 'readinessCheckIn' | 'breathLog'>;

export interface RampQuery {
  /** Today's SessionExercise id: the set the breath would come before. The only thing a request supplies. */
  sessionExerciseId: unknown;
}

/** Read every fact the gate needs, for this athlete, now. */
export async function loadRampFacts(db: RampDb, userId: string, q: RampQuery, now: Date = new Date()): Promise<RampFacts> {
  const sessionExerciseId = typeof q.sessionExerciseId === 'string' ? q.sessionExerciseId : '';
  const [user, consents, uses, today] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
    db.healthConsent.findMany({ where: { userId, scope: 'health_data' }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
    db.breathLog.findMany({ where: { userId, kind: RAMP_KIND, createdAt: { gte: rampWindowStart(now) } }, select: { createdAt: true, sessionId: true } }),
    loadToday(db, userId),
  ]);
  const healthDataConsent = !!activeHealthDataConsent(consents as ConsentRow[]);
  // the ledger's OLDEST grant, revoked or not: how far back FEL's record of this consent goes (consentOldEnough)
  const healthDataSince = (consents as ConsentRow[]).reduce<Date | null>((a, c) => (c.grantedAt && (!a || c.grantedAt < a) ? c.grantedAt : a), null);

  let intake: RampFacts['intake'] = null;
  let intakeHistory: RampFacts['intakeHistory'] = [];
  let painDecision: RampFacts['painDecision'] = null;
  let readiness: RampFacts['readiness'] = null;
  if (healthDataConsent) {
    const since = new Date(now.getTime() - PAIN_LOOKBACK_DAYS * 86_400_000);
    const days = plausibleTodayKeys(now);
    const [latest, history, pain, checkIns] = await Promise.all([
      latestIntake(db, userId),
      db.healthIntake.findMany({
        where: { userId, createdAt: { gte: new Date(now.getTime() - RAMP_HISTORY_DAYS * 86_400_000) } }, orderBy: { createdAt: 'desc' },
        select: { createdAt: true, answers: true, redFlags: true },
      }),
      db.painCheckIn.findMany({
        where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' },
        select: { exerciseName: true, bodyArea: true, decision: true, createdAt: true },
      }),
      db.readinessCheckIn.findMany({ where: { userId, date: { in: days } }, select: { sleep: true, soreness: true, energy: true, mood: true } }),
    ]);
    intake = latest ? { version: latest.version, createdAt: latest.createdAt, answers: latest.answers, redFlags: latest.redFlags, clearedAt: latest.clearedAt } : null;
    intakeHistory = history;
    painDecision = painDecisionToday(pain, now);
    readiness = mostCarefulReadiness(checkIns.map((c) => readReadiness(c).level));
  }

  let target: RampTarget | null = null;
  const session = today.today?.session;
  const exercise = session?.exercises.find((e) => e.id === sessionExerciseId);
  if (session && exercise) {
    const log = today.open?.logs.find((l) => l.sessionExerciseId === exercise.id) ?? null;
    target = { sessionId: session.id, isKeySet: !!exercise.isKeySet, sessionKind: session.kind, setStarted: keySetStarted(log) };
  }

  return { dobYear: user?.dobYear ?? null, healthDataConsent, healthDataSince, intake, intakeHistory, painDecision, readiness, uses, target };
}

/** GET's answer: the verdict, and — only when eligible — what to run. */
export interface RampStatus extends RampVerdict {
  limit: { perWindow: number; windowDays: number; perSession: number; minHoursBetween: number; firstUseAfterDays: number };
  pacer: PacerSpec | null;
}

export type RampResult<T> = { ok: true; body: T } | { ok: false; status: number; error: string; reasons?: RampReason[] };

const LIMIT_OUT = {
  perWindow: RAMP_LIMIT.perWindow, windowDays: RAMP_LIMIT.windowDays, perSession: RAMP_LIMIT.perSession, minHoursBetween: RAMP_LIMIT.minHoursBetween,
  firstUseAfterDays: RAMP_LIMIT.firstUseAfterDays,
};

function checkQuery(q: RampQuery): string | null {
  return typeof q.sessionExerciseId === 'string' && q.sessionExerciseId.length > 0 && q.sessionExerciseId.length <= 64 ? null : 'session_exercise_required';
}

/** GET /api/breath/ramp?sessionExerciseId=… — may this athlete dial up before this set right now? */
export async function rampStatus(db: RampDb, userId: string, q: RampQuery, now: Date = new Date()): Promise<RampResult<RampStatus>> {
  const bad = checkQuery(q);
  if (bad) return { ok: false, status: 400, error: bad };
  const verdict = rampGate(await loadRampFacts(db, userId, q, now), now);
  return { ok: true, body: { ...verdict, limit: LIMIT_OUT, pacer: verdict.eligible ? RAMP_PACER : null } };
}

export interface RampStarted {
  started: true;
  logId: string;
  /** Uses left in the rolling week AFTER this one. */
  usesLeft: number;
  pacer: PacerSpec;
}

/**
 * POST /api/breath/ramp { sessionExerciseId } — start one Dial-Up Breath. Re-runs the whole gate on fresh facts
 * (the GET a minute ago proves nothing now), logs the use, then re-checks the window for a race.
 *   412 health_data_consent_required — no live consent (the code every health route uses);
 *   403 ramp_not_allowed + reasons    — any other gate.
 */
export async function startRamp(db: RampDb, userId: string, q: RampQuery, now: Date = new Date()): Promise<RampResult<RampStarted>> {
  const bad = checkQuery(q);
  if (bad) return { ok: false, status: 400, error: bad };
  const facts = await loadRampFacts(db, userId, q, now);
  const verdict = rampGate(facts, now);
  if (!verdict.eligible) {
    if (verdict.reasons.includes('no_health_consent')) return { ok: false, status: 412, error: 'health_data_consent_required', reasons: verdict.reasons };
    return { ok: false, status: 403, error: 'ramp_not_allowed', reasons: verdict.reasons };
  }
  const sessionId = facts.target!.sessionId;
  // createdAt is the database's own insert time (schema default), not this request's clock: the race check below orders
  // uses by it, and one clock is what makes "who came first" the same answer for both racers
  const row = await db.breathLog.create({ data: { userId, kind: RAMP_KIND, sessionId }, select: { id: true } });

  // THE RACE CHECK (rampGate.ts rampRaceReasons): every OTHER use this request can now see must still leave room for
  // its own. The uses that were there before the gate ran already passed it, so only a racer can trip this; whoever
  // sees a conflicting use backs its own row out. Two racers can both back out (the athlete retries on a clean log);
  // they cannot both stay.
  const all = await db.breathLog.findMany({
    where: { userId, kind: RAMP_KIND, createdAt: { gte: rampWindowStart(now) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, createdAt: true, sessionId: true },
  });
  const raced = rampRaceReasons(all, row.id, sessionId, now);
  if (raced.length) {
    await db.breathLog.delete({ where: { id: row.id } });
    return { ok: false, status: 403, error: 'ramp_not_allowed', reasons: ['raced', ...raced] };
  }
  return { ok: true, body: { started: true, logId: row.id, usesLeft: Math.max(0, verdict.usesLeft - 1), pacer: RAMP_PACER } };
}
