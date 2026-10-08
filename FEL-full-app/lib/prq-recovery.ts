// lib/prq-recovery.ts — MIRROR-COACH P9 (2026-09-30): PRQ RECOVERY'S SERVER HALF (owner decision #12, phase rule (a)).
//
// The rule and its numbers are lib/prq-engine.ts ("PRQ recovery"); this file reads the recovery work a player logged and
// writes the settled value to PlayerProfile.recovery — the column lib/prq.ts prqScore reads everywhere.
//
// WHERE THE STATE IS. No new column: the value is PlayerProfile.recovery and its time is the row's own updatedAt
// (@updatedAt — every write through the client moves it). A settle carries the value from recoveryAnchor(updatedAt) to
// now and writes it back WITH updatedAt = now, so the pair is always "this value, as of this time". The events are pulled
// from the coached log (lib/coach/recoverySources.ts) for the window [start of the anchor's UTC day, now]: the ones after
// the anchor are credited, the earlier ones only count against that day's cap. Nothing is pushed at the moment of a
// cool-down, so nothing can be credited twice, and a settle that fails simply leaves the next one to start from the same
// place. (An additive column would have been cleaner to read, but PlayerProfile is read by every paying route, and code
// deployed ahead of its SQL would 500 all of them; this needs no schema change at all.)
//
// WHO SETTLES.
//   · lib/profile-service.ts getOrCreateProfile, on every call — /api/profile (every GameShell), POST /api/sessions,
//     the shop, the wardrobe, lessons, the AI coach. That is how recovery FALLS when nothing happens: whenever the
//     player is next seen. It writes in the same update as the old inactivity decay. (No game row writes recovery any
//     more — P9 code review took the last one, lib/prq.ts MODE_ATTRS.training — so nothing else moves this number.)
//     The write is conditional on the row not having moved since it was read (P9 code review: it was unconditional,
//     and a settle that read the row before a coach route's settle credited a cool-down wrote over that credit).
//   · the coach routes, right after a session is completed (POST /api/coach/me/log with complete) and after a
//     cool-down tap (POST /api/coach/me/cooldown), so the coach and the athlete see the credit at once
//     (settleRecoveryFor, best-effort: it never fails the request).
// KNOWN GAPS. P9 code review corrected this paragraph: it said both gaps leave recovery LOWER, never higher, and the
// first one does not.
//   · A PlayerProfile write that does not settle first moves updatedAt (the anchor) without a settle, so everything
//     between the last settle and that write is SKIPPED — the recovery work (recovery ends up lower) AND the half-life
//     (recovery ends up HIGHER: settled 80, then a write ten days later, and those ten days' fall, about 80 → 70.7, never
//     happens). Every PlayerProfile writer calls getOrCreateProfile first (the sessions route, equip, the profile route,
//     education) except the season pass's Lab Credit grant (lib/season/season-service.ts, inside its own
//     transaction), which now settles recovery just before it (settleRecoveryFor), so the skipped window there is the
//     milliseconds between the two writes.
//   · A completion committed while another request for the same player is mid-settle (a window of milliseconds): the
//     conditional write means the slower settle writes nothing, and its work is picked up by the next one.
//
// AGE. Not gated by lib/privacy/healthWriteGate.ts, on purpose (assumption, stated in the P9 report): PlayerProfile's
// eight attributes are game stats that POST /api/sessions writes for every age today; this reads coached training logs
// (sets, minutes, Done) that are saved for every age; it never reads a health record, a camera number or a self-report,
// and it writes no new kind of data. The athlete PRQ snapshot (app/api/v1/creator/athlete) reads PrqEntry measurement
// keys, never PlayerProfile, and nothing here writes a PrqEntry, so its TEEN-WRITE-BLOCK gate has no way around it here.
//
// SELF-REPORTS. The only tables read are ClientSession, SetLog (with the ExerciseLog / SessionExercise / ProgramExercise
// fields the filters name) and PlayerProfile; lib/prq-recovery-self-reports.test.ts walks this file's whole import graph
// and fails if a readiness, pain, intake or breath module ever enters it.
import type { PrismaClient } from '@/public/_prisma/client';
import { AUTO_COOLDOWN_CREDIT_WHERE, COACH_COOLDOWN_DONE_WHERE, COMPLETED_OFF_DAY_WHERE, EASY_CARDIO_SET_WHERE } from '@/lib/coach/recoverySources';
import { RECOVERY_DECIMALS, decayRecovery, recoveryAnchor, recoveryDayStart, settleRecovery, type RecoveryEvent, type RecoverySettle } from '@/lib/prq-engine';

export type RecoveryDb = Pick<PrismaClient, 'playerProfile' | 'clientSession' | 'setLog'>;

type When = Date | string | null;

/** What a settle needs of the profile row. */
export interface RecoveryRow { recovery: number | null; updatedAt: When }

/**
 * The rows the three sources return (the selects in readRecoveryRows). `sessionId` is the PRESCRIBED session (Session.id)
 * the row is a completion of — optional in the type so a caller that has none still reads (then the row's own id stands in
 * for it, and nothing is deduplicated across rows).
 */
export interface RecoveryRows {
  offDays: { id: string; sessionId?: string | null; completedAt: When }[];
  cooldowns: { id: string; sessionId?: string | null; completedAt: When; cooldownDoneAt: When }[];
  cardioSets: {
    workSeconds: number | null;
    exerciseLog: { clientSessionId: string; clientSession: { completedAt: When; sessionId?: string | null } };
  }[];
}

const NO_ROWS: RecoveryRows = { offDays: [], cooldowns: [], cardioSets: [] };
const ms = (d: When | undefined): number => (d == null ? Number.NaN : new Date(d).getTime());

const DAY_MS = 24 * 60 * 60 * 1000;
/** The UTC day a time falls in (days since the epoch). */
export const utcDayOf = (t: number): number => Math.floor(t / DAY_MS);
/** The UTC week (Monday 00:00Z to Monday) a time falls in: weeks since the epoch's Monday (1970-01-01 was a Thursday). */
export const utcWeekOf = (t: number): number => Math.floor((utcDayOf(t) + 3) / 7);
/** The start (ms) of the UTC week `t` falls in — the off days' read window opens there (one credit per week). */
export const utcWeekStart = (t: number): number => (utcWeekOf(t) * 7 - 3) * DAY_MS;

/**
 * ONE PRESCRIBED SESSION, ONE CREDIT (MIRROR-COACH P9 FIX, 2026-09-30, code review). saveClientLog neither checks that a
 * session is today's nor that it was already done — it reuses the open row or opens a new one for the same prescribed
 * session and completes it (lib/coach/todayServer.ts) — and this used to make one event per ClientSession row. So one
 * prescribed off day, POSTed Done twice a day with the walk typed in, was 1.0 + 0.7 then 1.0: the whole cap, every day,
 * with no rest taken. Now a prescribed session earns:
 *   · its off-day credit once per UTC week (an off day is a weekly prescription; the next week's is the next credit),
 *   · its cool-down once per UTC day, and its easy-cardio minutes once per UTC day (the first completion's).
 * The first completion (by time, then row id) is the one that counts, so the answer does not depend on read order.
 */
export const RECOVERY_DEDUPE = { offDay: 'utcWeek', cooldown: 'utcDay', easyCardio: 'utcDay' } as const;

type Keyed = { key: string; at: number; row: string };
/** Keeps the first (by time, then row id) of each key. */
function firstPerKey<T extends Keyed>(xs: T[]): T[] {
  const seen = new Set<string>();
  return [...xs].sort((a, b) => a.at - b.at || a.row.localeCompare(b.row)).filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
}

/**
 * The rows as engine events (pure). One off day per completed off-day session; one cool-down per completed session (the
 * automatic one and a coach-written one on the same session are ONE cool-down), at the later of Done and the tap; one
 * easy-cardio event per session with its timed easy sets' minutes summed, at the session's Done — and then ONE PER
 * PRESCRIBED SESSION per UTC week (off days) or UTC day (cool-downs, easy cardio), RECOVERY_DEDUPE above.
 */
export function recoveryEventsFromRows(rows: RecoveryRows): RecoveryEvent[] {
  const events: RecoveryEvent[] = [];
  const byRow = new Set<string>();
  const offDays: (Keyed & { at: number })[] = [];
  for (const r of rows.offDays) {
    if (byRow.has(`o:${r.id}`)) continue;
    byRow.add(`o:${r.id}`);
    const at = ms(r.completedAt);
    if (!Number.isFinite(at)) continue;
    offDays.push({ key: `${r.sessionId ?? `row:${r.id}`}|w${utcWeekOf(at)}`, at, row: r.id });
  }
  for (const o of firstPerKey(offDays)) events.push({ source: 'offDay', at: o.at, ref: o.row });

  const cooldowns: Keyed[] = [];
  for (const r of rows.cooldowns) {
    if (byRow.has(`c:${r.id}`)) continue;
    byRow.add(`c:${r.id}`);
    const done = ms(r.completedAt);
    const tap = ms(r.cooldownDoneAt);
    const at = Number.isFinite(tap) ? Math.max(done, tap) : done;
    if (!Number.isFinite(at)) continue;
    cooldowns.push({ key: `${r.sessionId ?? `row:${r.id}`}|d${utcDayOf(at)}`, at, row: r.id });
  }
  for (const c of firstPerKey(cooldowns)) events.push({ source: 'cooldown', at: c.at, ref: c.row });

  const cardio = new Map<string, { at: number; seconds: number; sessionId: string | null }>();
  for (const s of rows.cardioSets) {
    const id = s.exerciseLog.clientSessionId;
    const sec = Number(s.workSeconds ?? 0);
    const cur = cardio.get(id) ?? { at: ms(s.exerciseLog.clientSession.completedAt), seconds: 0, sessionId: s.exerciseLog.clientSession.sessionId ?? null };
    cur.seconds += Number.isFinite(sec) && sec > 0 ? sec : 0;
    cardio.set(id, cur);
  }
  const walks: (Keyed & { seconds: number })[] = [];
  for (const [id, c] of cardio) {
    if (!(c.seconds > 0) || !Number.isFinite(c.at)) continue;
    walks.push({ key: `${c.sessionId ?? `row:${id}`}|d${utcDayOf(c.at)}`, at: c.at, row: id, seconds: c.seconds });
  }
  for (const w of firstPerKey(walks)) events.push({ source: 'easyCardio', at: w.at, minutes: w.seconds / 60, ref: w.row });
  return events;
}

/**
 * The recovery work a player logged from `fromMs` on. One cheap query first (any coached session completed or
 * cooled-down since then?) — for a player who is not coached that is the whole cost — then the three sources, each read
 * through its own filter so "what counts" stays defined once, in lib/coach/recoverySources.ts. Off days are read from
 * the start of `fromMs`'s UTC week (P9 code review): one prescribed off day earns once a week, so an earlier completion
 * of it that week has to be seen for a later one not to count again. Every row carries its prescribed sessionId.
 */
export async function readRecoveryRows(db: RecoveryDb, userId: string, fromMs: number): Promise<RecoveryRows> {
  const from = new Date(fromMs);
  const weekFrom = new Date(utcWeekStart(fromMs));
  const since = { OR: [{ completedAt: { gte: from } }, { cooldownDoneAt: { gte: from } }] };
  const any = await db.clientSession.findFirst({ where: { clientId: userId, completedAt: { not: null }, ...since }, select: { id: true } });
  if (!any) return NO_ROWS;
  const [offDays, cooldowns, cardioSets] = await Promise.all([
    db.clientSession.findMany({
      where: { clientId: userId, AND: [COMPLETED_OFF_DAY_WHERE, { completedAt: { gte: weekFrom } }] },
      select: { id: true, sessionId: true, completedAt: true },
    }),
    db.clientSession.findMany({
      where: { clientId: userId, AND: [{ OR: [AUTO_COOLDOWN_CREDIT_WHERE, COACH_COOLDOWN_DONE_WHERE] }, since] },
      select: { id: true, sessionId: true, completedAt: true, cooldownDoneAt: true },
    }),
    db.setLog.findMany({
      where: { AND: [EASY_CARDIO_SET_WHERE, { exerciseLog: { clientSession: { clientId: userId, completedAt: { gte: from } } } }] },
      select: { workSeconds: true, exerciseLog: { select: { clientSessionId: true, clientSession: { select: { completedAt: true, sessionId: true } } } } },
    }),
  ]);
  return { offDays, cooldowns, cardioSets };
}

export interface RecoveryOutcome {
  /** What to write (recovery + updatedAt together), or null when nothing changed. */
  write: { recovery: number; updatedAt: Date } | null;
  /** The engine's account of the settle (null when there was nothing to settle from). */
  settle: RecoverySettle | null;
}

/** Settles one profile row's recovery to `now` (reads the log; writes nothing). */
export async function settledRecovery(db: RecoveryDb, userId: string, row: RecoveryRow, now: Date = new Date()): Promise<RecoveryOutcome> {
  const anchor = recoveryAnchor(row.updatedAt == null ? null : new Date(row.updatedAt));
  const value = Number(row.recovery);
  const nowMs = now.getTime();
  if (anchor === null || row.recovery == null || !Number.isFinite(value) || !(nowMs > anchor)) return { write: null, settle: null };
  const rows = await readRecoveryRows(db, userId, recoveryDayStart(anchor));
  const settle = settleRecovery(value, anchor, recoveryEventsFromRows(rows), nowMs);
  return { write: settle.changed ? { recovery: settle.value, updatedAt: now } : null, settle };
}

/**
 * MIRROR-COACH P9 fix (2026-09-30, code review): A READ THAT SHOWS RECOVERY SHOWS IT AS OF NOW. The fall only happens
 * inside a settle (getOrCreateProfile, the coach routes), and two pages read PlayerProfile directly — the Profile tab
 * (app/profile/page.tsx: the PRQ and its grade) and the coach's roster card (lib/camp/profile.ts composeProfile) — so a
 * player idle for a month saw the recovery they had a month ago until some game called /api/profile, and their coach
 * saw it indefinitely. This is the settle's decay alone, pure (no read, no write): the half-life from the row's anchor
 * to `now`. Recovery work logged since the last settle is not added here — it lands at the next settle — so the shown
 * number can only be the lower one, never a credit that was not earned.
 */
export function recoveryAsOf<T extends { recovery?: number | null; updatedAt?: When }>(row: T, now: Date = new Date()): T {
  if (!row || row.recovery == null || !Number.isFinite(Number(row.recovery))) return row;
  const anchor = recoveryAnchor(row.updatedAt == null ? null : new Date(row.updatedAt));
  if (anchor === null || !(now.getTime() > anchor)) return row;
  const f = 10 ** RECOVERY_DECIMALS;
  return { ...row, recovery: Math.round(decayRecovery(Number(row.recovery), anchor, now.getTime()) * f) / f };
}

export type SettleResult = { ok: true; written: boolean; recovery: number | null } | { ok: false; reason: 'no_profile' | 'error' };

/**
 * Best-effort settle and write, for the coach routes after a completion or a cool-down tap. Never throws: a failure is
 * logged (no ids) and the next settle starts from the same place. The write is conditional on the row not having moved
 * since it was read, so a write that landed in between (a session's pay, another settle) is never overwritten.
 */
export async function settleRecoveryFor(db: RecoveryDb, userId: string, now: Date = new Date()): Promise<SettleResult> {
  try {
    const row = await db.playerProfile.findUnique({ where: { userId }, select: { recovery: true, updatedAt: true } });
    if (!row) return { ok: false, reason: 'no_profile' };
    const out = await settledRecovery(db, userId, row, now);
    if (!out.write) return { ok: true, written: false, recovery: row.recovery };
    const r = await db.playerProfile.updateMany({ where: { userId, updatedAt: row.updatedAt }, data: out.write });
    return { ok: true, written: r.count > 0, recovery: r.count > 0 ? out.write.recovery : row.recovery };
  } catch (e) {
    console.error('[prq-recovery] settle skipped; the next settle starts from the same point:', (e as { code?: string })?.code ?? (e as Error)?.name ?? 'error');
    return { ok: false, reason: 'error' };
  }
}
