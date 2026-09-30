// lib/privacy/scanSaveGate.ts — TEEN-WRITE-BLOCK (2026-09-29): who may have movement numbers SAVED.
//
// THE RULE (Elijah, 2026-09-29 2:40 PM PT; Cyber's PRIVACY-CORE-SCAN-GAPS.md GAP 1): a movement-data save goes through
// ONLY for an account that is VERIFIED 18+ AND HAS OPTED IN. Everyone else — unknown age, under 18, an age that can't be
// proven, or an adult who hasn't opted in — gets 403 `scan_save_adults_only` and nothing is written. A parent's
// approval (GuardianConsent) is not grounds to save anybody's numbers: this module never reads it.
//
// WHY A NEW HELPER. Three age helpers already disagree — lib/mirror/screenCorrectives.ts youthGateFor (gap > 18 is
// adult), lib/creator/cardProgression-server.ts isAdult (>= 18), lib/camp/certification.ts needsGuardianConsent (< 18 or
// unknown). They stay as they are for their own features; this one decides a SAVE, and only a save.
//
// WHERE THE AGE COMES FROM. User.dobYear, read from the DATABASE, never the session token and never a request body. Only
// the year is stored, so a year gap of exactly 18 may still be a 17-year-old: that is NOT verified 18+ (GAP 1 fix 1).
// assumption: (FE PM can loosen) the boundary is `thisYear - dobYear > 18`; loosening it to >= 18 is one line in
// ./verifiedAdult.ts.
//
// PRODUCTION-SAFE READS (AM, 19:47 PT). This module and scanSaveOptIn.ts read only columns already on production (User's),
// never a table or column that only PRIVACY-CORE or AGE-SCREEN adds — a deploy that ran before their pending SQL would
// 500. And they NEVER throw: every read is wrapped, any error answers false (fail closed) and logs one line with a fixed
// event name and the error's name/code — never the user id, an email, the birth year or an age.
//
// No import from lib/coach, lib/mirror, lib/camp or lib/move (held by other lanes).
import { NextResponse } from 'next/server';
import type { Prisma } from '@/public/_prisma/client';
import { scanSaveOptIn } from './scanSaveOptIn';
import { verifiedAdult } from './verifiedAdult';

// The age rule itself lives in ./verifiedAdult (pure, import-free, so client-imported modules can share it).
export { verifiedAdult };

/** The one read this module makes: User.dobYear. Structural, so a route's `prisma` and a transaction client both fit. */
export type GateDb = Pick<Prisma.TransactionClient, 'user'>;

/** A name or code safe to log: short, plain characters only, so nothing a caller put in a message can ride along. */
function loggable(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? v : fallback;
}

/** One line, no PII: the event, and for a thrown error its class name and its code (a Prisma P-code) when it has one. */
export function logGateFailure(event: string, e?: unknown): void {
  if (e === undefined) {
    console.warn(`[privacy] ${event}`);
    return;
  }
  const err = (e && typeof e === 'object' ? e : {}) as { name?: unknown; code?: unknown };
  const code = loggable(err.code, '');
  console.warn(`[privacy] ${event} ${loggable(err.name, typeof e)}${code ? ` ${code}` : ''}`);
}

/**
 * User.dobYear from the database, or null. Never throws: a failed read logs `<prefix>_read_failed`, a missing row logs
 * `<prefix>_no_user_row`, and both answer null (an unknown age, which no gate treats as an adult).
 */
export async function readDobYear(db: GateDb, userId: string, prefix: string): Promise<number | null> {
  if (typeof userId !== 'string' || !userId) {
    logGateFailure(`${prefix}_no_user_id`);
    return null;
  }
  let row: { dobYear: number | null } | null;
  try {
    row = await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } });
  } catch (e) {
    logGateFailure(`${prefix}_read_failed`, e);
    return null;
  }
  if (!row) {
    logGateFailure(`${prefix}_no_user_row`);
    return null;
  }
  return typeof row.dobYear === 'number' ? row.dobYear : null;
}

/**
 * May this account's movement numbers be saved? Verified 18+ (DB dobYear) AND opted in. Short-circuits: the opt-in is
 * not read when the age fails. Resolves false — never rejects — on a missing row, a failed read, or an opt-in reader
 * that rejects or answers anything but `true`.
 */
export async function canSaveScanNumbers(db: GateDb, userId: string): Promise<boolean> {
  const dobYear = await readDobYear(db, userId, 'scan_save_gate');
  if (!verifiedAdult(dobYear)) return false;
  let optedIn: unknown;
  try {
    optedIn = await scanSaveOptIn(db, userId);
  } catch (e) {
    logGateFailure('scan_save_opt_in_read_failed', e);
    return false;
  }
  if (typeof optedIn !== 'boolean') {
    logGateFailure('scan_save_opt_in_not_boolean');
    return false;
  }
  return optedIn;
}

/** The answer every refused movement save gets. */
export const SCAN_SAVE_REFUSED = { error: 'scan_save_adults_only', saved: false } as const;

/** 403 with SCAN_SAVE_REFUSED. Nothing was written. */
export function refuseScanSave(): NextResponse {
  return NextResponse.json({ ...SCAN_SAVE_REFUSED }, { status: 403 });
}

export type ScanSaveRouteId = '1a' | '1b' | '1c' | '1d' | '1e' | '1f' | '1g' | '1h';

export interface ScanSaveRoute {
  id: ScanSaveRouteId;
  /** The route file, from the app root. */
  file: string;
  handler: string;
  /** What it writes that is movement data. */
  writes: string;
  /** gated: canSaveScanNumbers runs in the file today. routed: the diff waits for its holder (~/Claude/outbox/teen-write-block-routed.md). */
  status: 'gated' | 'routed';
  /** Who holds the file, when it is routed. */
  holder: string | null;
  /** Library files the route writes THROUGH (they carry no gate of their own; the route's check covers them). */
  via?: readonly string[];
}

/** GAP 1's table, as data (lib/privacy/scan-save-coverage.test.ts holds every movement write site to it). */
// Every row is gated (TEEN-WRITE-BLOCK-2, FE PM 23:05 PT: 1a, 1b, 1d, 1e, 1f and 1g joined 1c and 1h, the held test files
// given their opt-in fixture in the same commit). 1g gates only the prq snapshot; 1f only the form write.
export const SCAN_SAVE_ROUTES: readonly ScanSaveRoute[] = [
  { id: '1a', file: 'app/api/mirror/screen/route.ts', handler: 'POST, PATCH', writes: 'WorkoutScan kind mirror_screen (create; the answers update)', status: 'gated', holder: null },
  { id: '1b', file: 'app/api/mirror/sessions/route.ts', handler: 'POST', writes: 'MirrorSession', status: 'gated', holder: null },
  { id: '1c', file: 'app/api/mirror/dunks/route.ts', handler: 'POST', writes: 'WorkoutScan kind dunk', status: 'gated', holder: null },
  { id: '1d', file: 'app/api/mirror/assessment/route.ts', handler: 'POST', writes: 'WorkoutScan kind assessment, PrqEntry source camera (its parent-email branch is removed)', status: 'gated', holder: null },
  { id: '1e', file: 'app/api/v1/workout/scan/route.ts', handler: 'POST', writes: 'WorkoutScan (movement_screen and the other SCAN_ROUTE_KINDS)', status: 'gated', holder: null },
  { id: '1f', file: 'app/api/sessions/route.ts', handler: 'POST (body.form)', writes: 'WorkoutScan.createMany + PrqEntry source camera via writeFormPlan', status: 'gated', holder: null, via: ['lib/move/formWrite.ts'] },
  { id: '1g', file: 'app/api/v1/creator/athlete/route.ts', handler: 'POST', writes: 'AthleteBuild.prq snapshot (the build and the look still save)', status: 'gated', holder: null },
  { id: '1h', file: 'app/api/v1/camp/sessions/route.ts', handler: 'POST', writes: "CampSession prqDelta + movementDelta (the mentee's numbers; the facilitator's record still saves)", status: 'gated', holder: null },
];
