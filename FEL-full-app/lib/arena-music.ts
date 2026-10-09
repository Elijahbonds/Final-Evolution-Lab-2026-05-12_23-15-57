/**
 * lib/arena-music.ts — an Arena music duel's ONE attempt, as the server records it and scores it (MUSIC-SUITE P6,
 * 2026-09-26). Owner decisions #12 ("house beat seeded by the match, locked tempo, one attempt, count-in") and #29 ("a
 * reload after the count-in scores 0, said before the count-in").
 *
 * NO SCHEMA CHANGE: the attempt rides in MatchEvent rows through appendMatchEvent (lib/arena.ts), the way Flight Night's
 * dunk card rides in its SCORE_SUBMITTED event.
 *   · `music_attempt_start` — posted by the room at the count-in (/api/arena/music-attempt {phase: 'start'}). One per
 *     player per duel: a second is refused 409 ONE_ATTEMPT, so a reload (or a second tab) cannot replay the set.
 *   · `music_attempt_finish` — posted by the room when the set ends ({phase: 'finish', taps}), carrying the tap list it
 *     judged (houseBeat.ts parseHouseTaps: at most HOUSE_MAX_TAPS, each { lane, tMs }).
 * At /api/arena/submit-score a music duel's score must be what the server makes of that list: houseBeatFor(match id)
 * rebuilt, judgeHouseSet run on the stored taps (the room's own judge, imported), and the posted score equal to it.
 * An attempt that was started and never finished scores 0 — the reload rule. No start at all: nothing to score.
 *
 * Pure except readMusicAttempt, lockMatchRow and readMusicSeats, which take the caller's transaction client.
 *
 * MUSIC-SUITE P6 FIX PASS (2026-09-26) — what the phase review found and measured, and what changed here:
 *   · TWO STARTS RACED PAST THE ONE-ATTEMPT CHECK. The check was a read, then an insert (appendMatchEvent computes seq
 *     from the last row), and MatchEvent has no unique key, so under READ COMMITTED two concurrent starts each saw none
 *     and each wrote one: two live attempts, and the player chose which finish to post first. lockMatchRow takes the
 *     duel's row lock (an UPDATE of updatedAt) before the attempt is read, so the second start waits, then reads the
 *     first one's committed row and is refused. The finish and the session pay-once claim take the same lock.
 *   · A START WHOSE REPLY WAS LOST BURNT THE ATTEMPT. The room now sends a client `attemptId`; a second start with the
 *     same id, no finish yet and inside HOUSE_START_RETRY_MS of the first answers the first start again (isStartReplay).
 *   · #29 WAS ENFORCED BY NOTHING. A started attempt only became a score when the shell submitted it, so a set left after
 *     the count-in (or finished and never submitted) was voided and refunded by the expiry sweep. readMusicSeats is what
 *     the sweep and submit-score read now: a seat with a start HAS played (its score is musicAttemptScore — 0 unfinished,
 *     the rejudge finished), and a stored score with NO start by its player is from before the house beat (decision #12:
 *     "old music duel scores stop counting") and counts for nothing.
 *   · The rejudge verifies the taps were JUDGED right, not that a hand made them: houseBeatFor(matchId) ships in the
 *     client, so a tap list built from the chart scores HOUSE_SET_MAX. musicTapPlausibility records how machine-exact a
 *     set's timing is in its SCORE_SUBMITTED event for review; nothing is refused on it (other modes have the same limit).
 */

import type { DbClient } from '@/lib/ledger';
import { canonicalModeKey } from '@/lib/game-data';
import { appendMatchEvent } from '@/lib/competition';
import { houseBeatFor, judgeHouseSet, parseHouseTaps, type HouseTap } from '@/lib/babylon/music/houseBeat';

export const MUSIC_ATTEMPT_START = 'music_attempt_start';
export const MUSIC_ATTEMPT_FINISH = 'music_attempt_finish';

/** Is this duel a Groove Academy duel (either spelling a row may carry)? */
export function isMusicDuel(mode: string | null | undefined): boolean {
  return canonicalModeKey(mode) === 'music';
}

/** One player's attempt on one duel, as its events say. */
export interface MusicAttempt {
  /** When the start was recorded (the first one, if a race wrote two), or null: never started. */
  startedAt: Date | null;
  /** The finish's tap list (the first finish), or null: not finished. */
  finish: { taps: HouseTap[]; at: Date } | null;
  /** MUSIC-SUITE P6 FIX PASS: the room's attemptId on the first start (absent when it sent none). */
  startAttemptId?: string;
}

/** MUSIC-SUITE P6 FIX PASS: the event that marks an Arena set's session as PAID uncapped (once per player per duel). */
export const MUSIC_SESSION_PAID = 'music_session_paid';

/**
 * MUSIC-SUITE P6 FIX PASS: how long after a start the SAME attemptId may start again and get the first start back (a
 * reply lost on a flaky phone connection, a proxy 502). The room awaits the start before its count-in, so a retry comes
 * before any note is played; 20 s covers a slow retry and gives a reload nothing (a reloaded room has a new attemptId).
 */
export const HOUSE_START_RETRY_MS = 20_000;
/** A start is refused (409 TOO_LATE) when the duel's deadline leaves less than count-in + set + this. */
export const HOUSE_START_MARGIN_MS = 60_000;
/** An attemptId the route will store: short, plain (the room sends a random base-36 / uuid string). */
export function cleanAttemptId(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null;
}
/** Is this start a retry of the recorded one (same attemptId, not finished, inside HOUSE_START_RETRY_MS)? Pure. */
export function isStartReplay(attempt: MusicAttempt, attemptId: string | null, nowMs: number): boolean {
  return !!attempt.startedAt && !attempt.finish && !!attemptId && attempt.startAttemptId === attemptId
    && nowMs - attempt.startedAt.getTime() <= HOUSE_START_RETRY_MS;
}

/**
 * MUSIC-SUITE P6 FIX PASS: take the duel row's lock for the rest of the transaction (Postgres: an UPDATE holds the row
 * lock until commit). Every read after it sees what a concurrent writer committed before it — under READ COMMITTED each
 * statement reads the latest committed rows — so a read-then-write on the duel's events is serialised per duel.
 */
export async function lockMatchRow(db: DbClient, matchId: string): Promise<boolean> {
  const r = await (db as any).competitionMatch.updateMany({ where: { id: matchId }, data: { updatedAt: new Date() } });
  return !!r && r.count === 1;
}

const parsePayload = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try { const v = JSON.parse(String(raw ?? '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

/**
 * The player's attempt on this duel, from its MatchEvent rows. The first start and the first finish count (seq order):
 * two requests racing past the one-attempt check can each write a row, and the first is the one that happened.
 * A finish row whose taps no longer parse (only a hand-edited row could) reads as an empty list — the set scores 0.
 */
export async function readMusicAttempt(db: DbClient, matchId: string, userId: string): Promise<MusicAttempt> {
  const rows: { eventType: string; payload: unknown; createdAt: Date | string }[] = await (db as any).matchEvent.findMany({
    where: { matchId, userId, eventType: { in: [MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH] } },
    orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
    select: { eventType: true, payload: true, createdAt: true },
  });
  const start = rows.find((r) => r.eventType === MUSIC_ATTEMPT_START);
  const fin = rows.find((r) => r.eventType === MUSIC_ATTEMPT_FINISH);
  let finish: MusicAttempt['finish'] = null;
  if (fin) {
    const parsed = parseHouseTaps(houseBeatFor(matchId), parsePayload(fin.payload).taps);
    finish = { taps: parsed.ok ? parsed.taps : [], at: new Date(fin.createdAt) };
  }
  const attemptId = start ? cleanAttemptId(parsePayload(start.payload).attemptId) : null;
  return { startedAt: start ? new Date(start.createdAt) : null, finish, ...(attemptId ? { startAttemptId: attemptId } : {}) };
}

export type MusicScoreVerdict =
  | { ok: true; score: number; forfeit: boolean; taps: number }
  | { ok: false; code: 'NO_ATTEMPT'; status: 409; detail: string };

/**
 * What this attempt scores, on the server: the rejudge of its finished tap list on the duel's house beat, 0 for an
 * attempt started and never finished (decision #29), and no score at all without a start — the room posts its start at
 * the count-in, so a score with none behind it was never played in this duel.
 */
export function musicAttemptScore(matchId: string, attempt: MusicAttempt): MusicScoreVerdict {
  if (!attempt.startedAt) {
    return {
      ok: false, code: 'NO_ATTEMPT', status: 409,
      detail: 'No set was played for this duel: an Arena music score comes from its one recorded attempt. The score was not recorded and nothing was settled.',
    };
  }
  if (!attempt.finish) return { ok: true, score: 0, forfeit: true, taps: 0 };
  return { ok: true, score: judgeHouseSet(houseBeatFor(matchId), attempt.finish.taps).score, forfeit: false, taps: attempt.finish.taps.length };
}

/**
 * MUSIC-SUITE P6 FIX PASS: claim the ONE uncapped session pay for this player's Arena set on this duel. Under the duel's
 * row lock (lockMatchRow): true = this call recorded MUSIC_SESSION_PAID (pay it as an Arena set); false = one was already
 * recorded (pay it as free play). Two sessions posted at once: the second waits on the lock, then finds the first's row.
 */
export async function claimMusicSessionPay(db: DbClient, matchId: string, userId: string): Promise<boolean> {
  if (!(await lockMatchRow(db, matchId))) return false;
  const had = await (db as any).matchEvent.findFirst({ where: { matchId, userId, eventType: MUSIC_SESSION_PAID }, select: { id: true } });
  if (had) return false;
  await appendMatchEvent(db, matchId, MUSIC_SESSION_PAID, userId, {});
  return true;
}

// ── MUSIC-SUITE P6 FIX PASS (2026-09-26): a seat's score as the SERVER counts it ────────────────────────────────────
/**
 * One seat of a music duel, as settlement counts it:
 *   · a stored score by a player who STARTED an attempt → that score (it was rejudged at submit-score);
 *   · a stored score with NO start by its player → `legacy`: a pre-house-beat score (the player's own grid, up to
 *     2,647,100) that decision #12 says stops counting — score null;
 *   · no stored score, a start → musicAttemptScore: 0 for an unfinished attempt (decision #29 — the reload rule, which
 *     nothing enforced before this: the sweep read the score columns only), the rejudge for a finished one;
 *   · no stored score, no start → null: not played.
 * The house seat of a Quick Match never plays an attempt; its stored score (drawn at settlement) is taken as it is.
 */
export interface MusicSeat { score: number | null; legacy: boolean; started: boolean; finished: boolean }
export function musicSeat(matchId: string, stored: number | null | undefined, attempt: MusicAttempt | null): MusicSeat {
  const has = stored !== null && stored !== undefined;
  if (!attempt) return { score: has ? stored! : null, legacy: false, started: false, finished: false };   // the house seat
  const started = !!attempt.startedAt, finished = !!attempt.finish;
  if (has) return started ? { score: stored!, legacy: false, started, finished } : { score: null, legacy: true, started, finished };
  if (!started) return { score: null, legacy: false, started, finished };
  const v = musicAttemptScore(matchId, attempt);
  return { score: v.ok ? v.score : 0, legacy: false, started, finished };
}

/** Which seat of a Quick Match the house sits in: seat 2, always (app/api/arena/quick-match/route.ts seats the player in 1). */
export function houseSeatOf(m: { matchType?: string | null }): 'p1' | 'p2' | null {
  return m.matchType === 'GHOST_DUEL' ? 'p2' : null;
}

/** Both seats of a music duel, read from its events (the house seat of a Quick Match is not read: it plays no attempt). */
export async function readMusicSeats(
  db: DbClient,
  m: { id: string; matchType?: string | null; player1Id: string; player2Id: string | null | undefined; player1Score: number | null | undefined; player2Score: number | null | undefined },
): Promise<{ p1: MusicSeat; p2: MusicSeat }> {
  const house = houseSeatOf(m);
  const a1 = house === 'p1' ? null : await readMusicAttempt(db, m.id, m.player1Id);
  const a2 = house === 'p2' || !m.player2Id ? null : await readMusicAttempt(db, m.id, m.player2Id);
  return { p1: musicSeat(m.id, m.player1Score, a1), p2: musicSeat(m.id, m.player2Score, a2) };
}

/** The REFUNDED reason for a duel voided because its other score is from before the house beat (decision #12). */
export const PRE_HOUSE_BEAT_REASON = 'pre_house_beat';

// ── the rejudge's limit, recorded (review, minor) ───────────────────────────────────────────────────────────────────
/** Hits read before a set's timing is judged at all, and the spread under which it is machine-exact. TUNE(elijah). */
export const PLAUSIBILITY_MIN_HITS = 100;
export const PLAUSIBILITY_MIN_SPREAD_MS = 3;
/**
 * How machine-exact a finished set's timing is: every tap within PERFORM_EXPIRE_S of a note of its own lane is a hit here,
 * and its signed error's standard deviation is the spread. A human's spread is tens of ms (the proof's 'good ±30 ms'
 * player); a list built from the chart is ~0. `flagged` = at least PLAUSIBILITY_MIN_HITS hits with a spread under
 * PLAUSIBILITY_MIN_SPREAD_MS. Recorded for review in the SCORE_SUBMITTED event; nothing is refused on it.
 */
export function musicTapPlausibility(matchId: string, taps: readonly HouseTap[]): { hits: number; spreadMs: number | null; flagged: boolean } {
  const beat = houseBeatFor(matchId);
  const byLane = new Map<string, number[]>();
  for (const n of beat.notes) byLane.set(n.lane, [...(byLane.get(n.lane) ?? []), n.t * 1000]);
  const errs: number[] = [];
  for (const t of taps) {
    let best = Infinity;
    for (const at of byLane.get(t.lane) ?? []) { const e = t.tMs - at; if (Math.abs(e) < Math.abs(best)) best = e; }
    if (Math.abs(best) <= 250) errs.push(best);
  }
  if (!errs.length) return { hits: 0, spreadMs: null, flagged: false };
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  const spreadMs = Math.sqrt(errs.reduce((a, e) => a + (e - mean) ** 2, 0) / errs.length);
  return { hits: errs.length, spreadMs: Math.round(spreadMs * 100) / 100, flagged: errs.length >= PLAUSIBILITY_MIN_HITS && spreadMs < PLAUSIBILITY_MIN_SPREAD_MS };
}
