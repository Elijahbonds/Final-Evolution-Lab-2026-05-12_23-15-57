export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { isMinorForMirror } from '@/lib/mirror/youth';
import {
  PUBLIC_INTAKE_QUESTIONS,
  HEALTH_DATA_CONSENT_COPY,
  RED_FLAG_COPY,
  IntakeValidationError,
  isHardStopped,
  needsIntake,
  submitIntake,
  latestIntake,
  clearIntake,
} from '@/lib/health/intake';
import { canWriteHealthData, refuseHealthWrite, HEALTH_WRITE_REFUSED } from '@/lib/privacy/healthWriteGate';

/**
 * MIRROR-COACH P5 (2026-09-29): app/api/health/intake — the pre-participation intake's own endpoint.
 *
 * The rule and the copy live in lib/health/intake.ts and lib/health/painRule.ts (PHASE-5 CONTRACT); this file is
 * deliberately thin — auth, request shape, response shape — so the actual logic stays testable against a fake
 * client (vitest does not collect app/, same as lib/prq-data-rights.ts's routes).
 *
 * GET  — what to ask (the questions + consent copy) and where this athlete stands (needs it? hard-stopped?).
 * POST — { answers, consent } submits a new intake; { action: 'clear', intakeId } self-attests a clearance.
 */

function intakeStatus(intake: Awaited<ReturnType<typeof latestIntake>>, dobYear: number | null) {
  const hardStopped = isHardStopped(intake);
  return {
    latest: intake
      ? {
          id: intake.id,
          version: intake.version,
          redFlags: intake.redFlags,
          birthYear: intake.birthYear,
          consentedAt: intake.consentedAt,
          clearedAt: intake.clearedAt,
          createdAt: intake.createdAt,
        }
      : null,
    needsIntake: needsIntake(intake, new Date()),
    hardStopped,
    redFlagCopy: hardStopped ? RED_FLAG_COPY : null,
    isMinor: isMinorForMirror(dobYear),
  };
}

/** GET /api/health/intake — the question set, the consent screen copy, and this athlete's current status. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  const [intake, user] = await Promise.all([
    latestIntake(prisma, userId),
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
  ]);

  return NextResponse.json({
    questions: PUBLIC_INTAKE_QUESTIONS,
    consent: HEALTH_DATA_CONSENT_COPY,
    ...intakeStatus(intake, user?.dobYear ?? null),
  });
}

/**
 * POST /api/health/intake
 *   { answers: Record<string, boolean|number|null>, consent: true }  — submit this year's intake.
 *   { action: 'clear', intakeId: string }                            — self-attest "I checked with a clinician."
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad('invalid_json'); }

  // TEEN-WRITE-BLOCK (2026-09-29): health data is written ONLY for a verified 18+ account — User.dobYear from the
  // database, never this request's birth_year answer, never a parent's GuardianConsent (lib/privacy/healthWriteGate.ts).
  // Everyone else gets 403 health_data_adults_only and nothing is written: no intake, no clearance, no health_data
  // grant, no dobYear. So the dobYear write inside submitIntake (it only ran for a BLANK dobYear, which is refused here
  // first) can no longer run from this route.
  if (body.action === 'clear') {
    const intakeId = String(body.intakeId ?? '');
    if (!intakeId) return bad('missing_intake_id');
    if (!(await canWriteHealthData(prisma, userId))) return refuseHealthWrite();
    try {
      const cleared = await clearIntake(prisma, { userId, intakeId });
      return NextResponse.json({ intake: { id: cleared.id, clearedAt: cleared.clearedAt } });
    } catch (err) {
      if (err instanceof IntakeValidationError) return bad(err.code, err.code === 'not_found' ? 404 : 400);
      throw err;
    }
  }

  if (!(await canWriteHealthData(prisma, userId))) return refuseHealthWrite();

  try {
    const { intake, hardStopped } = await prisma.$transaction((tx) =>
      submitIntake(tx, { userId, rawAnswers: body.answers, consent: body.consent === true, now: new Date() }),
    );
    return NextResponse.json({
      intake: {
        id: intake.id,
        version: intake.version,
        redFlags: intake.redFlags,
        birthYear: intake.birthYear,
        consentedAt: intake.consentedAt,
      },
      hardStopped,
      redFlagCopy: hardStopped ? RED_FLAG_COPY : null,
    });
  } catch (err) {
    if (err instanceof IntakeValidationError) {
      // TEEN-WRITE-BLOCK (FE PM 23:05 PT): the guardian allowance inside submitIntake is gone, and with it the 412
      // 'guardian_consent_required' this used to answer (MIRROR-COACH P5 FIX): nothing throws it any more. submitIntake's own
      // check is the DB-dobYear one (lib/health/intake.ts), which throws 'health_data_adults_only', answered as the same 403
      // as the check above. Every other validation code is a 400.
      if (err.code === HEALTH_WRITE_REFUSED.error) return refuseHealthWrite();
      return NextResponse.json({ error: err.code, details: err.details }, { status: 400 });
    }
    throw err;
  }
}
