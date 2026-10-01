/**
 * lib/arena-reclaim.ts — the reclaim sweep for Arena duels past their expiry (MUSIC-SUITE P6, 2026-09-26; owner decision
 * #30, musicsuite/DECISIONS-2.md: "Stale duels: YES, ALL MODES — past expiresAt, unaccepted duels refund the creator;
 * active duels refund whoever didn't play, or settle to the one side that scored; ledger-logged, tested, run on read + a
 * scheduled route").
 *
 * WHAT WAS WRONG (musicsuite/p1/STAKING-PAUSE.md 'Expiry'): nothing expired an Arena duel, in any mode. expiresAt
 * (ARENA_EXPIRY_HOURS = 48, lib/arena.ts:49) was written by create and quick-match and never read again: no sweeper, no
 * route checked it. A posted duel its creator never came back to held the stake forever; an accepted duel one side
 * never played held BOTH stakes forever, and the side that did play was never paid.
 *
 * THE RULES (planReclaim, pure), for an Arena (LC) duel still WAITING or ACTIVE once now >= expiresAt, as first
 * written (the P6 FIX PASS below changed the last three for Quick Matches, music attempts and both-scored rows):
 *   · never accepted (no player 2)          → VOIDED, the creator's stake refunded in full;
 *   · accepted, NEITHER side scored          → VOIDED, both stakes refunded in full (a human duel);
 *   · accepted, exactly ONE side scored      → SETTLED to that side as a forfeit win: the same arenaPayWinner, the same
 *                                              idempotency key (`arena-settle:<id>`) and the same rake as a normal win,
 *                                              recorded with reason 'expired_forfeit';
 *   · both scored                            → was "cannot be open, asserted and never touched" — it can (two submits at
 *                                              one instant), and it is settled now.
 * The mode does not matter (all modes, #30) and neither does the staking pause: a refund or a payout on a duel that
 * already exists is not a new stake (a paused dance duel reclaims like any other — tested).
 *
 * MUSIC-SUITE P6 FIX PASS (2026-09-26) — the phase review, verified here, found three holes in those rules:
 *   1. #29 WAS ENFORCED BY NOTHING. The rules read the score COLUMNS only, and a music attempt becomes a column only when
 *      the shell submits it — which a reload, a closed tab or a blocked request never does. A music Quick Match started,
 *      played badly and abandoned was VOIDED with both stakes back (and one finished, compared with the deterministic
 *      ghost and left unsubmitted, the same): losses never paid, wins did. Now a music duel's seats are read from their
 *      attempts (lib/arena-music.ts readMusicSeats): a seat with a start HAS played — 0 unfinished (#29), the rejudge
 *      finished — and a stored score with no start by its player (pre-house-beat, #12) counts for nothing.
 *   2. A QUICK MATCH WAS A FREE ROLL IN EVERY MODE. The house seat only ever "plays" inside the player's own submit, so
 *      "nobody played" was every abandoned Quick Match — quit before the end card, the stake came back at 48 h. Before
 *      this pass that stake stayed locked (abandoning cost the fee). #30's "refund whoever didn't play" read literally
 *      refunds the one seat that could not play first. Rule now (FLAGGED FOR THE OWNER — one line below, GHOST_UNPLAYED):
 *      a Quick Match whose player never played by the deadline is SETTLED to the house (the fee goes back to the house
 *      treasury the house staked from, as any house win), recorded 'expired_forfeit'. A music player who started a set
 *      HAS played: the house's score is drawn exactly as submit-score draws it (lib/arena-ghost.ts) and the duel settles
 *      on the two scores.
 *   3. BOTH SCORED, STILL OPEN, FOREVER. Two submits at the same instant each read the other slot as empty and neither
 *      settled; after expiry no route took a score and the sweep skipped the row as "impossible". Submit-score now reads
 *      the other slot back from its own guarded write, and the sweep SETTLES a both-scored row (higher score takes the
 *      pot; a tie refunds both) instead of skipping it.
 * So, for an ACTIVE duel past its deadline, with each seat's score as counted above (`e1`, `e2`):
 *   · both in                       → SETTLED on them (a tie: VOIDED, both refunded) — reason 'expired_settle';
 *   · a Quick Match, the player in  → the house's score drawn, then as above;
 *   · a Quick Match, the player out → SETTLED to the house (GHOST_UNPLAYED = 'house_wins') — reason 'expired_forfeit';
 *   · a human duel, one side in     → SETTLED to that side — reason 'expired_forfeit';
 *   · a human duel, neither in      → VOIDED, both refunded — reason 'expired'.
 *
 * EVERY MOVE (reclaimOne) is one transaction: re-read the row, plan on what it says NOW, CLAIM it — an updateMany whose
 * WHERE is the very row state the plan was made from (status, player 2, both scores, still expired) — then move the Lab
 * Credits through the existing arenaRefund / arenaPayWinner (lib/arena.ts) and append one MatchEvent (REFUNDED with
 * reason 'expired', or SETTLED with reason 'expired_forfeit', the way cancel and a tie record 'cancelled' / 'tie').
 * The claim is the row-state guard the submit route checks (status in WAITING/ACTIVE, the score slot still empty), made
 * a compare-and-set: under Postgres READ COMMITTED a second sweep's UPDATE waits on the first one's row lock, re-reads
 * the row, finds it VOIDED/SETTLED and updates 0 rows — so it moves nothing. Behind the claim, the ledger keys are the
 * normal paths' own (`arena-refund:<id>:<user>`, `arena-settle:<id>`), unique in WalletLedgerEntry, so even two moves
 * that both got past a claim could not pay twice (a replay is a no-op; a settle key held by another wallet throws and
 * rolls its transaction back). A second sweep changes nothing: its query only finds WAITING/ACTIVE rows.
 *
 * BOUNDED: one sweep reads at most `limit` candidates (RECLAIM_MAX_BATCH at most), oldest expiry first, each in its own
 * short transaction, so one bad duel cannot hold the rest (it reports 'error' and is picked up by the next sweep).
 * Callers: GET /api/arena/list (reclaimOnRead — the caller's own duels, RECLAIM_ON_READ_BATCH, never holds the lobby
 * past RECLAIM_ON_READ_BUDGET_MS and never fails it), and POST /api/arena/reclaim (the whole book, for a scheduler,
 * behind ARENA_RECLAIM_SECRET).
 *
 * OUT OF SCOPE (noted, not done): mpMatch.expiresAt (14 days, friend challenges in lib/mp) is not read either; those
 * carry no stake (owner decision #31: "no stake, no pay"), so nothing is stranded there, only a stale open code.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { arenaPayWinner, arenaRefund, appendMatchEvent, resolveArena } from '@/lib/arena';
import { houseSetModeOf, readHouseSeats, houseSeatOf } from '@/lib/arena-music';
import { drawHouseScore } from '@/lib/arena-ghost';
import { stakeCeilingFor, killSwitchOn } from '@/lib/arena-score-integrity';

/** The states a duel can still be reclaimed from (the only two the Arena leaves open). */
export const RECLAIMABLE_STATES: readonly string[] = ['WAITING', 'ACTIVE'];
/** The most duels one sweep reads. */
export const RECLAIM_MAX_BATCH = 50;
/** One scheduled sweep's batch when the caller names none. */
export const RECLAIM_ROUTE_DEFAULT_BATCH = 25;
/** The lobby's sweep: the caller's own expired duels, at most this many per read. */
export const RECLAIM_ON_READ_BATCH = 10;
/** The longest the lobby waits on its sweep before it answers anyway (the sweep carries on; it is idempotent). */
export const RECLAIM_ON_READ_BUDGET_MS = 1500;
/** The header a scheduler presents to POST /api/arena/reclaim. */
export const RECLAIM_SECRET_HEADER = 'x-arena-reclaim-secret';
/** The MatchEvent reasons a reclaim writes — the lobby reads them back to label the row. */
export const EXPIRED_VOID_REASON = 'expired';
export const EXPIRED_FORFEIT_REASON = 'expired_forfeit';
/** MUSIC-SUITE P6 FIX PASS: a duel settled at its deadline on two scores (both submitted, or a music attempt counted). */
export const EXPIRED_SETTLE_REASON = 'expired_settle';
/**
 * MUSIC-SUITE P6 FIX PASS — OWNER CALL (#30 applied to a Quick Match): what an expired Quick Match whose player never
 * played becomes. 'house_wins' (this pass: no free roll — abandoning costs the fee, as it did before P6 when the stake
 * stayed locked) or 'refund' (#30 read literally: both stakes back, and every Quick Match can be quit before its end card
 * at no cost). One line to flip; the tests pin both.
 */
export const GHOST_UNPLAYED: 'house_wins' | 'refund' = 'house_wins';

/** The fields of a CompetitionMatch row the rules read. */
export interface ReclaimRow {
  id: string;
  mode?: string | null;
  currency: string;
  status: string;
  expiresAt: Date | string | null | undefined;
  player1Id: string;
  player2Id: string | null | undefined;
  player1Score: number | null | undefined;
  player2Score: number | null | undefined;
  entryFeeCents: number;
  rakePercent: number;
  /** MUSIC-SUITE P6 FIX PASS: 'GHOST_DUEL' = a Quick Match (the house in seat 2). */
  matchType?: string | null;
}

/**
 * MUSIC-SUITE P6 FIX PASS: each seat's score as the sweep COUNTS it, where that is not its column — a music duel's
 * (lib/arena-music.ts musicSeat: an attempt started counts, a pre-house-beat score does not). A seat absent here is its
 * column.
 */
export interface SeatScores { p1?: number | null; p2?: number | null }

export type ReclaimSkip =
  | 'not_arena'         // the dark real-money book (USD_CENTS) is not the Arena's to reclaim
  | 'not_expired'
  | 'no_expiry'         // no expiresAt: nothing says when it lapses (every Arena route writes one)
  | 'closed'            // SETTLED / VOIDED / anything the Arena does not leave open
  | 'waiting_joined';   // ASSERT: WAITING with a player 2 cannot happen (join sets both in one write)

export type ReclaimPlan =
  | { kind: 'void'; refund: Array<{ side: 'p1' | 'p2'; userId: string }> }
  | { kind: 'forfeit'; side: 'p1' | 'p2'; winnerId: string }
  /** MUSIC-SUITE P6 FIX PASS: settle on two scores; `drawHouse` = the Quick Match seat whose score is drawn first. */
  | { kind: 'settle'; p1: number | null; p2: number | null; drawHouse: 'p1' | 'p2' | null }
  | { kind: 'skip'; why: ReclaimSkip };

/** The skip that is a broken invariant, not ordinary "nothing to do" — logged loudly when a sweep meets one. */
export const RECLAIM_ANOMALIES: ReadonlySet<ReclaimSkip> = new Set<ReclaimSkip>(['waiting_joined']);

const scored = (s: number | null | undefined): boolean => s !== null && s !== undefined;

/** Is the deadline reached? At the instant itself, yes (the same `<=` /api/arena/music-attempt and submit-score use). */
export function isExpired(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * What the rules make of this duel at `now`. Pure. `seats` = the scores the sweep counts where they are not the columns
 * (a music duel's attempts — reclaimOne reads them); without it, the columns.
 */
export function planReclaim(m: ReclaimRow, now: Date, seats?: SeatScores): ReclaimPlan {
  if (m.currency !== 'LC') return { kind: 'skip', why: 'not_arena' };
  if (!RECLAIMABLE_STATES.includes(m.status)) return { kind: 'skip', why: 'closed' };
  if (m.expiresAt === null || m.expiresAt === undefined) return { kind: 'skip', why: 'no_expiry' };
  if (!isExpired(m.expiresAt, now)) return { kind: 'skip', why: 'not_expired' };
  // Never accepted: only the creator staked. (An ACTIVE row with no player 2 cannot be made by any route either; it is
  // treated the same way — the creator's stake is the only one that exists, and there is no one to forfeit to.)
  if (!m.player2Id) {
    return { kind: 'void', refund: [{ side: 'p1', userId: m.player1Id }] };
  }
  if (m.status === 'WAITING') return { kind: 'skip', why: 'waiting_joined' };
  const e1 = seats && 'p1' in seats ? seats.p1 : m.player1Score;
  const e2 = seats && 'p2' in seats ? seats.p2 : m.player2Score;
  const p1 = scored(e1);
  const p2 = scored(e2);
  if (p1 && p2) return { kind: 'settle', p1: e1!, p2: e2!, drawHouse: null };
  const house = houseSeatOf(m);
  if (house) {
    const human = house === 'p2' ? 'p1' : 'p2';
    const humanIn = human === 'p1' ? p1 : p2;
    // the player played (a music start counts): the house's score is drawn, then the two settle
    if (humanIn) return { kind: 'settle', p1: p1 ? e1! : null, p2: p2 ? e2! : null, drawHouse: house };
    // the player never played: the house seat cannot play first — GHOST_UNPLAYED decides (owner call, flagged)
    if (GHOST_UNPLAYED === 'house_wins') return { kind: 'forfeit', side: house, winnerId: house === 'p2' ? m.player2Id : m.player1Id };
    return { kind: 'void', refund: [{ side: 'p1', userId: m.player1Id }, { side: 'p2', userId: m.player2Id }] };
  }
  if (p1) return { kind: 'forfeit', side: 'p1', winnerId: m.player1Id };
  if (p2) return { kind: 'forfeit', side: 'p2', winnerId: m.player2Id };
  return { kind: 'void', refund: [{ side: 'p1', userId: m.player1Id }, { side: 'p2', userId: m.player2Id }] };
}

/** A sweep's clamp on its batch: a whole number in [1, RECLAIM_MAX_BATCH]; anything unusable is the default. */
export function clampReclaimBatch(limit: unknown, fallback = RECLAIM_ROUTE_DEFAULT_BATCH): number {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n < 1) return Math.min(fallback, RECLAIM_MAX_BATCH);
  return Math.min(n, RECLAIM_MAX_BATCH);
}

/**
 * The candidate query: open Arena duels past expiry, optionally only `userId`'s. Oldest expiry first. (MUSIC-SUITE P6 FIX
 * PASS: a both-scored open duel is a candidate now — the sweep settles it; it was left out as an asserted impossibility,
 * and two simultaneous submits made exactly that row.)
 */
export function reclaimCandidateWhere(now: Date, userId?: string): Record<string, unknown> {
  return {
    currency: 'LC',
    status: { in: [...RECLAIMABLE_STATES] },
    expiresAt: { lte: now },
    ...(userId ? { AND: [{ OR: [{ player1Id: userId }, { player2Id: userId }] }] } : {}),
  };
}

export interface ReclaimResult {
  matchId: string;
  mode?: string | null;
  outcome: 'voided' | 'forfeit' | 'settled' | 'skipped' | 'raced' | 'error';
  why?: string;
  /** Who was refunded, on a void. */
  refunded?: string[];
  winnerId?: string;
  payout?: number;
  rake?: number;
}

export interface ReclaimSummary {
  scanned: number;
  voided: number;
  forfeits: number;
  /** MUSIC-SUITE P6 FIX PASS: duels settled at the deadline on two scores (a tie among them is counted in `voided`). */
  settled: number;
  skipped: number;
  raced: number;
  errors: number;
  /** The batch was full: there may be more to reclaim (a scheduler calls again). */
  more: boolean;
  results: ReclaimResult[];
}

/** The slice of the Prisma client a sweep uses: the real client, or a test's fake. */
export interface ReclaimDb {
  competitionMatch: { findMany: (args: any) => Promise<Array<{ id: string }>> };
  $transaction: (fn: (tx: any) => Promise<any>) => Promise<any>;
}

/**
 * Reclaim ONE duel, in its own transaction: re-read, plan, claim (compare-and-set), move the Lab Credits, record it.
 * Returns 'raced' when the row changed between the read and the claim — another sweep, a score, a cancel — and then
 * moves nothing.
 */
export async function reclaimOne(db: ReclaimDb, matchId: string, now: Date = new Date()): Promise<ReclaimResult> {
  return db.$transaction(async (tx: any) => {
    const m: ReclaimRow | null = await tx.competitionMatch.findUnique({ where: { id: matchId } });
    if (!m) return { matchId, outcome: 'skipped', why: 'not_found' } as ReclaimResult;
    let plan = planReclaim(m, now);
    if (plan.kind === 'skip') {
      if (RECLAIM_ANOMALIES.has(plan.why)) {
        console.error(`[arena-reclaim] ${m.id} (${m.mode}): ${plan.why} — an open duel in a state no route makes; left untouched`);
      }
      return { matchId, mode: m.mode, outcome: 'skipped', why: plan.why } as ReclaimResult;
    }
    // MUSIC-SUITE P6 FIX PASS: a music duel's seats are its ATTEMPTS (a start has played; a pre-house-beat score has not)
    // MUSIC-SUITE P9 (2026-09-29): and a dance duel's — one attempt on its house song (lib/arena-music.ts HOUSE_SET_RULES)
    let legacy: string[] = [];
    const setMode = houseSetModeOf(m.mode);
    if (m.player2Id && setMode) {
      const seats = await readHouseSeats(tx, setMode, m as never);
      legacy = (['p1', 'p2'] as const).filter((k) => seats[k].legacy);
      plan = planReclaim(m, now, { p1: seats.p1.score, p2: seats.p2.score });
    }

    // A settle on two scores: the house's drawn first when the Quick Match needs it (the draw submit-score makes).
    let p1Score: number | null = null, p2Score: number | null = null, houseDraw: { center: number; source: string } | null = null;
    if (plan.kind === 'settle') {
      p1Score = plan.p1; p2Score = plan.p2;
      if (plan.drawHouse) {
        const c = stakeCeilingFor(String(m.mode ?? ''));   // MUSIC-SUITE P9: the stake's ceiling (a dance duel's is 10,000)
        const max = c && !(killSwitchOn() && c.swapsUnderKillSwitch) ? c.max : Infinity;
        const humanId = plan.drawHouse === 'p2' ? m.player1Id : m.player2Id!;
        const row = m as ReclaimRow & { seed?: string | null; createdAt?: Date | string };
        const d = await drawHouseScore(tx, { mode: String(m.mode ?? ''), seed: String(row.seed ?? m.id), createdAt: row.createdAt ?? new Date(0), id: m.id }, humanId, max);   // MUSIC-SUITE P9 FIX PASS: `id` — a dance house is banded on the duel's song
        if (plan.drawHouse === 'p1') p1Score = d.score; else p2Score = d.score;
        houseDraw = { center: d.draw.center, source: d.draw.source };
      }
    }
    const result = plan.kind === 'settle' ? resolveArena(p1Score!, p2Score!) : null;
    const winnerId = plan.kind === 'forfeit' ? plan.winnerId
      : result === 'p1' ? m.player1Id : result === 'p2' ? m.player2Id! : null;

    // THE CLAIM. Every field the plan read is in the WHERE, so a row that moved since the read updates nothing. A settle
    // also writes the scores it counted into the empty columns (the lobby shows them; a counted music attempt then
    // bands the player's next house rival like any rejudged set).
    const data: Record<string, unknown> = plan.kind === 'void' || (plan.kind === 'settle' && result === 'tie')
      ? { status: 'VOIDED' }
      : { status: 'SETTLED', winnerId };
    if (plan.kind === 'settle') {
      if ((m.player1Score === null || m.player1Score === undefined) && p1Score !== null) data.player1Score = p1Score;
      if ((m.player2Score === null || m.player2Score === undefined) && p2Score !== null) data.player2Score = p2Score;
    }
    const claim = await tx.competitionMatch.updateMany({
      where: {
        id: m.id,
        currency: 'LC',
        status: m.status,
        player2Id: m.player2Id ?? null,
        player1Score: m.player1Score ?? null,
        player2Score: m.player2Score ?? null,
        expiresAt: { lte: now },
      },
      data,
    });
    if (!claim || claim.count !== 1) return { matchId, mode: m.mode, outcome: 'raced' } as ReclaimResult;

    const feeLc = m.entryFeeCents;
    const expiresAt = new Date(m.expiresAt as Date | string).toISOString();
    const extra = legacy.length ? { legacyScores: legacy } : {};
    if (plan.kind === 'void' || (plan.kind === 'settle' && result === 'tie')) {
      const refund = plan.kind === 'void' ? plan.refund
        : [{ side: 'p1' as const, userId: m.player1Id }, { side: 'p2' as const, userId: m.player2Id! }];
      for (const r of refund) await arenaRefund(tx, { userId: r.userId, matchId: m.id, feeLc });
      await appendMatchEvent(tx, m.id, 'REFUNDED', null, {
        reason: EXPIRED_VOID_REASON, feeLc, refunded: refund.map((r) => r.side), statusWas: m.status, expiresAt,
        ...(plan.kind === 'settle' ? { tie: true, p1Score, p2Score } : {}), ...extra,
      });
      return { matchId, mode: m.mode, outcome: 'voided', refunded: refund.map((r) => r.userId) } as ReclaimResult;
    }
    const { payout, rake } = await arenaPayWinner(tx, { winnerId: winnerId!, matchId: m.id, feeLc, rakePercent: m.rakePercent });
    if (plan.kind === 'settle') {
      await appendMatchEvent(tx, m.id, 'SETTLED', null, {
        reason: EXPIRED_SETTLE_REASON, winnerId, payout, rake, p1Score, p2Score, expiresAt,
        ...(houseDraw ? { houseDrawn: plan.drawHouse, bandCenter: houseDraw.center, bandSource: houseDraw.source } : {}), ...extra,
      });
      return { matchId, mode: m.mode, outcome: 'settled', winnerId: winnerId!, payout, rake } as ReclaimResult;
    }
    await appendMatchEvent(tx, m.id, 'SETTLED', null, {
      reason: EXPIRED_FORFEIT_REASON, winnerId, payout, rake,
      p1Score: m.player1Score ?? null, p2Score: m.player2Score ?? null, expiresAt,
      ...(houseSeatOf(m) && winnerId !== m.player1Id ? { unplayedQuickMatch: true } : {}), ...extra,
    });
    return { matchId, mode: m.mode, outcome: 'forfeit', winnerId: winnerId!, payout, rake } as ReclaimResult;
  });
}

/**
 * One bounded sweep: up to `limit` open Arena duels past expiry (only `userId`'s when given), oldest expiry first, each
 * reclaimed in its own transaction. A duel that throws is reported 'error' and left as it was (its transaction rolled
 * back) for the next sweep; the rest of the batch carries on.
 */
export async function reclaimExpiredArenaDuels(
  db: ReclaimDb,
  opts: { now?: Date; limit?: number; userId?: string } = {},
): Promise<ReclaimSummary> {
  const now = opts.now ?? new Date();
  const limit = clampReclaimBatch(opts.limit);
  const candidates = await db.competitionMatch.findMany({
    where: reclaimCandidateWhere(now, opts.userId),
    orderBy: { expiresAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  const results: ReclaimResult[] = [];
  for (const { id } of candidates.slice(0, limit)) {
    try {
      results.push(await reclaimOne(db, id, now));
    } catch (err: any) {
      console.error(`[arena-reclaim] ${id}:`, err?.code ?? err?.message ?? err);
      results.push({ matchId: id, outcome: 'error', why: String(err?.code ?? err?.message ?? 'error') });
    }
  }
  const count = (o: ReclaimResult['outcome']) => results.filter((r) => r.outcome === o).length;
  return {
    scanned: candidates.length,
    voided: count('voided'),
    forfeits: count('forfeit'),
    settled: count('settled'),
    skipped: count('skipped'),
    raced: count('raced'),
    errors: count('error'),
    more: candidates.length >= limit,
    results,
  };
}

/**
 * The lobby's sweep (GET /api/arena/list): the caller's own expired duels, a small batch, and never in the lobby's way —
 * a failure answers null, and a sweep slower than `budgetMs` is not waited for (it finishes on its own; a transaction
 * that is cut off rolls back and the next read picks the duel up again).
 */
export async function reclaimOnRead(
  db: ReclaimDb,
  userId: string,
  opts: { now?: Date; budgetMs?: number } = {},
): Promise<ReclaimSummary | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sweep = reclaimExpiredArenaDuels(db, { now: opts.now, limit: RECLAIM_ON_READ_BATCH, userId }).catch((err) => {
    console.error('[arena-reclaim] on read:', err?.code ?? err?.message ?? err);
    return null;
  });
  const budget = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), opts.budgetMs ?? RECLAIM_ON_READ_BUDGET_MS); });
  try {
    return await Promise.race([sweep, budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Does the presented header carry the reclaim secret? Constant-time (both sides hashed to one length first). */
export function verifyReclaimSecret(presented: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || typeof presented !== 'string' || !presented) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/** How the lobby labels a duel a reclaim closed, read back from its REFUNDED / SETTLED event (null: not a reclaim). */
export type ExpiredOutcome = 'refunded' | 'won_by_forfeit' | 'lost_by_forfeit' | 'won_at_deadline' | 'lost_at_deadline';
export function expiredOutcomeOf(
  event: { eventType: string; payload: unknown } | null | undefined,
  userId: string,
): ExpiredOutcome | null {
  if (!event) return null;
  let p: any = event.payload;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return null; } }
  if (!p || typeof p !== 'object') return null;
  if (event.eventType === 'REFUNDED' && p.reason === EXPIRED_VOID_REASON) return 'refunded';
  if (event.eventType === 'SETTLED' && p.reason === EXPIRED_FORFEIT_REASON) return p.winnerId === userId ? 'won_by_forfeit' : 'lost_by_forfeit';
  // MUSIC-SUITE P6 FIX PASS: settled at the deadline on two scores (a music set started or finished and never submitted)
  if (event.eventType === 'SETTLED' && p.reason === EXPIRED_SETTLE_REASON) return p.winnerId === userId ? 'won_at_deadline' : 'lost_at_deadline';
  return null;
}
