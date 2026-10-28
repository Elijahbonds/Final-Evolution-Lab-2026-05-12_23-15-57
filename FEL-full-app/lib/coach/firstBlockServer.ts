// lib/coach/firstBlockServer.ts — COACH-DELIVERY COA-02 (2026-10-27): the first-block draft's reads, and its one-step undo.
//
//   firstBlockDraft  GET  /api/coach/first-block?programId=…&daysPerWeek=&equipment=&goal=   the draft (weeklyDraft/firstBlock.ts)
//   undoFirstBlock   POST /api/coach/first-block { action: 'undo', programId, weeks, sessionsPerWeek }
// APPLYING is the builder's own 'import_program' action (POST /api/coach/programs/:id/exercises), with the lines the coach
// left ticked: one nested write into a BLANK program, under every builder rule (lib/coach/import/apply.ts).
//
// GATES (the prescribe route's and the drafts lane's): the program's own certified coach; a LIVE roster link to the athlete
// (a program row alone is not consent); the teen gate (lib/coach/teenGateServer.ts: coached training — every teen fails
// closed today); the program still blank. The intake read is the goal the coach set with them (GoalPlan.goalText) and the
// coach's own answers in the form — never the health intake. The Mirror screen is read exactly as the prescribe route
// reads it (newest graded screen, the coach's own catalogue).
import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';
import { coachDraft, type CatalogueExercise } from './mirrorToProgram';
import { programSchedule } from './programs';
import { TREE_INCLUDE } from './server';
import { youthRules } from './taxonomy';
import { programIsBlank } from './templates';
import { readTeenGate } from './teenGateServer';
import { teenGateBody } from './teenGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { cleanAnswers, draftFirstBlock, wordFirstBlock } from './weeklyDraft/firstBlock';
import type { AiCaller } from './weeklyDraft/ai';

export type FirstBlockDb = Pick<PrismaClient, 'coachingProgram' | 'coachClient' | 'facilitatorProfile' | 'user' | 'guardianConsent' | 'clientSession' | 'workoutScan' | 'programExercise' | 'goalPlan'>;
export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });

const SCREENS_READ = 20;

async function ownProgram(db: FirstBlockDb, coachId: string, programId: unknown) {
  if (typeof programId !== 'string' || !programId || programId.length > 64) return { error: res(400, { error: 'bad_program' }) };
  const p = await db.coachingProgram.findUnique({ where: { id: programId }, include: TREE_INCLUDE }) as unknown as { id: string; coachId: string; clientId: string; blocks: { id: string; targetDate: Date | null; sessions: { id: string; exercises: unknown[] }[] }[] } | null;
  if (!p) return { error: res(404, { error: 'not_found' }) };
  if (p.coachId !== coachId) return { error: res(403, { error: 'forbidden' }) };
  const fac = await db.facilitatorProfile.findUnique({ where: { userId: coachId }, select: { certificationStatus: true } });
  if (fac?.certificationStatus !== 'certified') return { error: res(403, { error: 'facilitator_not_certified' }) };
  const opened = await db.clientSession.findMany({ where: { programId: p.id }, select: { id: true }, take: 1 });
  return { p, blank: programIsBlank(p.blocks, opened.length) };
}

export async function firstBlockDraft(db: FirstBlockDb, coachId: string, q: Record<string, unknown>, ai: AiCaller | null = null, now: Date = new Date()): Promise<Res> {
  const o = await ownProgram(db, coachId, q.programId);
  if ('error' in o) return o.error!;
  const { p, blank } = o;
  if (!blank) return res(409, { error: 'program_not_empty' });
  const link = await db.coachClient.findFirst({ where: { coachId, clientId: p.clientId, endedAt: null }, select: { id: true } });
  if (!link) return res(403, { error: 'not_your_client' });
  const gate = await readTeenGate(db, p.clientId, now);
  if (!gate.ok) return res(403, teenGateBody(gate.error));
  const client = await db.user.findUnique({ where: { id: p.clientId }, select: { dobYear: true } });
  const dobYear = client?.dobYear ?? null;
  const plan = await db.goalPlan.findFirst({ where: { programId: p.id }, select: { goalText: true } }).catch(() => null);
  const answers = cleanAnswers({ goal: plan?.goalText, ...q }, p.blocks[0]?.sessions.length ?? 3);
  const scans = await db.workoutScan.findMany({ where: { userId: p.clientId, kind: MIRROR_SCREEN_KIND }, orderBy: { createdAt: 'desc' }, take: SCREENS_READ, select: { metrics: true, createdAt: true } });
  const catalogue = await db.programExercise.findMany({ where: { coachId }, select: { id: true, name: true, category: true, pattern: true, skillLayer: true, defaultTempo: true } }) as CatalogueExercise[];
  const screen = coachDraft(scans, catalogue, { youth: youthGateFor(dobYear, now), answersShared: false });
  const youth = youthRules(dobYear);
  const draft = await wordFirstBlock(draftFirstBlock({ answers, youth, prescriptions: screen.prescriptions, catalogue }), ai, verifiedAdult(dobYear, now));
  return res(200, { ok: true, answers, draft, before: { weeks: p.blocks.length, sessionsPerWeek: p.blocks[0]?.sessions.length ?? 3 } });
}

/**
 * One step back: the program returns to blank weeks (the shape it had before the draft was applied, which the page kept),
 * while nothing has been opened or logged on it. Any coach-written week is gone with it — the same as clearing every row.
 */
export async function undoFirstBlock(db: FirstBlockDb, coachId: string, body: Record<string, unknown>): Promise<Res> {
  const o = await ownProgram(db, coachId, body.programId);
  if ('error' in o) return o.error!;
  const opened = await db.clientSession.findMany({ where: { programId: o.p.id }, select: { id: true }, take: 1 });
  if (opened.length > 0) return res(409, { error: 'program_started', message: 'They have started this program, so it cannot be undone. Edit it in the builder instead.' });
  const weeks = Math.min(12, Math.max(1, Math.round(Number(body.weeks) || o.p.blocks.length || 4)));
  const perWeek = Math.min(7, Math.max(1, Math.round(Number(body.sessionsPerWeek) || 3)));
  await db.coachingProgram.update({
    where: { id: o.p.id },
    data: {
      durationWeeks: weeks,
      blocks: {
        deleteMany: { id: { in: o.p.blocks.map((b) => b.id) } },
        create: programSchedule(weeks, perWeek).map((b) => ({ order: b.order, label: b.label, sessions: { create: b.sessions.map((s) => ({ order: s.order, label: s.label })) } })),
      },
    },
    select: { id: true },
  });
  return res(200, { ok: true, weeks, sessionsPerWeek: perWeek });
}
