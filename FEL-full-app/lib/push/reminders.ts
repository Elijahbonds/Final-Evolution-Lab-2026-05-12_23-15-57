// The daily reminders (offline-push, round 8, OFF-04; docs/PLATFORM-ROADMAP.md §1.3 "Streaks and reminders", §1.2
// "Compliance alerts"). Run by POST /api/cron/reminders, once a day, on the owner's scheduler. Server only.
//
// For every account that opted in to a reminder kind (NotificationPref; at most REMINDER_BATCH a run):
//   · today        — an athlete with an active coached program who has not completed a session in the last
//                    DONE_WINDOW_MS hears "Today's session is ready"; anyone else who has not played (PlayerProfile
//                    lastStreakAt) in that window hears "Today's drill is ready" (with their streak, when they have one);
//   · coach_alerts — a coach hears how many athletes MISSED planned sessions this week, by the coach board's own rule
//                    (lib/coach/alerts.ts missedFactsFor / missedThisWeek ≥ MISSED_ALERT_MIN; owner-confirmed "2 in 7
//                    days"). The count only: no names on a lock screen. Stalled and slowing athletes stay on the board.
// Each goes through notify() (lib/push/send.ts): verified adults who opted in, the caps, push first and email when push
// reached nothing and the account turned email reminders on. Teens get nothing, whatever is stored.
//
// assumption: "today" is a rolling DONE_WINDOW_MS, not the athlete's calendar day (FEL keeps no time zone per account);
// the owner picks the hour the scheduler runs.
import { MISSED_ALERT_MIN, missedFactsFor, missedThisWeek, type PlanShape } from '@/lib/coach/alerts';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { MessageContext } from './copy';
import { REMINDER_KINDS } from './policy';
import { notify, type NotifyDeps, type NotifyResult } from './send';
import { prefsWithAny, pushTablesReady } from './store';

export const REMINDERS_SECRET_HEADER = 'x-reminders-secret';
/** (new) Accounts one run looks at. */
export const REMINDER_BATCH = 500;
/** (new) Done "today" = something completed or played in the last 20 hours. */
export const DONE_WINDOW_MS = 20 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Constant-time comparison of the scheduler's secret (the retention job's rule). */
export function verifyRemindersSecret(presented: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || typeof presented !== 'string' || !presented) return false;
  return timingSafeEqual(createHash('sha256').update(presented).digest(), createHash('sha256').update(secret).digest());
}

export interface TodayFacts { activeProgram: boolean; completedRecently: boolean; lastPlayedMs: number | null; streakDays: number }

/** The athlete's "today" reminder, or null when they have already done today's work. */
export function todayReminder(f: TodayFacts, now: number): MessageContext | null {
  if (f.activeProgram) return f.completedRecently ? null : { kind: 'today', program: true };
  if (f.lastPlayedMs !== null && now - f.lastPlayedMs < DONE_WINDOW_MS) return null;
  return { kind: 'today', program: false, streakDays: Math.max(0, Math.floor(f.streakDays)) };
}

export interface CoachPlan extends PlanShape { clientId: string }

/** How many of a coach's athletes missed planned sessions this week (the board's rule). */
export function missedAthletes(plans: readonly CoachPlan[], completions: readonly { clientId: string; completedAtMs: number }[], now: number): number {
  const clients = [...new Set(plans.map((p) => p.clientId))];
  return clients.filter((cid) => missedThisWeek(missedFactsFor(
    plans.filter((p) => p.clientId === cid),
    completions.filter((c) => c.clientId === cid).map((c) => c.completedAtMs),
    now,
  )) >= MISSED_ALERT_MIN).length;
}

/** The reads the job makes beyond the push tables: the typed client's existing models. */
export interface ReminderReads {
  todayFacts(userId: string, now: number): Promise<TodayFacts>;
  coachFacts(coachId: string, now: number): Promise<{ plans: CoachPlan[]; completions: { clientId: string; completedAtMs: number }[] }>;
}

/** The live reads, against the generated client (CoachingProgram, ClientSession, PlayerProfile). */
export function liveReminderReads(db: {
  coachingProgram: { count(a: unknown): Promise<number>; findMany(a: unknown): Promise<unknown[]> };
  clientSession: { count(a: unknown): Promise<number>; findMany(a: unknown): Promise<unknown[]> };
  playerProfile: { findUnique(a: unknown): Promise<unknown> };
}): ReminderReads {
  return {
    async todayFacts(userId, now) {
      const since = new Date(now - DONE_WINDOW_MS);
      const [programs, done, profile] = await Promise.all([
        db.coachingProgram.count({ where: { clientId: userId, isActive: true } }),
        db.clientSession.count({ where: { clientId: userId, completedAt: { gte: since } } }),
        db.playerProfile.findUnique({ where: { userId }, select: { streakDays: true, lastStreakAt: true } }) as Promise<{ streakDays?: number; lastStreakAt?: Date | null } | null>,
      ]);
      return {
        activeProgram: programs > 0,
        completedRecently: done > 0,
        lastPlayedMs: profile?.lastStreakAt instanceof Date ? profile.lastStreakAt.getTime() : null,
        streakDays: Number(profile?.streakDays ?? 0),
      };
    },
    async coachFacts(coachId, now) {
      const shapes = await db.coachingProgram.findMany({
        where: { coachId, isActive: true },
        select: { id: true, clientId: true, startDate: true, durationWeeks: true, blocks: { select: { sessions: { select: { kind: true } } } } },
      }) as { id: string; clientId: string; startDate: Date; durationWeeks: number; blocks: { sessions: { kind: string }[] }[] }[];
      if (!shapes.length) return { plans: [], completions: [] };
      const done = await db.clientSession.findMany({
        where: { programId: { in: shapes.map((s) => s.id) }, completedAt: { gte: new Date(now - WEEK_MS) } },
        select: { clientId: true, completedAt: true },
      }) as { clientId: string; completedAt: Date | null }[];
      return {
        plans: shapes.map((p) => ({
          clientId: p.clientId, startMs: p.startDate.getTime(), durationWeeks: p.durationWeeks,
          trainingSessions: p.blocks.flatMap((b) => b.sessions).filter((x) => x.kind !== 'recovery').length,
        })),
        completions: done.flatMap((c) => (c.completedAt ? [{ clientId: c.clientId, completedAtMs: c.completedAt.getTime() }] : [])),
      };
    },
  };
}

export interface ReminderSummary {
  ok: boolean;
  state: 'off' | 'not_ready' | 'ran';
  considered: number;
  sent: number;
  refused: number;
  nothingToSay: number;
}

/** One run. Counts only, never a row or an account id. */
export async function runReminders(deps: NotifyDeps, reads: ReminderReads, now: number = Date.now()): Promise<ReminderSummary> {
  const summary: ReminderSummary = { ok: true, state: 'ran', considered: 0, sent: 0, refused: 0, nothingToSay: 0 };
  if (!deps.config.on && !deps.emailOn) return { ...summary, state: 'off' };
  if (!(await pushTablesReady(deps.db, now))) return { ...summary, state: 'not_ready' };
  const work = await prefsWithAny(deps.db, REMINDER_KINDS, REMINDER_BATCH);
  const count = (r: NotifyResult) => {
    if (r.status === 'sent') summary.sent += 1;
    else if (r.status === 'refused') summary.refused += 1;
  };
  for (const { userId, prefs } of work) {
    summary.considered += 1;
    try {
      if (prefs.kinds.includes('today')) {
        const ctx = todayReminder(await reads.todayFacts(userId, now), now);
        if (ctx) count(await notify(userId, ctx, { ...deps, now })); else summary.nothingToSay += 1;
      }
      if (prefs.kinds.includes('coach_alerts')) {
        const f = await reads.coachFacts(userId, now);
        const n = missedAthletes(f.plans, f.completions, now);
        if (n > 0) count(await notify(userId, { kind: 'coach_alerts', athletes: n }, { ...deps, now })); else summary.nothingToSay += 1;
      }
    } catch (e) {
      summary.ok = false;
      console.error(`[push/reminders] one account failed: ${e instanceof Error ? e.name : 'error'}`);
    }
  }
  return summary;
}
