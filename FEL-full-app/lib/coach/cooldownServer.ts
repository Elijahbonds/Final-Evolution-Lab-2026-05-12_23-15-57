// POST /api/coach/me/cooldown's server half — the automatic cool-down's "done" tap (MIRROR-COACH P6, 2026-09-29).
//
// Today adds a 3–5 minute cool-down after the last item when the coach wrote none (lib/coach/cooldown.ts). Its "done"
// tap lands here and stamps ClientSession.cooldownDoneAt on the coached session it belongs to, so P9's PRQ recovery can
// count completed cool-downs (owner decision #12: from completed cool-downs, off days and easy-cardio minutes). Nothing
// here scores, pays, ranks or keeps a streak.
//
// It takes the database as an argument, like lib/coach/todayServer.ts, so lib/coach/cooldown-route.test.ts runs the
// real route over the in-memory store (lib/coach/todayMemoryDb.ts) on a lane whose database is offline on purpose.
//
// The gates, in the order they run — the same ones the session log runs (todayServer.ts saveClientLog), because a
// cool-down is part of the session:
//   · the intake's red-flag hard stop (lib/health/intake.ts; P5's review found a route that skipped a gate like this —
//     this one reads it FIRST, before anything else);
//   · the program is the caller's and active; the session is in it;
//   · the session is one Today would put the automatic cool-down on (cooldown.ts needsAutoCooldown): not an off day,
//     not a session whose coach wrote a Cool-down section (that one is logged like any exercise), not an empty one.
//     So a cooldownDoneAt only ever means "finished the cool-down Today added", and P9 never counts one twice.
// Which row it stamps is cooldown.ts cooldownTarget (open session, else the one just completed, else a new open one —
// never a new row on a session completed longer ago than the tap window: 409 cooldown_window_passed). A second tap
// keeps the first time. P9 counts a stamp only on a COMPLETED session (lib/coach/offDay.ts COOLDOWN_DONE_WHERE).
import type { PrismaClient } from '@/public/_prisma/client';
import { isHardStopped, latestIntake } from '../health/intake';
import { cooldownTarget, needsAutoCooldown } from './cooldown';

export type CooldownDb = Pick<PrismaClient, 'coachingProgram' | 'session' | 'clientSession' | 'healthIntake'>;

export type CooldownResult =
  | { ok: true; clientSessionId: string; cooldownDoneAt: string; already: boolean }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): CooldownResult => ({ ok: false, status, error });

/** POST /api/coach/me/cooldown { programId, sessionId } — the client finished Today's automatic cool-down. */
export async function recordCooldown(db: CooldownDb, userId: string, body: Record<string, unknown>, now: Date = new Date()): Promise<CooldownResult> {
  if (isHardStopped(await latestIntake(db, userId))) return fail(403, 'health_hard_stopped');

  const programId = String(body.programId ?? ''), sessionId = String(body.sessionId ?? '');
  const program = await db.coachingProgram.findUnique({ where: { id: programId }, select: { id: true, clientId: true, isActive: true } });
  if (!program || program.clientId !== userId) return fail(403, 'forbidden');
  if (!program.isActive) return fail(409, 'program_inactive');
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { block: { select: { programId: true } }, exercises: { select: { id: true, section: true } } },
  });
  if (!session || session.block.programId !== programId) return fail(404, 'session_not_found');
  if (session.kind === 'recovery') return fail(409, 'recovery_session');
  if (!session.exercises.length) return fail(409, 'empty_session');
  if (!needsAutoCooldown(session.exercises, session.kind)) return fail(409, 'coach_cooldown');

  const rows = await db.clientSession.findMany({
    where: { programId, sessionId, clientId: userId }, orderBy: { createdAt: 'desc' }, take: 10,
    select: { id: true, completedAt: true, cooldownDoneAt: true, createdAt: true },
  });
  const target = cooldownTarget(rows, now);
  // MIRROR-COACH P6 FIX (2026-09-29): a late tap on a session completed long ago no longer opens a second row on it
  if (target.action === 'late') return fail(409, 'cooldown_window_passed');
  if (target.action === 'already') return { ok: true, clientSessionId: target.id, cooldownDoneAt: target.at.toISOString(), already: true };
  const row = target.action === 'mark'
    ? await db.clientSession.update({ where: { id: target.id }, data: { cooldownDoneAt: now } })
    : await db.clientSession.create({ data: { programId, sessionId, clientId: userId, cooldownDoneAt: now } });
  return { ok: true, clientSessionId: row.id, cooldownDoneAt: now.toISOString(), already: false };
}
