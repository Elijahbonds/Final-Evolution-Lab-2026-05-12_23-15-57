/**
 * lib/session-payout.ts — what one POST /api/sessions pays, decided on the server. PURE: no DB, no network, no Babylon.
 *
 * MUSIC-SUITE P2 (2026-09-25) — "On the beat, and honest". Measured in app/api/sessions/route.ts before this change:
 *
 *   1. NO CEILING ON AN ENDLESS RUN. XP = 1.5 × score and profile shards = score / 20, with nothing above them
 *      (route.ts:64-65). The Groove Academy's PERFORM free play has no end — it runs until END SET (performSet.ts:10-13;
 *      `maxNotes` is Infinity outside an Arena set, :68; `over()` is never true for it, :115-118) — and each hit pays
 *      100 × (1 + floor(combo / 5)) (performSet.ts:31-33), which grows with the square of an unbroken run. A perfect
 *      5-minute set at 92 BPM is about 1,840 notes and 34M points: about 51M XP and 1.7M profile shards in one session.
 *      Owner decision #14: a per-session XP/shard ceiling for ENDLESS modes only; scored games with an end card are
 *      untouched. ENDLESS_MODES below lists the endless ones with their evidence, and names the candidates that are not.
 *
 *   2. ONE TAP WON A MUSIC SET. StudioMode.tsx:367 reported `won: score > 0`, and every win paid +15 LC (route.ts:68),
 *      +50 XP and +3 profile shards (:64-65), the wallet's won shards (wallet-service.ts:251 reads the row's `won`) and
 *      +120 season XP (season-pass-core.ts:132-139). Owner decision #13: a set is won at grade C or better — accuracy
 *      >= 0.5 — over at least 8 bars. The server reads it from the set's own counts (the SHARED CONTRACT below), never
 *      from the client's `won` alone, and a set that arrives without those counts is not a win.
 *
 *   3. (lib/prq.ts) dance and music trained only 'mental' off a score that saturates at 100; sessionAccuracy() below is
 *      the accuracy they are scaled by now.
 *
 * THE SHARED CONTRACT (phase 2; the music room and this server both rely on it). A room's end-of-session stats travel as
 * GameResult.stats (components/games/game-shell.tsx:34) and reach this route as the body's `stats` — the name the
 * offline queue's payload already gives them (lib/offline-cache.ts:40). The music room's stats carry
 *   { bars, notes, hits, perfects, goods, misses, accuracy (0..1 = (perfects + 0.5 × goods) / notes),
 *     grade ('S'|'A'|'B'|'C'|'D'), maxCombo, arena: boolean }.
 * The server RECOMPUTES accuracy and grade from the counts; the claimed `accuracy` and `grade` are read for nothing (a
 * mismatch is logged as an issue, never believed). The dance room keeps the stats it sends today (DanceMode.ts:228-240:
 * perfect / great / good / miss, accuracy 0..100), and its accuracy is recomputed from those counts with DanceCore's own
 * weights. Any room whose run has no length of its own (the dance room's free-dance toggle, P9) says so with
 * `endless: true` (or 1): declaring it can only lower what the session pays, so it is safe to believe.
 *
 * MUSIC-SUITE P2 FIX PASS (2026-09-25) — what the phase review found in the rules above, and what changed:
 *
 *   A. THE ROUTE REFUSED EVERY HONEST MUSIC WIN. The only caller, components/games/game-shell.tsx handleEnd (:202-214),
 *      posts mode / score / won / duration / tallies / maxCombo / played and NOT `stats` (a file another lane holds), so
 *      stats were always null: every music win refused (the card said "set won", the recap paid +10 XP instead of +50,
 *      no +15 LC, no +3 shards, no +120 season XP, and the wallet logged the shell's mode_session_won as an anti-cheat
 *      refusal against an honest player), and every dance and music run trained PRQ 0. Until the shell forwards the
 *      stats, a session that arrives WITHOUT them is a client that predates the contract: its music `won` is the room's
 *      own (StudioMode applies performSetWon itself), and PRQ takes the old score path. ROOM_STATS_FORWARDED flips this
 *      the day the shell change lands (session-payout.test.ts reads game-shell.tsx and fails until it is flipped).
 *   B. `?arena=<anything>` LIFTED THE CEILING. An Arena set was believed from `stats.arena`, which the room sets from the
 *      bare query string (app/play/music/_components/loader.tsx:68), while music staking is paused (decision #9) — up to
 *      3,970,700 XP / 132,358 shards for a set nobody staked. An Arena set is now uncapped only when the route has
 *      VERIFIED its match (the body's arenaMatchId is a music duel this player is in: `arenaVerified`), and its score can
 *      never exceed what its own hits allow (sessionScoreCap: a forged 1e9 on 16 hits paid 1,500,000,050 XP).
 *   C. ONE TAP AFTER EIGHT SILENT BARS WON AN S. The room counted rest bars; it no longer does (performSet.ts), and the
 *      server refuses a set whose `bars` outnumber its judged notes (a counted bar offered a note).
 *   D. A MODE STRING THE CATALOGUE DOES NOT KNOW WAS UNCAPPED AND KEPT ITS WIN: 'Music' (or any key) skipped both the
 *      music rules and the ceiling. A mode that is not a catalogue key (MODE_INFO, after canonicalModeKey) is now paid as
 *      an endless run and wins nothing; every GameShell key is one (the test walks them). A finite mode's score is also
 *      held to its own derived maximum where the rules give one (arena-score-integrity SCORE_CEILINGS 'rules' rows): no
 *      honest run exceeds it, so decision #14's "finite untouched" holds for real play.
 *   E. THE CEILING WAS REACHED IN ABOUT 5 SECONDS. Music's quadratic combo passes 9,433 points after 29 perfect notes,
 *      so every free-play set longer than ~5 s paid the same flat ceiling and back-to-back 5 s sets paid ~12× a minute
 *      what the ceiling's own basis (a flawless training MINUTE) pays. The ceiling is now that minute's pay prorated by
 *      the session's length (endlessCeilingFor). OWNER CALL: decision #14 said "per-session"; proration keeps that letter
 *      and closes the farm — flagged in the phase report for confirmation.
 *
 * MUSIC-SUITE P3 (2026-09-25) — "Keep my work": STUDIO time counts toward the daily streak (PLAN.md, defaults taken: "a
 * save or render logs a no-score creation session, no XP"). A CREATION session is POST /api/sessions with a music mode,
 * score 0 and metadata.kind 'creation' (section 4 below). Measured against the rules above before this change, such a
 * post did nothing at all — sessionHasPlay() refused it as idle (score 0, no win, no tally: session-evidence.ts:26-30) —
 * and had it got past that, the P2 endless floor would have paid it (endlessCeilingFor never pays under sessionXp(0) =
 * 10 XP and sessionShards(0) = 1 shard; music free play is endless). The daily streak itself was computed inline in
 * the route (route.ts:135-146, moved to streakStep() below unchanged for every play session).
 */

import { canonicalModeKey, MODE_INFO } from '@/lib/game-data';
import { scoreCeilingFor, killSwitchOn, SCORE_CEILINGS } from '@/lib/arena-score-integrity';
import { performSetMax } from '@/lib/babylon/music/performSet';

/**
 * Does the shell forward the room's `stats` to POST /api/sessions yet? NO (components/games/game-shell.tsx is held by
 * another lane; the request is in the phase report). While false, a session with no stats is an old-contract client:
 * its music win is its own claim (the room applies the rule itself) and dance/music PRQ uses the score. Flip to true in
 * the same commit that makes the shell send `stats` — session-payout.test.ts reads the shell and holds the two together.
 */
export const ROOM_STATS_FORWARDED = false;

/** Is this a mode the catalogue knows (after an old spelling is mapped)? Anything else is paid as endless and wins nothing. */
export function isCatalogueMode(mode: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODE_INFO, canonicalModeKey(mode));
}

// ---------------------------------------------------------------------------
// The payout formula (moved here unchanged from app/api/sessions/route.ts:64-68)
// ---------------------------------------------------------------------------

/** Lab Credits a won session pays (route.ts:68, "hero-mode win +15 LC"). */
export const SESSION_WIN_LC = 15;

/** Profile XP before any ceiling: 1.5 × score, +50 on a win (+10 otherwise), never under 5. */
export function sessionXp(score: number, won: boolean): number {
  return Math.max(5, Math.round(score * 1.5) + (won ? 50 : 10));
}

/** Profile shards before any ceiling: score / 20 (at least 1), +3 on a win. */
export function sessionShards(score: number, won: boolean): number {
  return Math.max(1, Math.floor(score / 20)) + (won ? 3 : 0);
}

// ---------------------------------------------------------------------------
// 1. The endless ceiling
// ---------------------------------------------------------------------------

/**
 * What one session of an ENDLESS mode may pay at most: exactly what the best-paying finite game pays for a flawless win.
 *
 * DERIVATION (lib/session-payout.test.ts re-derives it and fails the day it drifts): lib/arena-score-integrity.ts
 * SCORE_CEILINGS is the one place FEL derives each finite mode's maximum from its own rules ('rules' rows: first to 11,
 * five racks of five, four dunks of 60, the training minute...). Paid through sessionXp / sessionShards as a win, those
 * maxima range from tennis (4 games → 56 XP, 4 shards) to Iron Paradise (training: the most reps the power bar allows in
 * 60 s, each perfect on a streak, 9,400 points → 14,150 XP, 473 shards). The two music rooms are left out: their rows
 * bound the longest chart an exported song can hold (dance, 79,680) and a quadratic combo over 512 notes (music, 2,647,100)
 * rather than a game's own clock or target — counting them would set the ceiling at 119,570 or 3,970,700 XP, which is no
 * ceiling. So an endless run pays, at most, what a flawless training minute pays; a strong real run of The Hundred (the
 * 4,000 "strong run" of lib/babylon/core/scoreScale.ts:64-66 → 6,010 XP) is under it and pays exactly what it did.
 * assumption: the finite modes outside the Arena table (sprint, volleyball, the racers, showdown...) have no derived
 * maximum; none of them counts in thousands the way training does.
 */
export const ENDLESS_SESSION_CEILING = { xp: 14_150, shards: 473 } as const;

/** The ceiling's basis is a flawless training MINUTE: an endless session pays at most that minute's pay per minute. */
export const ENDLESS_CEILING_BASIS_SEC = 60;

/**
 * MUSIC-SUITE P2 FIX PASS: what an endless session of `durationSec` may pay at most — ENDLESS_SESSION_CEILING prorated by
 * its length (full from a minute on), and never under what a session with no score pays (a short honest set still gets
 * its base and its win bonus). Twelve 5-second sets now pay what one flawless minute does, not twelve times it.
 */
export function endlessCeilingFor(durationSec: number, won: boolean): { xp: number; shards: number } {
  const d = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0;
  const frac = Math.min(1, d / ENDLESS_CEILING_BASIS_SEC);
  return {
    xp: Math.max(sessionXp(0, won), Math.round(ENDLESS_SESSION_CEILING.xp * frac)),
    shards: Math.max(sessionShards(0, won), Math.floor(ENDLESS_SESSION_CEILING.shards * frac)),
  };
}

/** Where ENDLESS_SESSION_CEILING comes from, in a phrase (for logs and the phase report). */
export const ENDLESS_CEILING_BASIS =
  'a flawless Iron Paradise win (training 9,400 → 14,150 XP, 473 shards): the best-paying finite rules-mode maximum in '
  + 'lib/arena-score-integrity.ts SCORE_CEILINGS, the music rooms left out';

/**
 * The modes whose runs have no end of their own, with the code that says so. Everything not listed here is a scored game
 * that ends itself (a clock, a target, a course, a race) and is paid exactly as before.
 *
 * Looked at and NOT endless (MUSIC-SUITE P2, 2026-09-25):
 *   - sprint: a 100 m race — SprintCore finishes at raceDistanceM (lib/feel/cores/sprint-core.ts:169; 100 m,
 *     sprint-constants.ts:27).
 *   - freerun: the run is capped at RUN_CAP_PAR × par (lib/babylon/modes/FreeRunMode.ts:63, :850-853) or ends at the
 *     course's finish.
 *   - carnival: a Game Night is EVENTS_PER_NIGHT (4) events, each on its own clock (lib/babylon/core/CarnivalNight.ts:4;
 *     the event clocks are mirrored in lib/arena-score-integrity.ts MIRRORED.*Sec).
 *   - football, snowboarding: untimed but ended by their rules — 3 drives (FootballRushMode.ts:107), the last gate.
 *   - skateboarding, surfing: RUN_SEC 90 (arena-score-integrity MIRRORED.skateRunSec / surfRunSec).
 *   - velocityKart, aeroAces: races of course.laps laps (VelocityKartMode.ts:998, AeroAcesMode.ts:370).
 *   - dance: a song has an end (DanceMode finish(), :205-241). Its free-dance toggle (owner decision #3) is not built yet;
 *     when it is, it sends stats.endless (see the header) and is capped by that, not by this table.
 */
export const ENDLESS_MODES: Readonly<Record<string, string>> = {
  music:
    'Groove Academy PERFORM free play runs until END SET: performSet.ts:10-13 ("free play stays endless"), maxNotes '
    + 'Infinity outside an Arena set (:68), over() never true (:115-118); StudioMode.tsx:106,112. An Arena set '
    + '(stats.arena, at most PERFORM_SET_BARS bars, its match VERIFIED by the route — P2 fix pass) ends itself after 32 '
    + 'bars and is NOT capped.',
  karateEndless:
    'The Hundred: waves never stop (no wave cap anywhere in KarateEndlessMode.ts); the run ends only when the fighter is '
    + 'out after MAX_REVIVES (:171, :1322-1339, :1628-1631). lib/story-yardstick.ts:60-64: "Endless — every run ends on '
    + 'defeat", ceiling null; the Arena bounds it only by a 30-minute model (arena-score-integrity karateEndlessBound).',
};

/** An Arena music set is this many bars (lib/babylon/music/performSet.ts PERFORM_SET_BARS; the test holds the mirror). */
export const ARENA_SET_BARS = 32;

// ---------------------------------------------------------------------------
// Reading a room's stats
// ---------------------------------------------------------------------------

export type RoomStats = Readonly<Record<string, unknown>>;

/** The room's stats from a POST body: `stats` (GameResult.stats), or `metadata` from a client that calls them that. A
 *  plain object only — anything else is no stats. */
export function roomStats(body: unknown): RoomStats | null {
  const b = body as { stats?: unknown; metadata?: unknown } | null | undefined;
  const raw = b?.stats ?? b?.metadata;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as RoomStats) : null;
}

/** A count: a finite number >= 0, floored. Anything else is absent (null). */
function count(v: unknown): number | null {
  if (typeof v === 'boolean' || v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** A flag that may arrive as a boolean (StudioMode's stats) or a number (ModeHarness stats are numbers). */
function flag(v: unknown): boolean {
  return v === true || v === 1;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

// ---------------------------------------------------------------------------
// Grades and accuracy
// ---------------------------------------------------------------------------

export type SetGrade = 'S' | 'A' | 'B' | 'C' | 'D';

/** The grade bands the dance room already uses (danceTracks.ts gradeFor, = DanceCore starsFor): S 95 %, A 85 %, B 70 %,
 *  C 50 %. The test holds the two equal across the whole range. */
export function setGrade(accuracy: number): SetGrade {
  const a = clamp01(accuracy);
  if (a >= 0.95) return 'S';
  if (a >= 0.85) return 'A';
  if (a >= 0.7) return 'B';
  if (a >= 0.5) return 'C';
  return 'D';
}

/** The music set's accuracy (the SHARED CONTRACT): PERFECT counts 1, GOOD a half, over every note offered. 0 with none. */
export function musicAccuracy(c: { perfects: number; goods: number; notes: number }): number {
  return c.notes > 0 ? clamp01((c.perfects + 0.5 * c.goods) / c.notes) : 0;
}

/** Owner decision #13: grade C or better … */
export const MUSIC_WIN_ACCURACY = 0.5;
/** … over at least 8 bars. */
export const MUSIC_WIN_MIN_BARS = 8;
/**
 * No bar can be played faster than this: 4 beats at 240 BPM, 1.5 × the Academy's fastest tempo (the BPM slider tops out
 * at 160, StudioMode.tsx:484) so a later, faster slider does not make honest sets fail. A set's `bars` must fit inside
 * its `duration` at this pace (+ one bar for the whole-second rounding of duration).
 */
export const MUSIC_FASTEST_BAR_SEC = 1;
/** A sanity bound, not a rule: 16 steps × 16 rows — more notes than any bar of the sequencer can hold. */
export const MUSIC_MAX_NOTES_PER_BAR = 256;

export interface MusicSetRead {
  bars: number;
  notes: number;
  perfects: number;
  goods: number;
  hits: number;
  misses: number | null;
  maxCombo: number | null;
  /** Recomputed from the counts — never the claimed number. */
  accuracy: number;
  grade: SetGrade;
  /** The stats claim an Arena set, the set is no longer than one, and its counts can be true. */
  arena: boolean;
  /** False when a count the verdict stands on cannot be true (more hits than notes, more bars than the time allows). */
  ok: boolean;
  /** Every inconsistency found, including the ones the verdict does not stand on (for the log). */
  issues: string[];
}

/**
 * The music set as the server reads it: null when the stats do not carry the counts a verdict needs (bars, notes,
 * perfects, goods). Accuracy and grade are recomputed; a claimed accuracy or grade that disagrees is an issue, not a fact.
 */
export function readMusicSet(stats: RoomStats | null, durationSec: number): MusicSetRead | null {
  if (!stats) return null;
  const bars = count(stats.bars), notes = count(stats.notes), perfects = count(stats.perfects), goods = count(stats.goods);
  if (bars === null || notes === null || perfects === null || goods === null) return null;
  const misses = count(stats.misses), maxCombo = count(stats.maxCombo), claimedHits = count(stats.hits);
  const hits = perfects + goods;
  const issues: string[] = [];
  let ok = true;

  // what the verdict stands on
  if (hits > notes) { ok = false; issues.push(`${hits} hits of ${notes} notes`); }
  // MUSIC-SUITE P2 FIX PASS: a bar counts only when it offered a note (performSet.ts), so every counted bar has one
  if (bars > notes) { ok = false; issues.push(`${bars} bars with a note, but ${notes} notes`); }
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const barsTheTimeAllows = Math.floor(dur / MUSIC_FASTEST_BAR_SEC) + 1;
  if (bars > barsTheTimeAllows) { ok = false; issues.push(`${bars} bars in ${dur} s (at most ${barsTheTimeAllows})`); }
  // (+ the bar under way: the room counts WHOLE bars, so a set ended mid-bar has notes past its last whole one)
  if (notes > (bars + 1) * MUSIC_MAX_NOTES_PER_BAR) { ok = false; issues.push(`${notes} notes in ${bars} bars`); }

  // what it does not (logged, never refused on: a room that counts `hits` differently must not lose an honest win)
  if (claimedHits !== null && claimedHits !== hits) issues.push(`hits ${claimedHits} ≠ perfects + goods ${hits}`);
  if (misses !== null && hits + misses > notes) issues.push(`${hits} hits + ${misses} misses of ${notes} notes`);
  if (maxCombo !== null && maxCombo > hits) issues.push(`maxCombo ${maxCombo} > ${hits} hits`);

  const accuracy = ok ? musicAccuracy({ perfects, goods, notes }) : 0;
  const claimed = typeof stats.accuracy === 'number' ? stats.accuracy : null;
  if (claimed !== null && Math.abs(claimed - accuracy) > 0.005) issues.push(`claimed accuracy ${claimed} ≠ ${accuracy.toFixed(3)}`);
  const grade = setGrade(accuracy);
  if (typeof stats.grade === 'string' && stats.grade !== grade) issues.push(`claimed grade ${stats.grade} ≠ ${grade}`);

  // an Arena set is the one music set with an end of its own (not capped): it must be no longer than one, from counts
  // that can be true — a claimed `arena` on anything else is free play
  const arena = ok && flag(stats.arena) && bars <= ARENA_SET_BARS;
  if (flag(stats.arena) && bars > ARENA_SET_BARS) issues.push(`an Arena set of ${bars} bars (an Arena set is ${ARENA_SET_BARS})`);

  return { bars, notes, perfects, goods, hits, misses, maxCombo, accuracy, grade, arena, ok, issues };
}

/** Owner decision #13, the server's half: accuracy >= 0.5 over >= 8 bars, from counts that can be true. Mirrors the room. */
export function musicSetWon(read: MusicSetRead | null): boolean {
  return !!read && read.ok && read.accuracy >= MUSIC_WIN_ACCURACY && read.bars >= MUSIC_WIN_MIN_BARS;
}

/** DanceCore.accuracyOf's weights (DanceCore.ts:533-537), mirrored so this route never imports the dance judge; the test
 *  holds the mirror to the real function. */
export const DANCE_ACCURACY_WEIGHTS = { perfect: 1, great: 0.75, good: 0.4 } as const;

/** The dance run's accuracy from the counts it sends today (DanceMode.ts:234-237), or null when it sent none. */
export function readDanceAccuracy(stats: RoomStats | null): number | null {
  if (!stats) return null;
  const p = count(stats.perfect), g = count(stats.great), d = count(stats.good), m = count(stats.miss);
  if (p === null && g === null && d === null && m === null) return null;
  const P = p ?? 0, G = g ?? 0, D = d ?? 0, M = m ?? 0;
  const judged = P + G + D + M;
  const w = DANCE_ACCURACY_WEIGHTS;
  return judged === 0 ? 0 : clamp01((P * w.perfect + G * w.great + D * w.good) / judged);
}

// ---------------------------------------------------------------------------
// The session's verdicts
// ---------------------------------------------------------------------------

/**
 * The session's `won`. Music: the room must say won AND the server's own reading of the set must agree (a missing or
 * impossible read is not a win). The room's rule is the same rule, so the two only differ on a bug or a forged body — and
 * then the answer is the one that pays less: a set the rules do not win is never paid as a win, and a card that told the
 * player "not won" is never contradicted by a win bonus. Every other mode: the client's claim, exactly as before.
 */
export function sessionWon(
  mode: string, claimedWon: boolean, stats: RoomStats | null, durationSec: number,
  opts: { score?: number; statsForwarded?: boolean } = {},
): boolean {
  if (!isCatalogueMode(mode)) return false;                  // P2 FIX PASS (D): no rules to win by
  if (canonicalModeKey(mode) === 'music') {
    // P2 FIX PASS (A): a client that predates the contract sent no stats at all — its room applied the rule itself, and
    // a won set always scored (a hit is at least 50 points)
    if (!stats && !(opts.statsForwarded ?? ROOM_STATS_FORWARDED)) return claimedWon && (opts.score ?? 0) > 0;
    return claimedWon && musicSetWon(readMusicSet(stats, durationSec));
  }
  return claimedWon;
}

/** The accuracy (0..1) PRQ scales dance and music by (lib/prq.ts), or null when the room sent no counts to read it from. */
export function sessionAccuracy(mode: string, stats: RoomStats | null, durationSec: number): number | null {
  const m = canonicalModeKey(mode);
  if (m === 'music') {
    const read = readMusicSet(stats, durationSec);
    return read && read.ok ? read.accuracy : null;
  }
  if (m === 'dance') return readDanceAccuracy(stats);
  return null;
}

/**
 * Is this session a run with no end of its own? A room's own `endless` flag, an ENDLESS_MODES row, a mode the catalogue
 * does not know — and for music, every set but a VERIFIED Arena set: the stats claim one no longer than ARENA_SET_BARS
 * AND the route found its match (`arenaVerified`: the body's arenaMatchId is a music duel this player is in). P2 FIX PASS
 * (B): the claim alone came from the bare ?arena= query and lifted the ceiling while music staking is paused.
 */
export function isEndlessSession(mode: string, stats: RoomStats | null, durationSec: number, opts: { arenaVerified?: boolean } = {}): boolean {
  if (stats && flag(stats.endless)) return true;
  if (!isCatalogueMode(mode)) return true;                   // P2 FIX PASS (D)
  const m = canonicalModeKey(mode);
  if (m === 'music') return !(opts.arenaVerified === true && readMusicSet(stats, durationSec)?.arena);
  return Object.prototype.hasOwnProperty.call(ENDLESS_MODES, m);
}

/**
 * P2 FIX PASS (B, D): the most this session's score can honestly be, or null when nothing bounds it here (the endless
 * ceiling still caps what it pays).
 *   - music: what its own hits allow (every hit PERFECT in one combo, performSetMax), and a verified Arena set no more than
 *     the Arena's ceiling; no readable counts, no bound from them.
 *   - a mode whose rules give a maximum (SCORE_CEILINGS kind 'rules', dance included): that maximum — except where the
 *     kill switch mounts a fallback game on another scale (killSwitchOn, the Arena's own rule).
 *   - anything else: null.
 */
export function sessionScoreCap(mode: string, stats: RoomStats | null, durationSec: number, opts: { arenaVerified?: boolean; killSwitch?: boolean } = {}): number | null {
  if (!isCatalogueMode(mode)) return null;
  const m = canonicalModeKey(mode);
  if (m === 'music') {
    const read = readMusicSet(stats, durationSec);
    if (!read) return null;
    const own = performSetMax(read.hits);
    return opts.arenaVerified === true && read.arena ? Math.min(own, SCORE_CEILINGS.music.max) : own;
  }
  const c = scoreCeilingFor(m);
  if (!c || c.kind !== 'rules') return null;
  if ((opts.killSwitch ?? killSwitchOn()) && c.swapsUnderKillSwitch) return null;
  return c.max;
}

export interface SessionPayout {
  xp: number;
  shards: number;
  /** The win's Lab Credits (the daily streak's are the route's). */
  winCredits: number;
  /** The endless ceiling took something off XP or shards. */
  capped: boolean;
}

/**
 * What the session pays: the old formula, and for an endless run at most ENDLESS_SESSION_CEILING — prorated by the
 * session's length when `durationSec` is given (P2 FIX PASS E, endlessCeilingFor). Without it, the flat ceiling.
 * MUSIC-SUITE P3: a CREATION session pays CREATION_PAYOUT (nothing) whatever else it says — the endless floor
 * (endlessCeilingFor pays at least a no-score session's 10 XP / 1 shard) is for a set that was PLAYED, not a save.
 */
export function sessionPayout(o: { score: number; won: boolean; endless: boolean; durationSec?: number; kind?: SessionKind }): SessionPayout {
  if (o.kind === 'creation') return { ...CREATION_PAYOUT };
  const xpRaw = sessionXp(o.score, o.won), shardsRaw = sessionShards(o.score, o.won);
  const cap = o.durationSec === undefined ? ENDLESS_SESSION_CEILING : endlessCeilingFor(o.durationSec, o.won);
  const xp = o.endless ? Math.min(xpRaw, cap.xp) : xpRaw;
  const shards = o.endless ? Math.min(shardsRaw, cap.shards) : shardsRaw;
  return { xp, shards, winCredits: o.won ? SESSION_WIN_LC : 0, capped: xp < xpRaw || shards < shardsRaw };
}

// ---------------------------------------------------------------------------
// 4. The daily streak, and the CREATION session (MUSIC-SUITE P3, 2026-09-25)
// ---------------------------------------------------------------------------

/**
 * The daily streak, moved here UNCHANGED from app/api/sessions/route.ts:135-146 ("daily streak +5*day (cap day 7)"):
 * a session 24 h or more after the profile's lastStreakAt opens the next streak day — day + 1 if it came within 48 h,
 * back to day 1 otherwise — and pays STREAK_LC_PER_DAY × that day in Lab Credits. The "day" is this rolling 24 h window
 * from lastStreakAt, not a calendar day (a later reader must not assume UTC midnight).
 */
export const STREAK_DAY_MS = 24 * 60 * 60 * 1000;
export const STREAK_LC_PER_DAY = 5;
export const STREAK_CAP_DAYS = 7;

/** 'play' is every session this route has always taken; 'creation' is a Studio save / render (isCreationSession). */
export type SessionKind = 'play' | 'creation';

/** The metadata.kind a creation session carries (the P3 client contract). */
export const CREATION_SESSION_KIND = 'creation';

/** What a creation session pays: nothing — no XP, no profile shards, no Lab Credits (and it is never a win). */
export const CREATION_PAYOUT: Readonly<SessionPayout> = { xp: 0, shards: 0, winCredits: 0, capped: false };

/**
 * Is this POST a CREATION session — a Studio save or render, not a set? A music mode (after canonicalModeKey, so the old
 * 'musicAcademy' key too), a score of exactly 0, and metadata.kind === 'creation' (stats.kind is read the same way,
 * because roomStats() treats `stats` and `metadata` as one bag). Anything else — another kind, a non-zero score, any
 * other mode — is a play session under today's rules. Believing the label can only lower what a session pays (a
 * creation pays nothing), so it is safe to believe; what it can buy is the streak day, which is the feature.
 * assumption: the server cannot see studio time, so a client that posts one creation a day keeps a streak alive with
 * no play at all — bounded to one streak day a day, and the streak's Lab Credits are still only paid on a day with play.
 */
export function isCreationSession(mode: string, score: number, body: unknown): boolean {
  if (canonicalModeKey(mode) !== 'music' || score !== 0) return false;
  const b = body as { metadata?: unknown; stats?: unknown } | null | undefined;
  const kindOf = (bag: unknown): unknown => (bag && typeof bag === 'object' && !Array.isArray(bag) ? (bag as { kind?: unknown }).kind : undefined);
  return (kindOf(b?.metadata) ?? kindOf(b?.stats)) === CREATION_SESSION_KIND;
}

/** The profile fields the streak reads (PlayerProfile.streakDays / lastStreakAt / lastActiveAt). */
export interface StreakProfile {
  streakDays?: number | null;
  lastStreakAt?: Date | string | number | null;
  lastActiveAt?: Date | string | number | null;
}

export interface StreakStep {
  /** 24 h or more since lastStreakAt: this session opens the next streak day (the profile's lastStreakAt moves to now). */
  due: boolean;
  /** The profile's streakDays after this session. */
  streakDays: number;
  /** Lab Credits this session pays for the streak. Always 0 for a creation session. */
  streakBonus: number;
  /** A play session paying the streak day a creation session opened without paying (see streakStep). */
  owed: boolean;
}

const timeOf = (v: Date | string | number | null | undefined): number => (v === null || v === undefined ? NaN : new Date(v).getTime());

/**
 * Did a creation session open the current streak day, with no play since? Every play session writes lastActiveAt and
 * lastStreakAt from ONE timestamp (route.ts), so after any play lastActiveAt >= lastStreakAt; a creation session moves
 * lastStreakAt and leaves lastActiveAt alone, so lastActiveAt < lastStreakAt says exactly "creation opened this day,
 * nobody has played in it yet". (A new profile has both at its insert's now(): equal, not owed. The only other writer
 * of lastActiveAt — a finished lesson, app/api/education/complete/route.ts:45 — moves it forward, which ends the debt:
 * that day then pays no streak Lab Credits, which is what today's rules paid a creation-first day anyway.)
 */
export function creationOpenedStreakDay(p: StreakProfile | null | undefined): boolean {
  const active = timeOf(p?.lastActiveAt), streak = timeOf(p?.lastStreakAt);
  return Number.isFinite(active) && Number.isFinite(streak) && active < streak && (p?.streakDays ?? 0) >= 1;
}

/**
 * One session's step of the daily streak.
 *
 *   play      exactly today's rule (route.ts:135-146) — plus one case that cannot arise without creation sessions: the
 *             first play inside a streak day a creation session opened pays that day's STREAK_LC_PER_DAY × day. Without
 *             it, making music first would cost the player the day's streak Lab Credits (the creation paid none, and
 *             the day was no longer due for the play) — a Studio that COST Lab Credits. With it, a creation never
 *             changes what any play session pays: the play pays what it would have paid had the creation not come
 *             first (same streak day, same bonus).
 *   creation  counts toward the streak exactly as a play would (due → day + 1, or day 1 after a gap) and pays nothing.
 *             Not due (the day already counts — a play or an earlier creation) → nothing at all: the route answers 200
 *             and writes nothing, so a Studio that posts on every save is accepted once a streak day.
 */
export function streakStep(p: StreakProfile | null | undefined, nowMs: number, kind: SessionKind = 'play'): StreakStep {
  const days = p?.streakDays ?? 0;
  // route.ts's own expressions: a missing lastStreakAt is the epoch (due, a restart), an unreadable one is never due
  const lastStreak = new Date(p?.lastStreakAt ?? 0).getTime();
  const daysSince = Math.floor((nowMs - lastStreak) / STREAK_DAY_MS);
  if (daysSince >= 1) {
    const streakDays = daysSince === 1 ? Math.min(days + 1, STREAK_CAP_DAYS) : 1;
    return { due: true, streakDays, streakBonus: kind === 'creation' ? 0 : STREAK_LC_PER_DAY * streakDays, owed: false };
  }
  if (kind === 'play' && creationOpenedStreakDay(p)) {
    const streakDays = Math.min(days, STREAK_CAP_DAYS);
    return { due: false, streakDays: days, streakBonus: STREAK_LC_PER_DAY * streakDays, owed: true };
  }
  return { due: false, streakDays: days, streakBonus: 0, owed: false };
}

/**
 * MUSIC-SUITE P3 FIX PASS (2026-09-25): when a creation session that did NOT count may next count — the streak day opens
 * STREAK_DAY_MS after lastStreakAt (streakStep's rolling window). The Academy used to take any 200 as "today is done" and
 * stopped posting for the rest of the local day, so a creation answered "not yet" at 10:00 was never tried again at
 * 22:00, when the day had opened (a Studio-only player lost streak days). The route returns this with every no-op; the
 * client waits until then. `lostRace` = the day was due but another request counted it a moment ago (so it is a day from
 * now). null = it counted.
 */
export function creationNextDueAt(p: StreakProfile | null | undefined, nowMs: number, o: { counted: boolean; due: boolean }): number | null {
  if (o.counted) return null;
  if (o.due) return nowMs + STREAK_DAY_MS;                                     // lost the race to a post that just counted
  const last = new Date(p?.lastStreakAt ?? 0).getTime();
  return Number.isFinite(last) ? last + STREAK_DAY_MS : nowMs + STREAK_DAY_MS;
}
