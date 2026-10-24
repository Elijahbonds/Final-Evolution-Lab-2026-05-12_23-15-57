// The teen gate's reads (lib/coach/teenGate.ts holds the rule). Two reads, both by the athlete's own id: User.dobYear
// and their GuardianConsent rows. A verified adult stops after the first. A read that fails CLOSES the gate — a
// training write is never let through because the age could not be read.
import { NextResponse } from 'next/server';
import type { PrismaClient } from '@/lib/generated/prisma';
import { teenGate, teenGateBody, type TeenGateResult } from './teenGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export type TeenGateDb = Pick<PrismaClient, 'user' | 'guardianConsent'>;

export async function readTeenGate(db: TeenGateDb, userId: string, now: Date = new Date()): Promise<TeenGateResult> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } });
    const dobYear = user?.dobYear ?? null;
    if (verifiedAdult(dobYear, now)) return { ok: true, band: 'adult' };
    const consents = await db.guardianConsent.findMany({
      where: { menteeId: userId },
      select: { requestedAt: true, acceptedAt: true, revokedAt: true, menteeBirthYear: true },
    });
    return teenGate({ dobYear, consents }, now);
  } catch (e) {
    console.error('[coach/teen-gate] could not read the age or consent; the write is refused', e instanceof Error ? e.message : 'unknown');
    return { ok: false, error: 'age_required' };
  }
}

/** null when the athlete may write; otherwise the 403 to answer with. */
export async function teenGateRefusal(db: TeenGateDb, userId: string): Promise<NextResponse | null> {
  const g = await readTeenGate(db, userId);
  return g.ok ? null : NextResponse.json(teenGateBody(g.error), { status: 403 });
}
