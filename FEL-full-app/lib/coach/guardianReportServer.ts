// The guardian report's reads (coach-loop P1). Training columns only — the selects below are the whole of what is
// read, and none of them touches a health, pain, readiness, intake, scan or PRQ table.
import type { PrismaClient } from '@/public/_prisma/client';
import { guardianStatus } from '@/lib/consent/guardianGate';
import { teenGate } from './teenGate';
import { buildGuardianReport, type GuardianReport } from './guardianReport';
import { readGuardianReportToken } from './guardianLink';

type Db = Pick<PrismaClient, 'user' | 'guardianConsent' | 'coachingProgram' | 'clientSession' | 'setLog'>;

const DAY = 86_400_000;

/**
 * The consent a report goes out under: the athlete is a TEEN (13–17 by this app's year rule) and their current
 * GuardianConsent is accepted. An adult has no guardian report; an under-13 has no roster; a revoked or pending
 * consent sends nothing. Returns the consent row's id and address for the server's use only — never for a response.
 */
export async function reportConsent(db: Pick<PrismaClient, 'user' | 'guardianConsent'>, menteeId: string, now: Date = new Date()): Promise<{ consentId: string; guardianEmail: string } | null> {
  const user = await db.user.findUnique({ where: { id: menteeId }, select: { dobYear: true } });
  const consents = await db.guardianConsent.findMany({
    where: { menteeId },
    select: { id: true, guardianEmail: true, requestedAt: true, acceptedAt: true, revokedAt: true, menteeBirthYear: true },
  });
  const gate = teenGate({ dobYear: user?.dobYear ?? null, consents }, now);
  if (!gate.ok || gate.band !== 'teen' || guardianStatus(consents) !== 'accepted') return null;
  const latest = [...consents].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
  return latest ? { consentId: latest.id, guardianEmail: latest.guardianEmail } : null;
}

/** The report for one athlete, from training rows alone. */
export async function loadGuardianReport(db: Db, menteeId: string, nowMs: number = Date.now()): Promise<GuardianReport> {
  const [user, programs, done, setsLast7] = await Promise.all([
    db.user.findUnique({ where: { id: menteeId }, select: { name: true } }),
    db.coachingProgram.findMany({
      where: { clientId: menteeId },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, isActive: true, coachId: true, blocks: { select: { sessions: { select: { id: true, kind: true } } } } },
    }),
    db.clientSession.findMany({ where: { clientId: menteeId, completedAt: { not: null } }, select: { programId: true, sessionId: true, completedAt: true } }),
    db.setLog.count({ where: { exerciseLog: { clientSession: { clientId: menteeId } }, createdAt: { gte: new Date(nowMs - 7 * DAY) } } }),
  ]);
  const coaches = programs.length
    ? await db.user.findMany({ where: { id: { in: [...new Set(programs.map((p) => p.coachId))] } }, select: { name: true } })
    : [];
  return buildGuardianReport({
    athleteName: user?.name ?? null,
    coachNames: coaches.map((c) => c.name ?? '').filter(Boolean),
    programs: programs.map((p) => {
      const training = new Set(p.blocks.flatMap((b) => b.sessions).filter((s) => s.kind !== 'recovery').map((s) => s.id));
      const completed = new Set(done.filter((d) => d.programId === p.id && training.has(d.sessionId)).map((d) => d.sessionId));
      return { name: p.name, isActive: p.isActive, sessionsPlanned: training.size, sessionsDone: completed.size };
    }),
    completedAtMs: done.flatMap((d) => (d.completedAt ? [d.completedAt.getTime()] : [])),
    setsLast7,
    nowMs,
  });
}

/**
 * What /guardian/report/[token] shows. Every open re-checks that the consent the link was made for is STILL the
 * athlete's current, accepted one and the athlete is still a teen: revoke the consent (or a newer request replaces it)
 * and every link stops — the same null as a forged, edited or expired one.
 */
export async function resolveGuardianReport(db: Db, token: string, nowMs: number = Date.now()): Promise<GuardianReport | null> {
  const consentId = readGuardianReportToken(token, nowMs);
  if (!consentId) return null;
  const row = await db.guardianConsent.findUnique({ where: { id: consentId }, select: { menteeId: true } });
  if (!row) return null;
  const current = await reportConsent(db, row.menteeId, new Date(nowMs));
  if (current?.consentId !== consentId) return null;
  return loadGuardianReport(db, row.menteeId, nowMs);
}
