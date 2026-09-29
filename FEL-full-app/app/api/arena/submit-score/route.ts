export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  resolveArena,
  arenaPayWinner,
  arenaRefund,
  appendMatchEvent,
  ArenaError,
  arenaModeKey,
} from '@/lib/arena';
import {
  isMusicDuel, readMusicAttempt, musicAttemptScore, readMusicSeats, houseSeatOf, musicTapPlausibility, PRE_HOUSE_BEAT_REASON,
} from '@/lib/arena-music';
import { drawHouseScore } from '@/lib/arena-ghost';
import { recordServerEvent } from '@/lib/analytics-server';
import { forWire } from '@/lib/mp/dunkCard';
import { checkStakeScore, killSwitchOn, STAKE_REFUSAL_STATUS } from '@/lib/arena-score-integrity';
import { isExpired } from '@/lib/arena-reclaim';

/**
 * POST /api/arena/submit-score
 * Body: { matchId, score }
 * Records the caller's score for their Arena duel. When BOTH players have
 * submitted, the duel auto-settles atomically: higher score takes the pot
 * (minus rake); a tie refunds both players.
 *
 * HOTFIX (2026-09-24): a score is checked against its mode before anything is written — above the mode's limit (the
 * most its rules can award, or the Arena's limit on an open-ended mode), or a Flight Night score that is not its dunk
 * card's total, is refused with a 422 and never settles (lib/arena-score-integrity.ts). This route settled a pot on any
 * non-negative integer the client sent.
 *
 * MUSIC-SUITE P6 (2026-09-26, owner decision #12): a Groove Academy duel's score is the server's own. The room plays the
 * duel's house beat (lib/babylon/music/houseBeat.ts) and records ONE attempt through /api/arena/music-attempt; here the
 * attempt is read (lib/arena-music.ts), its taps rejudged with the room's own judge (judgeHouseSet), and the posted score
 * must equal that (422 SCORE_MISMATCH). A set started and never finished scores 0 — the reload rule, #29 — and a score
 * with no attempt at all is refused 409 NO_ATTEMPT, before anything is written. Every other mode is unchanged.
 *
 * MUSIC-SUITE P6 FIX PASS (2026-09-26):
 *   · TWO SUBMITS AT ONE INSTANT NEVER SETTLED. The other side's score was read from the start-of-transaction read, so
 *     when both players submitted together each transaction saw the other slot empty and answered settled:false — the
 *     row stayed ACTIVE with both scores and no winner (and, past expiry, no route took a score and the sweep skipped
 *     it). The second writer waits on the first one's row lock; its guarded UPDATE then returns the row as committed, so
 *     the scores are read back from that write, and the later of the two settles.
 *   · A MUSIC DUEL IN FLIGHT ACROSS THE DEPLOY mixed two scales: the opponent's stored pre-house-beat score (their own
 *     grid, ceiling 2,647,100) was settled against a rejudged house-beat one (ceiling 378,300). A music score whose player
 *     has no recorded attempt is from before the house beat (decision #12: old music duel scores stop counting): such a
 *     duel is VOIDED and both stakes refunded (reason 'pre_house_beat') instead of settled — 409 PRE_HOUSE_BEAT after
 *     the refund commits. (/api/arena/music-attempt does the same at START, so a set is not played for nothing.)
 *   · The house's draw moved to lib/arena-ghost.ts (the expiry sweep draws it too, identically); and a music set's timing
 *     spread is recorded for review (lib/arena-music.ts musicTapPlausibility — nothing is refused on it).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const matchId = String(body?.matchId ?? '');
  const score = Number(body?.score);
  // THE CARD (2026-09-13, owner: "in multiplayer we should see other peoples dunk and score"). Optional: a duel from a
  // client that does not send one settles on the mode's ceiling alone, and a card that does not parse is dropped. It
  // rides in the MatchEvent payload that already exists, so there is no schema change and no migration.
  // HOTFIX (2026-09-24): a card that parses must ADD UP — checked with the ceiling inside the transaction below, where
  // the match's mode is known, and stored only on a Flight Night duel.
  if (!matchId) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
  if (!Number.isInteger(score) || score < 0) {
    return NextResponse.json({ error: 'score must be a non-negative integer' }, { status: 400 });
  }

  try {
    const outcome = await prisma.$transaction(async (tx: any) => {
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new ArenaError('NOT_FOUND', 'Match not found', 404);
      if (match.currency !== 'LC') throw new ArenaError('WRONG_BOOK', 'Not an Arena match', 400);

      const isP1 = match.player1Id === userId;
      const isP2 = match.player2Id === userId;
      if (!isP1 && !isP2) throw new ArenaError('NOT_A_PLAYER', 'You are not in this duel.', 403);
      if (!['ACTIVE', 'WAITING'].includes(match.status)) {
        throw new ArenaError('NOT_SUBMITTABLE', 'This duel is no longer accepting scores.', 409);
      }
      // MUSIC-SUITE P6 (2026-09-26, owner decision #30): past expiresAt a duel takes no more scores, in any mode — the
      // reclaim sweep (lib/arena-reclaim.ts) owns it from that instant: it refunds whoever did not play, or settles to
      // the one side that did. Before this nothing read expiresAt, so a duel stayed open to a score forever.
      if (isExpired(match.expiresAt, new Date())) {
        throw new ArenaError('EXPIRED', 'This duel has expired: stakes nobody played for are refunded, and a side that played wins by forfeit.', 409);
      }
      // A duel needs both players before scores count.
      if (!match.player2Id) throw new ArenaError('WAITING_OPPONENT', 'Waiting for an opponent to join.', 409);

      // MUSIC-SUITE P6: a music duel's score is what the server makes of the player's one recorded attempt — no attempt,
      // no score (409 NO_ATTEMPT); an unfinished one, 0; a finished one, judgeHouseSet on its taps. checkStakeScore then
      // requires the posted score to equal it (422 SCORE_MISMATCH).
      const attempt = isMusicDuel(match.mode) ? await readMusicAttempt(tx, match.id, userId) : null;
      const rejudge = attempt ? musicAttemptScore(match.id, attempt) : null;
      if (rejudge && !rejudge.ok) throw new ArenaError(rejudge.code, rejudge.detail, rejudge.status);
      // MUSIC-SUITE P6 FIX PASS: the other seat's stored score from before the house beat (no attempt by its player) is
      // not a score to settle against — the duel is refunded to both, and the refusal says so (after the refund commits)
      if (attempt && houseSeatOf(match) === null) {
        const seats = await readMusicSeats(tx, match);
        const other = isP1 ? seats.p2 : seats.p1;
        if (other.legacy) {
          const feeLc = match.entryFeeCents;
          await arenaRefund(tx, { userId: match.player1Id, matchId, feeLc });
          await arenaRefund(tx, { userId: match.player2Id, matchId, feeLc });
          await tx.competitionMatch.update({ where: { id: matchId, status: { in: ['ACTIVE', 'WAITING'] } }, data: { status: 'VOIDED' } });
          await appendMatchEvent(tx, matchId, 'REFUNDED', null, { reason: PRE_HOUSE_BEAT_REASON, feeLc, legacySide: isP1 ? 'p2' : 'p1' });
          return { preHouseBeat: true, feeLc } as const;
        }
      }

      // HOTFIX (2026-09-24): the score must be inside this mode's limit, and a dunk card must add up to it. A refusal
      // throws before the first write, so nothing is recorded, no ghost is drawn and nothing settles.
      const check = checkStakeScore({ mode: match.mode, score, card: body?.card, killSwitch: killSwitchOn(), ...(rejudge?.ok ? { rejudged: rejudge.score } : {}) });
      if (!check.ok) throw new ArenaError(check.code, check.detail, STAKE_REFUSAL_STATUS);
      if (!check.ceilingApplied) console.warn(`[arena/submit-score] ${match.mode}: NEXT_PUBLIC_DISABLE_3D=1 serves the fallback game, whose scale the ceiling table does not describe — ceiling not applied`);
      const card = check.card;

      // Idempotent per player: first submission wins, later ones are ignored.
      const alreadySubmitted = isP1 ? match.player1Score !== null : match.player2Score !== null;
      const data: any = {};
      if (isP1 && !alreadySubmitted) {
        data.player1Score = score;
        data.player1SubmittedAt = new Date();
      } else if (isP2 && !alreadySubmitted) {
        data.player2Score = score;
        data.player2SubmittedAt = new Date();
      }
      if (Object.keys(data).length) {
        // MUSIC-SUITE P6: the write is guarded by the state it was decided on — still open, this player's slot still
        // empty. A reclaim sweep that closed the duel between the read above and this write (the instant of expiry) makes
        // it match no row: Prisma answers P2025 and nothing is written or paid, instead of a second score settling a
        // duel the sweep already refunded or paid by forfeit (a tie here would have refunded both on top of it). It also
        // takes the row lock first, so a sweep that comes after this write sees the score and moves nothing.
        const slot = isP1 ? 'player1Score' : 'player2Score';
        const written = await tx.competitionMatch.update({ where: { id: matchId, status: { in: ['ACTIVE', 'WAITING'] }, [slot]: null }, data })
          .catch((e: any) => {
            if (e?.code === 'P2025') throw new ArenaError('NOT_SUBMITTABLE', 'This duel is no longer accepting scores.', 409);
            throw e;
          });
        // MUSIC-SUITE P6 FIX PASS: the other slot as it stands AFTER this write took the row lock — a submit that landed
        // at the same instant and committed first is in it, so the later of two simultaneous submits settles the duel
        if (written && typeof written === 'object') {
          if (isP1) match.player2Score = written.player2Score ?? match.player2Score;
          else match.player1Score = written.player1Score ?? match.player1Score;
        }
        const plaus = attempt?.finish ? musicTapPlausibility(match.id, attempt.finish.taps) : null;
        if (plaus?.flagged) console.warn(`[arena/submit-score] ${matchId}: a music set timed to ${plaus.spreadMs} ms over ${plaus.hits} hits — machine-exact; recorded for review`);
        await appendMatchEvent(tx, matchId, 'SCORE_SUBMITTED', userId, {
          player: isP1 ? 'p1' : 'p2', score, ...(card ? { card: forWire(card) } : {}),
          ...(rejudge?.ok ? { rejudged: true, taps: rejudge.taps, ...(rejudge.forfeit ? { forfeit: 'unfinished_attempt' } : {}) } : {}),
          ...(plaus ? { plausibility: plaus } : {}),
        });
      }

      // GHOST_DUEL (Quick Match): the house rival's score is drawn NOW, from
      // the match seed + skill history that strictly PREDATES this match —
      // the submitted score is never an input, so the draw can't be pulled
      // toward it. Deterministic: re-submitting draws the same number.
      const ghostSide: 'p1' | 'p2' | null =
        match.matchType === 'GHOST_DUEL' ? (isP1 ? 'p2' : 'p1') : null;
      const ghostScoreMissing =
        ghostSide === 'p1' ? match.player1Score === null : match.player2Score === null;
      if (ghostSide && ghostScoreMissing && match.seed) {
        // MUSIC-SUITE P6 FIX PASS: the draw is lib/arena-ghost.ts's (the expiry sweep makes the same one)
        const { score: ghostScore, draw } = await drawHouseScore(tx, match, userId, check.ceilingApplied ? check.ceiling.max : Infinity);
        const ghostData =
          ghostSide === 'p1' ? { player1Score: ghostScore, player1SubmittedAt: new Date() } : { player2Score: ghostScore, player2SubmittedAt: new Date() };
        await tx.competitionMatch.update({ where: { id: matchId }, data: ghostData });
        await appendMatchEvent(tx, matchId, 'GHOST_SCORED', null, {
          player: ghostSide,
          score: ghostScore,
          bandCenter: draw.center,
          bandSource: draw.source,
          ...(ghostScore !== draw.score ? { drawnAboveCeiling: draw.score } : {}),
        });
        if (ghostSide === 'p1') match.player1Score = ghostScore;
        else match.player2Score = ghostScore;
      }

      const p1Score = isP1 && !alreadySubmitted ? score : match.player1Score;
      const p2Score = isP2 && !alreadySubmitted ? score : match.player2Score;

      // Not both in yet — hold.
      if (p1Score === null || p2Score === null || p1Score === undefined || p2Score === undefined) {
        return { settled: false, status: 'ACTIVE', mySubmitted: true };
      }

      // Both scores are in — resolve + settle.
      const feeLc = match.entryFeeCents;
      const result = resolveArena(p1Score, p2Score);

      if (result === 'tie') {
        await arenaRefund(tx, { userId: match.player1Id, matchId, feeLc });
        await arenaRefund(tx, { userId: match.player2Id, matchId, feeLc });
        const updated = await tx.competitionMatch.update({
          where: { id: matchId },
          data: { status: 'VOIDED' },
        });
        await appendMatchEvent(tx, matchId, 'REFUNDED', null, { reason: 'tie', feeLc });
        return { settled: true, status: updated.status, result: 'tie', p1Score, p2Score, feeLc };
      }

      const winnerId = result === 'p1' ? match.player1Id : match.player2Id;
      // mark SCORED, then pay + SETTLE within the same tx
      const { payout, rake } = await arenaPayWinner(tx, {
        winnerId,
        matchId,
        feeLc,
        rakePercent: match.rakePercent,
      });
      const updated = await tx.competitionMatch.update({
        where: { id: matchId },
        data: { status: 'SETTLED', winnerId },
      });
      await appendMatchEvent(tx, matchId, 'SETTLED', null, { winnerId, payout, rake, p1Score, p2Score });

      return {
        settled: true,
        status: updated.status,
        result,
        winnerId,
        iWon: winnerId === userId,
        payout,
        rake,
        p1Score,
        p2Score,
        feeLc,
      };
    });

    // MUSIC-SUITE P6 FIX PASS: a duel refunded because the other score is from before the house beat (committed above)
    if ((outcome as any).preHouseBeat) {
      return NextResponse.json({
        error: 'PRE_HOUSE_BEAT', refunded: true,
        detail: "Your opponent's score in this duel is from before the house beat, so the two can't be compared: both stakes were refunded.",
      }, { status: 409 });
    }
    if ((outcome as any).settled) {
      recordServerEvent({ name: 'arena_match_settled', props: { matchId, status: (outcome as any).status }, userId }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...outcome });
  } catch (err: any) {
    if (err instanceof ArenaError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    }
    console.error('[arena/submit-score]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
