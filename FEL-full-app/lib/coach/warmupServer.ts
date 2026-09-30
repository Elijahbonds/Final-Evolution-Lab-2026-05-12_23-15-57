// lib/coach/warmupServer.ts — MIRROR-COACH P6 (2026-09-29): what the warm-up needs that only the server knows.
//
// The generator (lib/coach/warmup.ts) is pure and runs on the client, because two of its inputs live there: today's
// session (already in the Today payload) and today's readiness answer, which is health-adjacent and so never goes in a
// URL or a query string. The rest is read here, for the signed-in athlete only, by GET /api/coach/me/warmup:
//   · isYouth — lib/mirror/youth.ts isMinorForMirror(User.dobYear), the one age truth (blank = youth, decision #20);
//   · the weakest Movement Screen area — the same screen the coach's draft reads (lib/coach/mirrorToProgram.ts
//     coachDraft): the newest graded screen that clears the screen bar, else the newest readable one, its camera
//     outcomes through outcomesOf, then warmup.ts weakestZone;
//   · today's pain decision — the PainCheckIn rows' stored decisions (lib/health/painRule.ts decide(), never re-decided),
//     read for the JUMP GATE whatever the consent state now is (PAIN_GATE_OUTLIVES_WITHDRAWAL below);
//   · the intake hard stop (lib/health/intake.ts isHardStopped) — Today already blocks on it; this says it again so a
//     warm-up is never offered under one.
// Nothing here writes anything: a warm-up is guidance, not a record, and never touches PRQ, pay, a score or a streak.
//
// Takes the database as an argument (the Today pattern: lib/coach/todayServer.ts), so the route test runs the real code
// over a fake client on a lane whose database is offline on purpose.
import type { PrismaClient } from '@/public/_prisma/client';
import { isMinorForMirror } from '../mirror/youth';
import { MIRROR_SCREEN_KIND } from '../mirror/screen';
import { readStoredScreen, isUngradedStoredScreen, type StoredScreen } from '../mirror/screenStore';
import { isScreenNotStation, screenCoverage } from '../mirror/screenClaims';
import { outcomesOf } from './mirrorToProgram';
import { activeHealthDataConsent, type ConsentRow } from '../health/consent';
import { isHardStopped, latestIntake } from '../health/intake';
import type { PainDecision } from '../health/painRule';
import { PAIN_LOOKBACK_DAYS, painDecisionToday, weakestZone, type WarmupContext } from './warmup';
import { ZONE_WORDS } from './warmupContent';

export type { WarmupContext } from './warmup';

export type WarmupDb = Pick<PrismaClient, 'user' | 'workoutScan' | 'healthConsent' | 'painCheckIn' | 'healthIntake'>;

/**
 * THE PAIN GATE OUTLIVES A CONSENT WITHDRAWAL — the one place this choice is made (MIRROR-COACH P6 FIX, 2026-09-29,
 * code review; owner decisions #15 "stop sooner" and #4, P6 rule (b)).
 *
 * WHAT WAS WRONG. The pain decisions were read only under a live health_data consent. So an athlete who logged a check-in
 * that stored a stop (an acute "pop") on Monday and withdrew consent in Settings on Tuesday, without erasing, got the
 * Pogo and Stick Primer and Prime the Launch back on Wednesday: withdrawing consent switched OFF a safety gate. The
 * intake's red-flag hard stop, read in the same function, never worked that way (it is read with no consent check, as
 * lib/coach/todayServer.ts loadToday reads it) — so the two health safety gates disagreed.
 *
 * THE CHOICE (the conservative one; owner's call, flagged in the P6 report). A stored step-down or stop inside
 * PAIN_LOOKBACK_DAYS keeps the jumps and the primer out whatever the consent state, the way the hard stop does. Only
 * the stored DECISION is read (never the score, the area or a note), it is used only to make the athlete's own warm-up
 * more careful, and it goes back only to the athlete it belongs to. Nothing new is collected: a withdrawal still stops
 * every new pain write (app/api/health/pain checks consent first), and Privacy §5 says a withdrawal "stops new collection
 * immediately and offers you the erase button" — it does not promise stored rows stop shaping advice. Erasing (lib/
 * prq-data-rights.ts) deletes the rows, and the gate ends with them. Set this to false to go back to consent-only.
 */
export const PAIN_GATE_OUTLIVES_WITHDRAWAL = true;

/** The newest screens read to find the newest graded one — the coach's draft reads the same number (prescribe route). */
export const SCREENS_READ = 20;

/**
 * The screen area to aim at, from an athlete's newest screens (newest first). The pick is coachDraft's: the newest
 * graded screen that clears the screen bar (not provisional), else the newest readable one. 'ungraded' when rows exist
 * but none can be read as a result; 'clear' when the picked screen flagged nothing.
 */
export function zoneFromScreens(scans: readonly { metrics: unknown; createdAt: Date | string }[]): Pick<WarmupContext, 'zone' | 'screen' | 'screenAt'> {
  if (!scans.length) return { zone: null, screen: 'none', screenAt: null };
  const read = scans.map((s) => ({ scan: s, stored: readStoredScreen(s.metrics) }));
  const provisional = (st: StoredScreen) => st.provisional === true || !isScreenNotStation(screenCoverage(st.screen, st.results));
  const graded = read.find((x) => x.stored && !provisional(x.stored)) ?? read.find((x) => x.stored);
  if (!graded) return { zone: null, screen: scans.some((s) => isUngradedStoredScreen(s.metrics)) ? 'ungraded' : 'none', screenAt: null };
  const at = new Date(graded.scan.createdAt);
  const screenAt = Number.isFinite(at.getTime()) ? at.toISOString() : null;
  const weak = weakestZone(outcomesOf(graded.stored!));
  if (!weak) return { zone: null, screen: 'clear', screenAt };
  return { zone: { id: weak.zone, words: ZONE_WORDS[weak.zone], checks: weak.checks }, screen: 'flagged', screenAt };
}

export async function loadWarmupContext(db: WarmupDb, userId: string, now: Date = new Date()): Promise<WarmupContext> {
  const [user, intake, scans, consents] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
    latestIntake(db, userId),
    db.workoutScan.findMany({ where: { userId, kind: MIRROR_SCREEN_KIND }, orderBy: { createdAt: 'desc' }, take: SCREENS_READ, select: { metrics: true, createdAt: true } }),
    db.healthConsent.findMany({ where: { userId }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
  ]);
  // No grant ever given means no pain rows (app/api/health/pain checks consent before any write). A grant WITHDRAWN
  // leaves the rows until an erase, and a stored step-down or stop still gates the jumps (PAIN_GATE_OUTLIVES_WITHDRAWAL).
  let painDecision: PainDecision | null = null;
  if (PAIN_GATE_OUTLIVES_WITHDRAWAL || activeHealthDataConsent(consents as ConsentRow[])) {
    const since = new Date(now.getTime() - PAIN_LOOKBACK_DAYS * 86_400_000);
    const rows = await db.painCheckIn.findMany({
      where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' },
      select: { exerciseName: true, bodyArea: true, decision: true, createdAt: true },
    });
    painDecision = painDecisionToday(rows, now);
  }
  return {
    // a read that found no user reads as no birth year: youth rules, the careful side (decision #20)
    isYouth: isMinorForMirror(user?.dobYear ?? null, now),
    painDecision,
    ...zoneFromScreens(scans),
    hardStopped: isHardStopped(intake),
  };
}
