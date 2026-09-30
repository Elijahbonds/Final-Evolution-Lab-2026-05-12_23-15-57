// lib/privacy/healthWriteGate.ts — TEEN-WRITE-BLOCK (2026-09-29): who may have health data WRITTEN.
//
// THE RULE (Elijah, 2026-09-29 2:40 PM PT; FE PM 19:19 PT): health and movement data save ONLY for a verified adult.
// Unknown age is NOT an adult. The guardian/parent-consent path is gone: an accepted GuardianConsent never unlocks a
// health write. This covers the intake (submit and clear), the pain check-in, readiness, and the health_data and
// coach_view consent grants. Revoke, erase and the readiness clear stay open to everyone — taking your own data back
// needs no age — and every GET is a read, outside this rule.
//
// THE SAME AGE RULE AS A MOVEMENT SAVE, WITHOUT THE OPT-IN. canSaveScanNumbers also needs lib/privacy/scanSaveOptIn.ts,
// which is false for everyone until PRIVACY-CORE/AB-04 adds the opt-in, so reusing it here would refuse every adult too.
// A health write already needs its own consent (the 'health_data' grant, checked by each route after this).
//
// The age is User.dobYear read from the DATABASE: never the session token, never the request body (so never the intake's
// own birth_year answer), never GuardianConsent. Same production-safe reads (User only) and never-throw rule as
// lib/privacy/scanSaveGate.ts: a missing row or a failed read answers false and logs one line with no PII.
import { NextResponse } from 'next/server';
import { readDobYear, verifiedAdult, type GateDb } from './scanSaveGate';

/** May this account write health data? Verified 18+ from the DB's User.dobYear. Resolves false, never rejects. */
export async function canWriteHealthData(db: GateDb, userId: string): Promise<boolean> {
  return verifiedAdult(await readDobYear(db, userId, 'health_write_gate'));
}

/** The answer every refused health write gets. */
export const HEALTH_WRITE_REFUSED = { error: 'health_data_adults_only', saved: false } as const;

/** 403 with HEALTH_WRITE_REFUSED. Nothing was written. */
export function refuseHealthWrite(): NextResponse {
  return NextResponse.json({ ...HEALTH_WRITE_REFUSED }, { status: 403 });
}

export type HealthWriteRouteId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export interface HealthWriteRoute {
  id: HealthWriteRouteId;
  file: string;
  handler: string;
  writes: string;
  /** gated: the check runs in the file today. routed: the diff waits for its holder (~/Claude/outbox/teen-write-block-routed.md, R-HEALTH). */
  status: 'gated' | 'routed';
  holder: string | null;
}

/**
 * The health writes (FE PM 19:19 PT, H2 a–f), as data. d and e are routed: app/api/health/consent/route.ts is changed by
 * open PR #47 (lane/mirror-coach, MIRROR-COACH P7). a's route-level check is here; the guardian allowance inside
 * lib/health/intake.ts submitIntake (also changed by PR #47) is routed with it, and can no longer unlock anyone this
 * check refused.
 */
export const HEALTH_WRITE_ROUTES: readonly HealthWriteRoute[] = [
  { id: 'a', file: 'app/api/health/intake/route.ts', handler: 'POST (submit)', writes: 'HealthIntake, the health_data grant, User.dobYear when blank', status: 'gated', holder: null },
  { id: 'b', file: 'app/api/health/pain/route.ts', handler: 'POST', writes: 'PainCheckIn', status: 'gated', holder: null },
  { id: 'c', file: 'app/api/health/readiness/route.ts', handler: 'POST (not the clear)', writes: 'ReadinessCheckIn upsert', status: 'gated', holder: null },
  { id: 'd', file: 'app/api/health/consent/route.ts', handler: "POST action 'grant' scope health_data", writes: 'HealthConsent health_data', status: 'routed', holder: 'mirror-coach (open PR #47, lane/mirror-coach, changes this file)' },
  { id: 'e', file: 'app/api/health/consent/route.ts', handler: "POST action 'grant' scope coach_view", writes: 'HealthConsent coach_view', status: 'routed', holder: 'mirror-coach (open PR #47, lane/mirror-coach, changes this file)' },
  { id: 'f', file: 'app/api/health/intake/route.ts', handler: "POST action 'clear'", writes: 'HealthIntake.clearedAt', status: 'gated', holder: null },
];
