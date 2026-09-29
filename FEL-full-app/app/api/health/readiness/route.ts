export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { canUse, type GuardianConsentLike } from '@/lib/consent/guardianGate';
import { activeHealthDataConsent, type ConsentRow } from '@/lib/health/consent';
import {
  READINESS_GUARDIAN_FEATURE, ReadinessValidationError, isEmptyCheckIn, isPlausibleToday, parseReadinessAnswers, readReadiness,
} from '@/lib/health/readiness';

/**
 * MIRROR-COACH P6 (2026-09-29): app/api/health/readiness — the unscored daily readiness check-in's own endpoint.
 *
 * The read, the validation, the day rule and the guardian feature all live in lib/health/readiness.ts; this file is
 * auth, request shape, the consent checks and the one table (schema.prisma ReadinessCheckIn). Thin on purpose, same
 * as app/api/health/pain, so lib/health/readiness-route.test.ts can run it for real over a fake client (vitest does
 * not collect app/).
 *
 * GET  ?date=YYYY-MM-DD — today's check-in (if any) and its read. With no live health_data consent the answer is
 *      "nothing stored, usual warm-up" even if an older row exists: FEL does not keep processing health data after
 *      consent is withdrawn (Privacy §5: withdrawing "stops new collection immediately"), and shaping a warm-up from
 *      it is processing. The row itself is still the athlete's to export or erase.
 * POST { date, sleep?, soreness?, energy?, mood? } — one check-in per athlete per day, editable that day: an upsert on
 *      (userId, date). All four blank = a skip: nothing is stored, and a row already saved for that day is removed
 *      (clearing your own answers needs no consent — it is an erase, not a collection).
 *
 * THE CONSENT ORDER is P5's, for P5's reason (app/api/health/pain/route.ts's header — its review found a health
 * write with NO consent check at all): the 'health_data' grant is checked FIRST, server-side, before anything is
 * written, then the guardian gate for a minor or a blank birth year. Both answer 412 with the same codes the pain
 * route uses, so components/coach/readiness-checkin.tsx reuses the pain chip's inline consent and guardian notices.
 *
 * NEVER SCORED (owner decision #12). Nothing here writes PRQ, a wallet row, a GameSession, a streak or an analytics
 * event, and the response carries nothing a scoring path could pick up; lib/health/readiness-never-scored.test.ts
 * holds that from the other side (nothing that scores or pays reads this table).
 */

const SELECT = { date: true, sleep: true, soreness: true, energy: true, mood: true, createdAt: true, updatedAt: true } as const;

async function gate(userId: string) {
  const [user, healthConsentRows, guardianConsentRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
    prisma.healthConsent.findMany({ where: { userId, scope: 'health_data' }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
    prisma.guardianConsent.findMany({ where: { menteeId: userId }, select: { requestedAt: true, acceptedAt: true, revokedAt: true } }),
  ]);
  const healthData = !!activeHealthDataConsent(healthConsentRows as ConsentRow[]);
  const consents: GuardianConsentLike[] = guardianConsentRows;
  const guardianOk = canUse(READINESS_GUARDIAN_FEATURE, { dobYear: user?.dobYear ?? null, consents });
  return { healthData, guardianOk };
}

/** GET /api/health/readiness?date=YYYY-MM-DD — today's check-in and its read. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  const date = req.nextUrl.searchParams.get('date');
  if (!isPlausibleToday(date)) return bad('not_today');

  const { healthData, guardianOk } = await gate(userId);
  const row = healthData && guardianOk
    ? await prisma.readinessCheckIn.findUnique({ where: { userId_date: { userId, date } }, select: SELECT })
    : null;

  return NextResponse.json({ date, checkIn: row, read: readReadiness(row), healthDataConsent: healthData, guardianOk });
}

/** POST /api/health/readiness — save (or edit, or clear) today's check-in. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('invalid_json');
  }

  // "Editable that day": a day that is no longer today anywhere on Earth cannot be written (lib/health/readiness.ts
  // isPlausibleToday). Checked before the answers, so an old day is refused whatever it carries.
  const date = body?.date;
  if (!isPlausibleToday(date)) return bad('not_today');

  let answers;
  try {
    answers = parseReadinessAnswers(body);
  } catch (err) {
    if (err instanceof ReadinessValidationError) return NextResponse.json({ error: err.code, details: err.details }, { status: 400 });
    throw err;
  }

  // A skip is never stored; clearing a saved day is an erase of the athlete's own row, allowed with or without consent.
  if (isEmptyCheckIn(answers)) {
    await prisma.readinessCheckIn.deleteMany({ where: { userId, date } });
    return NextResponse.json({ date, checkIn: null, read: readReadiness(null) });
  }

  const { healthData, guardianOk } = await gate(userId);
  if (!healthData) return bad('health_data_consent_required', 412);
  if (!guardianOk) return bad('guardian_consent_required', 412);

  const checkIn = await prisma.readinessCheckIn.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...answers },
    update: { ...answers },
    select: SELECT,
  });

  return NextResponse.json({ date, checkIn, read: readReadiness(checkIn) });
}
