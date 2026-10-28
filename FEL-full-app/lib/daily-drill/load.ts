// DAILY-DRILL — today's drill for one account: the reads, in one parallel batch, and the view the card and page draw.
//
// The reads are profile v2's tables under profile v2's gates (lib/profile-v2/gate.ts, inside the query): a minor's or a
// non-opted-in adult's rows are never fetched. The window ends at the start of TODAY (America/Los_Angeles, the wallet's
// daily day: lib/wallet/dailyKey.ts), so a reading taken today never changes today's drill. The drills page's own
// context (lib/coach/warmupServer.ts loadWarmupContext → lib/drills/access.ts) decides what may run; a read that fails is
// the careful context, as on the drills page. Every read fails soft: the card never breaks /train.
import type { Prisma } from '@/lib/generated/prisma';
import { profileGates, scanSaveUserWhere } from '@/lib/profile-v2/gate';
import { JUMP_SCAN_KINDS } from '@/lib/profile-v2/load';
import { ptDayBounds } from '@/lib/wallet/dailyKey';
import { DEFAULT_REWARD_RULES, REASON, computeGrant } from '@/lib/wallet/reward-rules';
import { resolveRule } from '@/lib/wallet/wallet-service';
import { streakStep } from '@/lib/session-payout';
import { drillsAccess } from '@/lib/drills/access';
import { FALLBACK_WARMUP_CONTEXT, type WarmupContext } from '@/lib/coach/warmup';
import { DAY_MS } from '@/lib/profile-v2/week';
import { pickFocus, planFor, type DailyPlan, type Focus } from './plan';
import { SHOT_SCAN_KIND, SKILL_WINDOW_DAYS, skillsFrom, type SkillReading, type SkillRows } from './skills';
import { measureNudge, whyLine, type Nudge } from './copy';
import { specMinutes } from './compose';
import { tomorrowLine, whyToday } from './guide';

/** The ledger key that is the day's claim: one per player per PT day (claim.ts writes it; nothing else may). */
export const dailyDrillKey = (userId: string, day: string): string => `daily_drill:${day}:${userId}`;

/** Rows a read takes at most (a pick needs a month of readings, not an archive). */
export const DRILL_READ_CAP = { scans: 300, shots: 400, mirror: 300, prq: 200 } as const;

/** Structural, so a test's fake fits. Only the calls this file makes. */
export interface DailyDrillDb {
  user: { findUnique(a: unknown): Promise<any> };
  scanSaveOptIn: { findUnique(a: unknown): Promise<any> };
  workoutScan: { findMany(a: unknown): Promise<any[]> };
  mirrorSession: { findMany(a: unknown): Promise<any[]> };
  prqEntry: { findMany(a: unknown): Promise<any[]> };
  playerProfile: { findUnique(a: unknown): Promise<any> };
  walletLedgerEntry: { findUnique(a: unknown): Promise<any>; count?(a: unknown): Promise<number> };
  rewardRule?: { findUnique(a: unknown): Promise<any> };
}

export interface DrillRows extends SkillRows {
  user: { dobYear: number | null } | null;
  optIn: { scope: string; granted: boolean; revokedAt: Date | null } | null;
  profile: { streakDays: number; lastStreakAt: Date | null; lastActiveAt: Date | null } | null;
  /** Today's claim, when there is one (WalletLedgerEntry under dailyDrillKey). */
  claim: { delta: unknown; metadata: unknown } | null;
  /** The live amount (the RewardRule row, else the default). */
  credit: number;
  /** TODAY-DRILL: days in the NEWCOMER_DAYS before today with the day's drill done (a count over the claims' own keys);
   *  null when it was not read or the read failed (the page then treats the account as a returning one). */
  recentDrills?: number | null;
}

/** TODAY-DRILL: no drill finished in this many days before today = a first-timer (or back after a long break), who
 *  gets the two-line explainer and the full instructions open. assumption: four weeks away is "new again". */
export const NEWCOMER_DAYS = 28;

const soft = <T>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

/** What finishing pays: the wallet's own rule (resolveRule: the live RewardRule row, else the shipped default). */
export async function drillCredit(db: unknown): Promise<number> {
  const rule = await soft(resolveRule(db as never, REASON.DAILY_DRILL_COMPLETE), DEFAULT_REWARD_RULES[REASON.DAILY_DRILL_COMPLETE]);
  return rule && rule.active && rule.currency === 'lc' ? computeGrant(rule, {}) : 0;
}

/** The reads, all started at once. Exported for the query-count test. */
export async function readDrillRows(db: DailyDrillDb, userId: string, now: Date): Promise<DrillRows> {
  const { day, start } = ptDayBounds(now);
  const window = { gte: new Date(start.getTime() - SKILL_WINDOW_DAYS * DAY_MS), lt: start };
  const canSave = scanSaveUserWhere(now);
  // typed against the generated client, so a gate Prisma would reject fails tsc rather than production
  const jumpWhere: Prisma.WorkoutScanWhereInput = { userId, kind: { in: [...JUMP_SCAN_KINDS] }, createdAt: window, user: { is: canSave } };
  const shotWhere: Prisma.WorkoutScanWhereInput = { userId, kind: SHOT_SCAN_KIND, createdAt: window, user: { is: canSave } };
  const mirrorWhere: Prisma.MirrorSessionWhereInput = { userId, patternId: { in: ['squat', 'lunge'] }, createdAt: window, user: { is: canSave } };
  const prqWhere: Prisma.PrqEntryWhereInput = { userId, unit: 'score', attribute: { in: ['power', 'flexibility'] }, measuredAt: window };

  // TODAY-DRILL: the days before today, by the claims' own unique keys (an index lookup, no amounts read)
  const recentKeys = lastPtDays(now, NEWCOMER_DAYS + 1).slice(1).map((d) => dailyDrillKey(userId, d));
  const countRecent = db.walletLedgerEntry.count
    ? soft(db.walletLedgerEntry.count({ where: { idempotencyKey: { in: recentKeys } } }).then((n) => (Number.isFinite(Number(n)) ? Number(n) : null)), null)
    : Promise.resolve(null);
  const [user, optIn, jumpScans, shotScans, mirrorSessions, prqEntries, profile, claim, credit, recentDrills] = await Promise.all([
    soft(db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }), null),
    soft(db.scanSaveOptIn.findUnique({ where: { userId }, select: { scope: true, granted: true, revokedAt: true } }), null),
    soft(db.workoutScan.findMany({ where: jumpWhere, orderBy: { createdAt: 'desc' }, take: DRILL_READ_CAP.scans, select: { kind: true, metrics: true, createdAt: true } }), []),
    soft(db.workoutScan.findMany({ where: shotWhere, orderBy: { createdAt: 'desc' }, take: DRILL_READ_CAP.shots, select: { metrics: true, createdAt: true } }), []),
    soft(db.mirrorSession.findMany({ where: mirrorWhere, orderBy: { createdAt: 'desc' }, take: DRILL_READ_CAP.mirror, select: { patternId: true, reps: true, faultCounts: true, createdAt: true } }), []),
    soft(db.prqEntry.findMany({ where: prqWhere, orderBy: { measuredAt: 'desc' }, take: DRILL_READ_CAP.prq, select: { attribute: true, value: true, unit: true, source: true, measuredAt: true } }), []),
    soft(db.playerProfile.findUnique({ where: { userId }, select: { streakDays: true, lastStreakAt: true, lastActiveAt: true } }), null),
    soft(db.walletLedgerEntry.findUnique({ where: { idempotencyKey: dailyDrillKey(userId, day) }, select: { delta: true, metadata: true } }), null),
    drillCredit(db),
    countRecent,
  ]);
  // a read that answered something other than rows (a stand-in, a half-applied table) is no rows
  const list = <T>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x : []);
  return {
    user, optIn, jumpScans: list(jumpScans), shotScans: list(shotScans), mirrorSessions: list(mirrorSessions), prqEntries: list(prqEntries),
    profile, claim, credit, recentDrills,
  };
}

export interface DailyDrillView {
  /** The PT day it is for (YYYY-MM-DD). */
  day: string;
  focus: Focus;
  skill: SkillReading | null;
  why: string;
  /** null when nothing may run today (a standing red flag): the card and page say so. */
  plan: (DailyPlan & { minutes: number }) | null;
  nudge: Nudge | null;
  /** What finishing pays (the drill's own credit; a streak day's LC rides on top when it opens the day). */
  credit: number;
  /** Today's claim, once made. */
  done: { amount: number; streakDays: number | null } | null;
  streak: { days: number; opensToday: boolean; nextDays: number };
  /** TODAY-DRILL: no drill done in the NEWCOMER_DAYS before today (and none today): the first-time explainer shows. */
  newcomer: boolean;
  /** TODAY-DRILL: why today, said plainly from the number it was picked from (guide.ts whyToday). */
  whyToday: string;
  /** TODAY-DRILL: tomorrow's likely focus and drill: the same pick over the same readings with tomorrow's date (a
   *  reading taken today can still change it, and the line says "likely"). Nothing new is read or kept. */
  tomorrow: { focus: Focus; drillId: string | null; line: string };
}

/** The view from the rows and today's access. Pure (exported for the tests). */
export function viewFrom(userId: string, rows: DrillRows, access: ReturnType<typeof drillsAccess>, now: Date): DailyDrillView {
  const { day, start } = ptDayBounds(now);
  const gates = profileGates(rows.user?.dobYear, rows.optIn, now);
  const skills = skillsFrom(rows, start.getTime(), gates.canSaveScan);
  const pick = pickFocus(skills, userId, day);
  const plan = planFor(pick.focus, access);
  const step = streakStep(rows.profile, now.getTime(), 'play');
  const meta = (rows.claim?.metadata && typeof rows.claim.metadata === 'object' ? rows.claim.metadata : {}) as Record<string, unknown>;
  const claimedDays = typeof meta.streakDays === 'number' ? meta.streakDays : null;
  const nextDay = ptDayBounds(new Date(start.getTime() + DAY_MS + 3 * 3_600_000)).day;
  const pickTomorrow = pickFocus(skills, userId, nextDay);
  const planTomorrow = planFor(pickTomorrow.focus, access);
  const tomorrowDrill = planTomorrow?.drillId ?? null;
  return {
    day,
    focus: pick.focus,
    skill: pick.skill,
    why: whyLine(pick.focus, pick.skill, pick.tiedWith.length > 0),
    plan: plan ? { ...plan, minutes: specMinutes(plan) } : null,
    nudge: pick.skill ? null : measureNudge(gates),
    credit: rows.credit,
    done: rows.claim ? { amount: Number(rows.claim.delta ?? 0), streakDays: claimedDays } : null,
    streak: { days: Math.max(0, rows.profile?.streakDays ?? 0), opensToday: step.due || step.owed, nextDays: step.streakDays },
    newcomer: !rows.claim && rows.recentDrills === 0,
    whyToday: whyToday(pick.focus, pick.skill, pick.tiedWith.length > 0, plan?.drillId ?? 'wake-up'),
    tomorrow: { focus: pickTomorrow.focus, drillId: tomorrowDrill, line: tomorrowLine(pick.focus, pickTomorrow.focus, tomorrowDrill, pick.skill) },
  };
}

export interface LoadDeps {
  /** The drills page's context (lib/coach/warmupServer.ts loadWarmupContext); a failure is the careful one. */
  warmupContext: (userId: string, now: Date) => Promise<WarmupContext>;
}

/** Today's drill for this account. Never throws: a failed read is its empty value, a failed context the careful one. */
export async function loadDailyDrill(db: DailyDrillDb, userId: string, deps: LoadDeps, now: Date = new Date()): Promise<DailyDrillView> {
  const [rows, ctx] = await Promise.all([
    readDrillRows(db, userId, now),
    deps.warmupContext(userId, now).catch((): WarmupContext => FALLBACK_WARMUP_CONTEXT),
  ]);
  return viewFrom(userId, rows, drillsAccess(ctx), now);
}

/** The last `n` PT days, today first (DST-safe: each day is the one before the previous day's start). */
export function lastPtDays(now: Date, n = 7): string[] {
  const out: string[] = [];
  let at = now;
  for (let i = 0; i < n; i++) {
    const b = ptDayBounds(at);
    out.push(b.day);
    at = new Date(b.start.getTime() - 1);
  }
  return out;
}

/**
 * Days in the last seven (today included) with the day's drill done: one count over the claims' own ledger keys, no
 * amounts read. For the progress card's page. A failed read is null (the line is left out), never a 0 nobody measured.
 */
export async function drillDaysThisWeek(db: Pick<DailyDrillDb, 'walletLedgerEntry'> & { walletLedgerEntry: { count(a: unknown): Promise<number> } }, userId: string, now: Date = new Date()): Promise<number | null> {
  const keys = lastPtDays(now).map((d) => dailyDrillKey(userId, d));
  try {
    const n = Number(await db.walletLedgerEntry.count({ where: { idempotencyKey: { in: keys } } }));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
