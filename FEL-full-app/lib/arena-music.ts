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
 * Pure except readMusicAttempt / readHouseAttempt, lockMatchRow and readMusicSeats / readHouseSeats, which take the caller's
 * transaction client.
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
 *
 * MUSIC-SUITE P9 (2026-09-29), owner decision #10 ("Arena dance (fixed): same house song for both players, accuracy-based
 * score; own songs free play only") — THE SAME ATTEMPT FOR A DANCE DUEL, NOT A COPY OF IT. Dance staking was paused in
 * P1 because the song decided a dance duel; phase 9 gives a Cypher duel the shape music got in phase 6, and this file is
 * where that shape lives, so it now serves both (HOUSE_SET_RULES): the one-attempt rows, the row lock, the start replay,
 * the reload-scores-0 rule, the seats the sweep and submit-score count, the pre-house legacy void — one code path, with
 * what differs per mode in one table:
 *   · music — the house BEAT (houseBeatFor), taps { lane, tMs }, judgeHouseSet, events music_attempt_start / _finish;
 *   · dance — the house SONG (lib/babylon/dance/houseSong.ts houseSongFor: one of the six FEL songs and its chart, from
 *     the match id), presses { tMs, key?, move?, up? }, judgeDanceSet (DanceCore's own judge, scored on accuracy 0..10,000),
 *     events dance_attempt_start / _finish (their own names, so the audit trail says which room played the set).
 * Every music export keeps its name and its behaviour (the P6 tests are unchanged); the house-set functions take the
 * mode where music's took none.
 */

import type { DbClient } from '@/lib/ledger';
import { canonicalModeKey } from '@/lib/game-data';
import { appendMatchEvent } from '@/lib/competition';
import {
  houseBeatFor, judgeHouseSet, parseHouseTaps, houseBeatSummary, houseCountInMs, houseSetMs, houseMinFinishMs, HOUSE_ARENA_RULES,
  type HouseTap,
} from '@/lib/babylon/music/houseBeat';
import {
  houseSongFor, judgeDanceSet, parseDancePresses, houseSongSummary, houseSongCountInMs, houseSongSetMs, houseSongMinFinishMs,
  dancePressPlausibility, DANCE_ARENA_RULES, type HousePress,
  // MUSIC-SUITE P9 FIX PASS (2026-09-29): versions carried, charts pinned (houseSong.ts HOUSE_CHART_PRINTS' doc)
  assertHouseChart, houseChartMatches, HouseChartDrift, HOUSE_SONG_VERSION, type HouseSong,
} from '@/lib/babylon/dance/houseSong';

export const MUSIC_ATTEMPT_START = 'music_attempt_start';
export const MUSIC_ATTEMPT_FINISH = 'music_attempt_finish';

/** Is this duel a Groove Academy duel (either spelling a row may carry)? */
export function isMusicDuel(mode: string | null | undefined): boolean {
  return canonicalModeKey(mode) === 'music';
}

/** One player's attempt on one duel, as its events say. `T` is what the finish recorded: music taps, dance presses. */
export interface HouseAttempt<T = unknown> {
  /** When the start was recorded (the first one, if a race wrote two), or null: never started. */
  startedAt: Date | null;
  /** The finish's tap list (the first finish), or null: not finished. */
  finish: { taps: T[]; at: Date } | null;
  /** MUSIC-SUITE P6 FIX PASS: the room's attemptId on the first start (absent when it sent none). */
  startAttemptId?: string;
  /**
   * MUSIC-SUITE P9 FIX PASS (2026-09-29), dance only: what the first start RECORDED of its house song — the house-song
   * version (`v`) and the chart's fingerprint (`chart`, houseSong.ts houseChartPrint). The rejudge builds the song of THAT
   * version and refuses a chart that does not print the same (HOUSE_SET_RULES.dance). Absent on a start that recorded
   * neither (only a hand-made row): judged on the current version, as before.
   */
  recorded?: { v?: number; chart?: string };
}
/** A Groove Academy attempt: its finish holds house-beat taps. */
export type MusicAttempt = HouseAttempt<HouseTap>;
/** MUSIC-SUITE P9: a Cypher attempt: its finish holds house-song presses. */
export type DanceAttempt = HouseAttempt<HousePress>;

// ── MUSIC-SUITE P9 (2026-09-29): the two house-set modes, and what differs between them ─────────────────────────────
export const DANCE_ATTEMPT_START = 'dance_attempt_start';
export const DANCE_ATTEMPT_FINISH = 'dance_attempt_finish';

/** The modes whose Arena duel is ONE recorded attempt on a house set the server rejudges. */
export type HouseSetMode = 'music' | 'dance';
/** The house-set mode a duel's mode is (either spelling a row may carry), or null for every other mode. */
export function houseSetModeOf(mode: string | null | undefined): HouseSetMode | null {
  const k = canonicalModeKey(mode);
  return k === 'music' || k === 'dance' ? k : null;
}
/** Is this duel played as one recorded attempt on a house set (music or dance)? */
export function isHouseSetDuel(mode: string | null | undefined): boolean { return houseSetModeOf(mode) !== null; }
/** MUSIC-SUITE P9: is this duel a Cypher duel? */
export function isDanceDuel(mode: string | null | undefined): boolean { return canonicalModeKey(mode) === 'dance'; }

type Parsed = { ok: true; taps: unknown[] } | { ok: false; code: string; detail: string };
/** Everything the attempt route, submit-score, the sweep and the lobby need that differs between music and dance. */
export interface HouseSetRules {
  mode: HouseSetMode;
  /** The event rows an attempt is made of. */
  start: string;
  finish: string;
  /** The finish's list, checked whole (music parseHouseTaps; dance parseDancePresses) — refused lists are never stored.
   *  MUSIC-SUITE P9 FIX PASS: `v` = the house-song version the attempt's start recorded (dance; music ignores it). */
  parse(matchId: string, raw: unknown, v?: number): Parsed;
  /** The rejudge: the score the server makes of a finished list on this duel's house set (on version `v`, dance). */
  judge(matchId: string, taps: readonly unknown[], v?: number): number;
  /**
   * MUSIC-SUITE P9 FIX PASS (2026-09-29): refuse — throw — rather than judge an attempt on a set that is not the one it
   * was started on (dance: HouseChartDrift when the chart is not the one its version pins, or not the one its start
   * recorded). Music has no such check (its beat is rebuilt from the match id alone). Absent = nothing to check.
   */
  verify?(matchId: string, attempt: HouseAttempt): void;
  /** What a start event records of the set, and what START answers (the audit trail). */
  summary(matchId: string): Record<string, unknown>;
  /** The key START's answer carries the summary under ('beat' for music — unchanged since P6 — 'song' for dance). */
  summaryKey: 'beat' | 'song';
  countInMs(matchId: string): number;
  setMs(matchId: string): number;
  /** The soonest a finish may land after its start (90 % of the set). */
  minFinishMs(matchId: string): number;
  /** The line the room says before its count-in. */
  rules: string;
  /** A stored score from before the house set (no attempt behind it): the refusal's code, the REFUNDED reason, the words. */
  legacy: { code: string; reason: string; atStart: string; atSubmit: string };
  /** A score with no attempt behind it. */
  noAttempt: string;
  /** How machine-exact a finished list's timing is (recorded for review; nothing is refused on it). */
  plausibility(matchId: string, taps: readonly unknown[], v?: number): { hits: number; spreadMs: number | null; flagged: boolean };
}

/** Is `raw` a list of the finish rows parse() accepts? A stored row that does not parse reads as an empty list. */
const tapsOf = (p: Parsed): unknown[] => (p.ok ? p.taps : []);

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
export function isStartReplay(attempt: HouseAttempt, attemptId: string | null, nowMs: number): boolean {
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
 * MUSIC-SUITE P9: of either house-set mode — its own two event names, its own list parser.
 */
export async function readHouseAttempt(db: DbClient, mode: HouseSetMode, matchId: string, userId: string): Promise<HouseAttempt> {
  const rules = HOUSE_SET_RULES[mode];
  const rows: { eventType: string; payload: unknown; createdAt: Date | string }[] = await (db as any).matchEvent.findMany({
    where: { matchId, userId, eventType: { in: [rules.start, rules.finish] } },
    orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
    select: { eventType: true, payload: true, createdAt: true },
  });
  const start = rows.find((r) => r.eventType === rules.start);
  const fin = rows.find((r) => r.eventType === rules.finish);
  // MUSIC-SUITE P9 FIX PASS (2026-09-29): a dance start's recorded version and chart (HouseAttempt.recorded) — the finish
  // is parsed against THAT version's song (its set length bounds the press times), never the current one
  const sp = start ? parsePayload(start.payload) : {};
  // (a `v` this build cannot build — a start written by a newer build, then rolled back — is KEPT: danceSongOf refuses it
  // with HouseChartDrift rather than judge that set on this build's version)
  const recorded = mode === 'dance' && start
    ? { ...(typeof sp.v === 'number' && Number.isFinite(sp.v) ? { v: sp.v } : {}), ...(typeof sp.chart === 'string' ? { chart: sp.chart } : {}) }
    : null;
  let finish: HouseAttempt['finish'] = null;
  if (fin) finish = { taps: tapsOf(rules.parse(matchId, parsePayload(fin.payload).taps, recorded?.v)), at: new Date(fin.createdAt) };
  const attemptId = start ? cleanAttemptId(sp.attemptId) : null;
  return {
    startedAt: start ? new Date(start.createdAt) : null, finish, ...(attemptId ? { startAttemptId: attemptId } : {}),
    ...(recorded && Object.keys(recorded).length ? { recorded } : {}),
  };
}
/** The player's Groove Academy attempt (P6's reader: readHouseAttempt on music). */
export async function readMusicAttempt(db: DbClient, matchId: string, userId: string): Promise<MusicAttempt> {
  return readHouseAttempt(db, 'music', matchId, userId) as Promise<MusicAttempt>;
}

export type MusicScoreVerdict =
  | { ok: true; score: number; forfeit: boolean; taps: number }
  | { ok: false; code: 'NO_ATTEMPT'; status: 409; detail: string };
/** MUSIC-SUITE P9: the same verdict for either house-set mode. */
export type HouseScoreVerdict = MusicScoreVerdict;

/**
 * What this attempt scores, on the server: the rejudge of its finished tap list on the duel's house set, 0 for an attempt
 * started and never finished (decision #29), and no score at all without a start — the room posts its start at the
 * count-in, so a score with none behind it was never played in this duel. MUSIC-SUITE P9: of either house-set mode.
 */
export function houseAttemptScore(mode: HouseSetMode, matchId: string, attempt: HouseAttempt): HouseScoreVerdict {
  const rules = HOUSE_SET_RULES[mode];
  if (!attempt.startedAt) return { ok: false, code: 'NO_ATTEMPT', status: 409, detail: rules.noAttempt };
  if (!attempt.finish) return { ok: true, score: 0, forfeit: true, taps: 0 };
  // MUSIC-SUITE P9 FIX PASS (2026-09-29): a dance set is judged on the version and chart its start recorded, or not at all
  // (verify throws HouseChartDrift: the route answers an error and the sweep leaves the duel — nothing settles on it)
  rules.verify?.(matchId, attempt);
  return { ok: true, score: rules.judge(matchId, attempt.finish.taps, attempt.recorded?.v), forfeit: false, taps: attempt.finish.taps.length };
}
/** A Groove Academy attempt's score (P6's: houseAttemptScore on music — judgeHouseSet on the duel's house beat). */
export function musicAttemptScore(matchId: string, attempt: MusicAttempt): MusicScoreVerdict {
  return houseAttemptScore('music', matchId, attempt);
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
/** MUSIC-SUITE P9: a seat of either house-set duel (a dance seat's score is its rejudged accuracy, 0..10,000). */
export type HouseSeat = MusicSeat;
export function houseSeat(mode: HouseSetMode, matchId: string, stored: number | null | undefined, attempt: HouseAttempt | null): HouseSeat {
  const has = stored !== null && stored !== undefined;
  if (!attempt) return { score: has ? stored! : null, legacy: false, started: false, finished: false };   // the house seat
  const started = !!attempt.startedAt, finished = !!attempt.finish;
  if (has) return started ? { score: stored!, legacy: false, started, finished } : { score: null, legacy: true, started, finished };
  if (!started) return { score: null, legacy: false, started, finished };
  const v = houseAttemptScore(mode, matchId, attempt);
  return { score: v.ok ? v.score : 0, legacy: false, started, finished };
}
export function musicSeat(matchId: string, stored: number | null | undefined, attempt: MusicAttempt | null): MusicSeat {
  return houseSeat('music', matchId, stored, attempt);
}

/** Which seat of a Quick Match the house sits in: seat 2, always (app/api/arena/quick-match/route.ts seats the player in 1). */
export function houseSeatOf(m: { matchType?: string | null }): 'p1' | 'p2' | null {
  return m.matchType === 'GHOST_DUEL' ? 'p2' : null;
}

type SeatRow = { id: string; matchType?: string | null; player1Id: string; player2Id: string | null | undefined; player1Score: number | null | undefined; player2Score: number | null | undefined };
/**
 * Both seats of a house-set duel, read from its events (the house seat of a Quick Match is not read: it plays no attempt).
 * MUSIC-SUITE P9: `mode` is the duel's house-set mode (houseSetModeOf(m.mode)).
 */
export async function readHouseSeats(db: DbClient, mode: HouseSetMode, m: SeatRow): Promise<{ p1: HouseSeat; p2: HouseSeat }> {
  const house = houseSeatOf(m);
  const a1 = house === 'p1' ? null : await readHouseAttempt(db, mode, m.id, m.player1Id);
  const a2 = house === 'p2' || !m.player2Id ? null : await readHouseAttempt(db, mode, m.id, m.player2Id);
  return { p1: houseSeat(mode, m.id, m.player1Score, a1), p2: houseSeat(mode, m.id, m.player2Score, a2) };
}
/** Both seats of a music duel (P6's reader: readHouseSeats on music). */
export async function readMusicSeats(db: DbClient, m: SeatRow): Promise<{ p1: MusicSeat; p2: MusicSeat }> {
  return readHouseSeats(db, 'music', m);
}

/** The REFUNDED reason for a duel voided because its other score is from before the house beat (decision #12). */
export const PRE_HOUSE_BEAT_REASON = 'pre_house_beat';
/**
 * MUSIC-SUITE P9: the REFUNDED reason for a DANCE duel voided because its other score is from before the house song — a
 * points score on the player's own pick (up to 79,680), which decision #10's accuracy scale cannot be compared with.
 */
export const PRE_HOUSE_SONG_REASON = 'pre_house_song';

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

/** MUSIC-SUITE P9: the plausibility read of either house-set mode (recorded for review; nothing is refused on it). */
export function houseTapPlausibility(mode: HouseSetMode, matchId: string, taps: readonly unknown[], v?: number): { hits: number; spreadMs: number | null; flagged: boolean } {
  return HOUSE_SET_RULES[mode].plausibility(matchId, taps, v);   // MUSIC-SUITE P9 FIX PASS: `v` — the attempt's recorded version (dance)
}

// ── MUSIC-SUITE P9 (2026-09-29): the table — everything that differs between a music duel and a dance duel ─────────────
/**
 * One row per house-set mode. Music's row is exactly what P6 inlined (houseBeatFor / judgeHouseSet / parseHouseTaps and its
 * words); dance's reads lib/babylon/dance/houseSong.ts. The house set is always rebuilt from the MATCH ID — never from
 * anything the room sends — so a list is judged on the duel's own song or beat.
 */
export const HOUSE_SET_RULES: Readonly<Record<HouseSetMode, HouseSetRules>> = {
  music: {
    mode: 'music', start: MUSIC_ATTEMPT_START, finish: MUSIC_ATTEMPT_FINISH,
    parse: (matchId, raw) => parseHouseTaps(houseBeatFor(matchId), raw),
    judge: (matchId, taps) => judgeHouseSet(houseBeatFor(matchId), taps as HouseTap[]).score,
    summary: (matchId) => houseBeatSummary(houseBeatFor(matchId)),
    summaryKey: 'beat',
    countInMs: (matchId) => houseCountInMs(houseBeatFor(matchId)),
    setMs: (matchId) => houseSetMs(houseBeatFor(matchId)),
    minFinishMs: (matchId) => houseMinFinishMs(houseBeatFor(matchId)),
    rules: HOUSE_ARENA_RULES,
    legacy: {
      code: 'PRE_HOUSE_BEAT', reason: PRE_HOUSE_BEAT_REASON,
      atStart: "Your opponent's score in this duel is from before the house beat, so a set can't be settled against it: both stakes were refunded.",
      atSubmit: "Your opponent's score in this duel is from before the house beat, so the two can't be compared: both stakes were refunded.",
    },
    noAttempt: 'No set was played for this duel: an Arena music score comes from its one recorded attempt. The score was not recorded and nothing was settled.',
    plausibility: (matchId, taps) => musicTapPlausibility(matchId, taps as HouseTap[]),
  },
  dance: {
    mode: 'dance', start: DANCE_ATTEMPT_START, finish: DANCE_ATTEMPT_FINISH,
    // MUSIC-SUITE P9 FIX PASS (2026-09-29): every dance row builds its song through danceSongOf — the attempt's own
    // house-song version (the current one for a new start), its chart checked against the print that version pins
    parse: (matchId, raw, v) => {
      const p = parseDancePresses(danceSongOf(matchId, v), raw);
      return p.ok ? { ok: true, taps: p.presses } : p;
    },
    judge: (matchId, taps, v) => judgeDanceSet(danceSongOf(matchId, v), taps as HousePress[]).score,
    verify: (matchId, attempt) => {
      const h = danceSongOf(matchId, attempt.recorded?.v);
      if (!houseChartMatches(h, attempt.recorded?.chart)) {
        throw new HouseChartDrift(`duel ${matchId}: its start recorded chart ${attempt.recorded?.chart}, "${h.songId}" v${h.v} builds another — not judged`);
      }
    },
    summary: (matchId) => houseSongSummary(danceSongOf(matchId)),
    summaryKey: 'song',
    countInMs: (matchId) => houseSongCountInMs(danceSongOf(matchId)),
    setMs: (matchId) => houseSongSetMs(danceSongOf(matchId)),
    minFinishMs: (matchId) => houseSongMinFinishMs(danceSongOf(matchId)),
    rules: DANCE_ARENA_RULES,
    legacy: {
      code: 'PRE_HOUSE_SONG', reason: PRE_HOUSE_SONG_REASON,
      atStart: "Your opponent's score in this duel is from before the house song, so a set can't be settled against it: both stakes were refunded.",
      atSubmit: "Your opponent's score in this duel is from before the house song, so the two can't be compared: both stakes were refunded.",
    },
    noAttempt: 'No set was danced for this duel: an Arena dance score comes from its one recorded attempt. The score was not recorded and nothing was settled.',
    plausibility: (matchId, taps, v) => dancePressPlausibility(danceSongOf(matchId, v), taps as HousePress[]),
  },
};

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): a dance duel's house song on version `v` (the current one when absent), its chart
 * held to the print that version pins (houseSong.ts assertHouseChart — throws HouseChartDrift rather than build a song the
 * duel was not started on). Hoisted below the table on purpose: every row calls it at request time, never at import.
 */
function danceSongOf(matchId: string, v?: number): HouseSong {
  const h = houseSongFor(matchId, v ?? HOUSE_SONG_VERSION);
  assertHouseChart(h);
  return h;
}

/** The house-set rules of a duel's mode (either spelling), or null for a mode with no house set. */
export function houseSetRulesFor(mode: string | null | undefined): HouseSetRules | null {
  const m = houseSetModeOf(mode);
  return m ? HOUSE_SET_RULES[m] : null;
}
