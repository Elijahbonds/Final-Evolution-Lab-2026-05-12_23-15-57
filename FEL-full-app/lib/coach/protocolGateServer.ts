// lib/coach/protocolGateServer.ts — MIRROR-COACH P8 (2026-09-29): the protocol gate's server half.
//
// THE CLIENT NEVER DECIDES. lib/coach/protocolGate.ts is the rule; this file reads the facts it needs for one athlete,
// server-side, and nothing a request carries is read as one of them. Two callers:
//   · Today (lib/coach/todayServer.ts loadToday) — gates today's session before it leaves the server: a gated item the
//     athlete may not do yet goes out as its ladder's easier step, with the one-line why, or not at all (held back);
//   · the coach's view (GET /api/coach/programs/:id/gates → loadProgramGates below) — the program builder shows, under
//     each gated item, what the client's Today does with it right now and why.
// A template renderer (the P8 templates and the /workout relaunch) calls the same three: loadProtocolFacts, loadLadder
// and protocolGate.ts gateAction — with `coachAssigned: false` for an item a FEL template put there (decision #6).
//
// WHAT IT READS, and from where (P4–P7's modules, never re-derived):
//   · User.dobYear — the age check (lib/mirror/youth.ts via protocolGate.ts);
//   · the 'health_data' consent ledger — lib/health/consent.ts activeHealthDataConsent. WITHOUT a live grant this file
//     reads no intake history and no pain row: the verdict is closed ('no_health_consent') whatever they hold, so reading
//     them would be processing health data for nothing (the Dial-Up gate's rule, lib/breath/rampServer.ts);
//   · the newest intake (lib/health/intake.ts latestIntake — Today has already read it for P5's hard stop and hands it
//     in) and every intake inside the intake's own year (a re-take does not erase an earlier red flag);
//   · today's pain decision — lib/coach/warmup.ts painDecisionToday over the stored PainCheckIn decisions in P6's
//     PAIN_LOOKBACK_DAYS window (the warm-up's and the Dial-Up's read);
//   · the landing check — the athlete's newest stored Quick Screens (WorkoutScan kind 'mirror_assessment', Mirror
//     Assess's record; see protocolGate.ts THE LANDING CHECK for why this and not P4's squat/lunge, which store nothing
//     per pattern), regraded by protocolGate.ts landingCheck. Not health data (P5's scope is the intake, pain and
//     readiness), so it is read with or without the health consent;
//   · the ladder — the program coach's OWN catalogue rows, walked down regressionOfId (loadLadder);
//   · who assigned the item — coachAssignedProgram: a program whose coach is a certified facilitator other than the
//     athlete is the coach's assignment.
// Nothing here writes anything.
//
// Takes the database as an argument (the Today pattern), so the route tests run the real code over the in-memory Today
// store on a lane whose database is offline on purpose.
import type { PrismaClient } from '@/public/_prisma/client';
import { ASSESSMENT_KIND } from '../assess/prqWrite';
import { activeCoachViewConsent, activeHealthDataConsent, type ConsentRow } from '../health/consent';
import { INTAKE_REASK_DAYS, latestIntake } from '../health/intake';
import { TREE_INCLUDE } from './server';
import { PAIN_LOOKBACK_DAYS, painDecisionToday } from './warmup';
import {
  LADDER_MAX_STEPS, LANDING_SCANS_READ, coachGateView, gateAction, isProtocolGated, landingCheck, protocolReasons,
  type CoachGateView, type GateRow, type ProtocolFacts, type ProtocolIntake,
} from './protocolGate';

const DAY_MS = 86_400_000;

export type ProtocolDb = Pick<PrismaClient, 'user' | 'healthConsent' | 'healthIntake' | 'painCheckIn' | 'workoutScan'>;

/** What the caller already read, so it is not read twice (Today reads both before it gets here). */
export interface ProtocolPreRead {
  dobYear?: number | null;
  /** The newest HealthIntake row, or null for none on file. Undefined = not read yet. */
  latestIntake?: { version: string; createdAt: Date; answers: unknown; redFlags: readonly string[]; clearedAt?: Date | null } | null;
}

/** Read every fact the gate needs, for this athlete, now. */
export async function loadProtocolFacts(db: ProtocolDb, userId: string, now: Date = new Date(), pre: ProtocolPreRead = {}): Promise<ProtocolFacts> {
  const [user, consents, scans] = await Promise.all([
    pre.dobYear !== undefined ? Promise.resolve({ dobYear: pre.dobYear }) : db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
    db.healthConsent.findMany({ where: { userId, scope: 'health_data' }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
    db.workoutScan.findMany({ where: { userId, kind: ASSESSMENT_KIND }, orderBy: { createdAt: 'desc' }, take: LANDING_SCANS_READ, select: { metrics: true, createdAt: true } }),
  ]);
  const healthDataConsent = !!activeHealthDataConsent(consents as ConsentRow[]);

  let intake: ProtocolIntake | null = null;
  let intakeHistory: ProtocolFacts['intakeHistory'] = [];
  let painDecision: ProtocolFacts['painDecision'] = null;
  if (healthDataConsent) {
    const [latest, history, pain] = await Promise.all([
      pre.latestIntake !== undefined ? Promise.resolve(pre.latestIntake) : latestIntake(db, userId),
      db.healthIntake.findMany({
        where: { userId, createdAt: { gte: new Date(now.getTime() - INTAKE_REASK_DAYS * DAY_MS) } }, orderBy: { createdAt: 'desc' },
        select: { createdAt: true, redFlags: true },
      }),
      db.painCheckIn.findMany({
        where: { userId, createdAt: { gte: new Date(now.getTime() - PAIN_LOOKBACK_DAYS * DAY_MS) } }, orderBy: { createdAt: 'desc' },
        select: { exerciseName: true, bodyArea: true, decision: true, createdAt: true },
      }),
    ]);
    intake = latest ? { version: latest.version, createdAt: latest.createdAt, answers: latest.answers, redFlags: latest.redFlags, clearedAt: latest.clearedAt ?? null } : null;
    intakeHistory = history;
    painDecision = painDecisionToday(pain, now);
  }
  return { dobYear: user?.dobYear ?? null, healthDataConsent, intake, intakeHistory, painDecision, landing: landingCheck(scans, now) };
}

export type LadderDb = Pick<PrismaClient, 'programExercise'>;

/**
 * The ladders under `start`, as a map by id (the start rows included): each start row's regressionOfId chain, read level
 * by level for LADDER_MAX_STEPS levels, from `coachId`'s OWN catalogue only — a link to another coach's row, or to a
 * deleted one, is simply not in the map, so the ladder ends there (protocolGate.ts easierUngatedStep). `select` adds the
 * columns the caller renders the easier step with (Today: the catalogue's coaching columns).
 */
export async function loadLadder(db: LadderDb, coachId: string, start: readonly GateRow[], select: Record<string, boolean> = {}): Promise<Map<string, GateRow & Record<string, unknown>>> {
  const byId = new Map<string, GateRow & Record<string, unknown>>(start.map((r) => [r.id, r as GateRow & Record<string, unknown>]));
  let frontier: readonly GateRow[] = start;
  for (let level = 0; level < LADDER_MAX_STEPS && frontier.length; level++) {
    const want = [...new Set(frontier.map((r) => r.regressionOfId).filter((x): x is string => typeof x === 'string' && x.length > 0 && !byId.has(x)))];
    if (!want.length) break;
    const rows = await db.programExercise.findMany({
      where: { id: { in: want }, coachId },
      select: { ...select, id: true, coachId: true, name: true, category: true, skillLayer: true, regressionOfId: true },
    }) as unknown as (GateRow & Record<string, unknown>)[];
    for (const r of rows) byId.set(r.id, r);
    frontier = rows;
  }
  return byId;
}

/**
 * Whether a program's items are a COACH'S ASSIGNMENT (decision #6: the youth rule lifts only for what a coach assigns):
 * its coach is a certified facilitator (the only kind the builder lets write a program, builderServer.ts) and not the
 * athlete. A program with no certified coach — a self-built one, or a FEL template an athlete bought, whatever account
 * owns it — is not. assumption: every item of a coach's program is that coach's assignment, a FEL template the coach
 * applied included (the coach reviewed it and assigned it, and the builder shows them the youth override item by item).
 */
export async function coachAssignedProgram(db: Pick<PrismaClient, 'facilitatorProfile'>, p: { coachId: string; clientId: string }): Promise<boolean> {
  if (!p.coachId || p.coachId === p.clientId) return false;
  const fac = await db.facilitatorProfile.findUnique({ where: { userId: p.coachId }, select: { certificationStatus: true } });
  return fac?.certificationStatus === 'certified';
}

export type GatesDb = ProtocolDb & LadderDb & Pick<PrismaClient, 'coachingProgram' | 'facilitatorProfile'>;
export type GatesResult = { ok: true; gates: Record<string, CoachGateView> } | { ok: false; status: number; error: string };

/**
 * GET /api/coach/programs/:id/gates — for the program's COACH only: every gated item in the program, keyed by its
 * SessionExercise id, with what the client's Today does with it right now and why (protocolGate.ts coachGateView). The
 * client's health reasons are named only with the client's live 'coach_view' grant for this coach; without it, one
 * generic line says there is one (the pain flag's precedent). The client reading their own program gets 403; anyone
 * else 404 (a program id says nothing about whose it is).
 */
export async function loadProgramGates(db: GatesDb, userId: string, programId: string, now: Date = new Date()): Promise<GatesResult> {
  const row = await db.coachingProgram.findUnique({ where: { id: programId }, include: TREE_INCLUDE });
  if (!row) return { ok: false, status: 404, error: 'not_found' };
  if (row.coachId !== userId) return row.clientId === userId ? { ok: false, status: 403, error: 'forbidden' } : { ok: false, status: 404, error: 'not_found' };
  const items = row.blocks.flatMap((b) => b.sessions.flatMap((s) => s.exercises.map((e) => ({ id: e.id, row: { ...(e.exercise as Record<string, unknown>), id: e.exerciseId } as GateRow }))));
  const gated = items.filter((i) => isProtocolGated(i.row));
  if (!gated.length) return { ok: true, gates: {} };
  const [facts, coachAssigned, ladder, coachViews] = await Promise.all([
    loadProtocolFacts(db, row.clientId, now),
    coachAssignedProgram(db, row),
    loadLadder(db, row.coachId, gated.map((g) => g.row)),
    db.healthConsent.findMany({ where: { userId: row.clientId, scope: 'coach_view' }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
  ]);
  const detailed = !!activeCoachViewConsent(coachViews as ConsentRow[], userId);
  const athlete = protocolReasons(facts, now);
  const gates: Record<string, CoachGateView> = {};
  for (const g of gated) gates[g.id] = coachGateView(gateAction(g.row, athlete, ladder, { coachAssigned }), { detailed });
  return { ok: true, gates };
}
