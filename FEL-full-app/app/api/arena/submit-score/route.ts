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
import { drawRivalScore, median } from '@/lib/arena-rivals';
import { recordServerEvent } from '@/lib/analytics-server';
import { forWire } from '@/lib/mp/dunkCard';
import { checkStakeScore, killSwitchOn, STAKE_REFUSAL_STATUS } from '@/lib/arena-score-integrity';

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
      // A duel needs both players before scores count.
      if (!match.player2Id) throw new ArenaError('WAITING_OPPONENT', 'Waiting for an opponent to join.', 409);

      // HOTFIX (2026-09-24): the score must be inside this mode's limit, and a dunk card must add up to it. A refusal
      // throws before the first write, so nothing is recorded, no ghost is drawn and nothing settles.
      const check = checkStakeScore({ mode: match.mode, score, card: body?.card, killSwitch: killSwitchOn() });
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
        await tx.competitionMatch.update({ where: { id: matchId }, data });
        await appendMatchEvent(tx, matchId, 'SCORE_SUBMITTED', userId, {
          player: isP1 ? 'p1' : 'p2', score, ...(card ? { card: forWire(card) } : {}),
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
        // HOTFIX (2026-09-24): sessions are read under the key GameShell saves them under. A duel stored as 'musicAcademy'
        // reads 'music' here. Raw, it found no sessions and drew its rival off the default baseline of 100 on a 5000 scale.
        const sessionMode = arenaModeKey(match.mode);
        const [recent, population] = await Promise.all([
          tx.gameSession.findMany({
            where: { userId, mode: sessionMode, createdAt: { lt: match.createdAt } },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { score: true },
          }),
          tx.gameSession.findMany({
            where: { mode: sessionMode, createdAt: { lt: match.createdAt } },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: { score: true },
          }),
        ]);
        const draw = drawRivalScore({
          seed: match.seed,
          mode: sessionMode,
          playerHistory: recent.map((r: { score: number }) => r.score),
          populationMedian: population.length ? median(population.map((r: { score: number }) => r.score)) : null,
        });
        // HOTFIX (2026-09-24): the house is held to the same ceiling as the player. A cold-start baseline on another
        // scale (tennis draws around 21 in a first-to-4-games match) posted a score no human could reach.
        const ghostScore = check.ceilingApplied ? Math.min(draw.score, check.ceiling.max) : draw.score;
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
