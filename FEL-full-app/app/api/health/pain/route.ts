export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { PainValidationError, pendingNextMorningFollowUps, submitPainCheckIn, type PainCheckInHistoryRow } from '@/lib/health/pain';
import { canUse, type GuardianConsentLike } from '@/lib/consent/guardianGate';
import { activeHealthDataConsent, type ConsentRow } from '@/lib/health/consent';

/**
 * MIRROR-COACH P5 (2026-09-29): app/api/health/pain — the per-exercise pain check-in loop's own endpoint.
 *
 * The rule, the trend/red-flag/minor assembly and the next-morning selection all live in lib/health/pain.ts and
 * lib/health/painRule.ts (PHASE-5 CONTRACT); this file is deliberately thin — auth, request shape, response shape —
 * so the logic stays testable against a fake client (vitest does not collect app/, same as app/api/health/intake).
 *
 * GET  — pending next-morning follow-ups: yesterday's (or earlier, still-open) flagged exercises this athlete has
 *        not yet been asked about today.
 * POST — { programExerciseId?, exerciseName, bodyArea, score, kind, acute?, note? } submits one check-in and
 *        returns lib/health/painRule.ts's decision in plain words, plus the named easier variation when the
 *        athlete's own coach set one up for this exercise (ProgramExercise.regressionOfId) and the decision calls
 *        for it.
 *
 * MIRROR-COACH P5 (2026-09-29), owner decision #6: guardian consent before a pain check-in, same rule and same
 * source (lib/consent/guardianGate.ts) as the Mirror's own gate (app/play/mirror/_components/guardian-consent-gate
 * .tsx) — a minor with no accepted guardian consent gets a 412 here, same status code and shape the Mirror's own
 * assessment route already uses for the same reason (app/api/mirror/assessment/route.ts). The client
 * (components/coach/pain-checkin.tsx) turns this specific code into a link to /consent/guardian rather than a
 * generic "could not save" error.
 *
 * MIRROR-COACH P5 FIX (2026-09-29, code review) — Finding "PainCheckIn health data is written with zero consent
 * enforcement": the guardian check above is the only check this route used to run. Nothing checked for an active
 * lib/health/consent.ts 'health_data' HealthConsent grant AT ALL — an adult (or anyone) who never opened the
 * Mirror's HealthIntakeGate (the only place submitIntake() currently grants that scope) could still have a
 * PainCheckIn row written the moment they touched the "Pain? (optional)" chip on their coach's Today view
 * (components/coach/pain-checkin.tsx, mounted with no consent screen of its own and no shared front door with the
 * Mirror to be gated behind). This directly contradicted lib/policies.ts's own Privacy §5 text shipped in this same
 * phase ("None of this is collected until you say yes to it, separately from creating an account") and schema
 * .prisma's own HealthConsent/PainCheckIn model comments. Checked FIRST, before the guardian check, because it is
 * the more fundamental promise and applies to every athlete, not only minors.
 */
const HISTORY_DAYS = 14;

/** GET /api/health/pain — this athlete's pending next-morning follow-ups. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const rows = await prisma.painCheckIn.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, exerciseName: true, bodyArea: true, programExerciseId: true, score: true, kind: true, decision: true, createdAt: true },
  });

  return NextResponse.json({ pendingFollowUps: pendingNextMorningFollowUps(rows as PainCheckInHistoryRow[]) });
}

/** POST /api/health/pain — submit one pain check-in. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('invalid_json');
  }

  const [user, healthConsentRows, guardianConsentRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
    prisma.healthConsent.findMany({ where: { userId, scope: 'health_data' }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
    prisma.guardianConsent.findMany({ where: { menteeId: userId }, select: { requestedAt: true, acceptedAt: true, revokedAt: true } }),
  ]);

  // Nothing is collected until this athlete has said yes to health-data collection at all (see this file's own
  // header for the Finding this closes). components/coach/pain-checkin.tsx turns this code into an inline consent
  // prompt (the same HEALTH_DATA_CONSENT_COPY the Mirror's intake shows) rather than a generic "could not save".
  if (!activeHealthDataConsent(healthConsentRows as ConsentRow[])) {
    return bad('health_data_consent_required', 412);
  }

  // Minors: no pain check-in without an accepted guardian consent (owner decision #6 — the same rule and the same
  // source lib/consent/guardianGate.ts as the Mirror's own gate). Checked here, not only in front of the Mirror
  // session, because a pain check-in is reachable from the coach's Today view (components/coach/pain-checkin.tsx),
  // an entirely different surface with no shared front door to gate it from.
  const consents: GuardianConsentLike[] = guardianConsentRows;
  if (!canUse('pain_checkin', { dobYear: user?.dobYear ?? null, consents })) {
    return bad('guardian_consent_required', 412);
  }

  try {
    const result = await prisma.$transaction((tx) => submitPainCheckIn(tx, { userId, raw: body }));

    // The easier version's NAME, resolved only from this exercise's OWN prescribing coach's catalogue (todayServer
    // .ts's same rule for the regression/progression links) — never a cross-coach leak, and only fetched at all
    // when the decision actually calls for it.
    let easierVariationName: string | null = null;
    if (result.decision === 'easier_variation' && typeof body.programExerciseId === 'string' && body.programExerciseId) {
      const pe = await prisma.programExercise.findUnique({ where: { id: body.programExerciseId }, select: { regressionOfId: true, coachId: true } });
      if (pe?.regressionOfId) {
        const easier = await prisma.programExercise.findFirst({ where: { id: pe.regressionOfId, coachId: pe.coachId }, select: { name: true } });
        easierVariationName = easier?.name ?? null;
      }
    }

    return NextResponse.json({
      checkIn: { id: result.checkIn.id, decision: result.decision, createdAt: result.checkIn.createdAt },
      decision: result.decision,
      copy: result.copy,
      stop: result.stop,
      hardStop: result.hardStop,
      easierVariationName,
    });
  } catch (err) {
    if (err instanceof PainValidationError) return NextResponse.json({ error: err.code, details: err.details }, { status: 400 });
    throw err;
  }
}
