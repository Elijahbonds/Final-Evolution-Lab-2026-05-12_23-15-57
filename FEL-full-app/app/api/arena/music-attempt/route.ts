export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { appendMatchEvent, arenaRefund, ArenaError } from '@/lib/arena';
import {
  isMusicDuel, readMusicAttempt, musicAttemptScore, lockMatchRow, isStartReplay, cleanAttemptId, readMusicSeats, houseSeatOf,
  MUSIC_ATTEMPT_START, MUSIC_ATTEMPT_FINISH, PRE_HOUSE_BEAT_REASON, HOUSE_START_MARGIN_MS,
} from '@/lib/arena-music';
import {
  houseBeatFor, houseBeatSummary, houseMinFinishMs, houseCountInMs, houseSetMs, judgeHouseSet, parseHouseTaps, HOUSE_ARENA_RULES,
} from '@/lib/babylon/music/houseBeat';

/** A refusal that COMMITS what it did first (a legacy duel's refund) and still answers non-2xx, with extra fields. */
class Answer { constructor(public readonly status: number, public readonly body: Record<string, unknown>) {} }

/**
 * POST /api/arena/music-attempt — an Arena music duel's ONE attempt (MUSIC-SUITE P6, 2026-09-26; owner decisions #12
 * and #29). The attempt rides in MatchEvent rows (lib/arena-music.ts); there is no schema change.
 *
 *   { matchId, phase: 'start' }            — the room posts this at the count-in, BEFORE the set plays. Recorded once per
 *                                            player per duel; a second start is 409 ONE_ATTEMPT (a reload after the
 *                                            count-in forfeits: the set scores 0 at submit). Answers the beat's summary.
 *   { matchId, phase: 'finish', taps }     — the room posts the tap list it judged when the set ends. Only after a start,
 *                                            only once, no sooner than 90 % of the set after the start, and the list is
 *                                            checked whole (houseBeat.ts parseHouseTaps: at most HOUSE_MAX_TAPS { lane,
 *                                            tMs }). Answers the score the server makes of it — the score submit-score
 *                                            will require.
 *
 * Refused before anything is written: not signed in 401; a bad body 400; no such duel 404; not an Arena (LC) duel or not
 * a music duel 400; not a player in it 403; a duel closed, with no opponent yet (submit-score would refuse its score:
 * starting would burn the attempt), past its expiry, or already scored by this player 409.
 *
 * MUSIC-SUITE P6 FIX PASS (2026-09-26):
 *   · ONE ATTEMPT, UNDER A LOCK. The one-attempt check was a read then an insert with no unique key behind it: two starts
 *     at once (two devices, or a script) both got 200 — two live sets, the better finish posted first. The duel row is
 *     locked first (lib/arena-music.ts lockMatchRow), so the second start reads the first and is refused; the finish too.
 *   · A LOST REPLY IS NOT A LOST ATTEMPT. `attemptId` (the room's, per page): a start repeated with the same id, no finish
 *     yet, within HOUSE_START_RETRY_MS answers the first start again ({ replayed: true }) instead of 409.
 *   · 409 ONE_ATTEMPT now says what the attempt IS ({ finished, score }): the room submits it (0 for a set left after its
 *     count-in — decision #29 — or the rejudge of a set finished and never submitted), so the duel settles now instead of
 *     waiting for its deadline.
 *   · TOO LATE: a start the set cannot finish before the deadline (count-in + set + HOUSE_START_MARGIN_MS) is refused 409
 *     TOO_LATE — its finish would be refused EXPIRED, so the attempt could only score 0.
 *   · A PRE-HOUSE-BEAT DUEL: the other player's stored score has no attempt behind it (their own grid, before this phase —
 *     decision #12 says it stops counting). The duel is refunded to both at START (reason 'pre_house_beat'; 409
 *     PRE_HOUSE_BEAT once the refund commits), so nobody plays a set that cannot settle.
 *   · A FINISH REPEATED WITH THE SAME TAPS (a retry whose first reply was lost) answers the recorded score again.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const matchId = typeof body?.matchId === 'string' ? body.matchId : '';
  const phase = body?.phase;
  if (!matchId || matchId.length > 64) return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
  if (phase !== 'start' && phase !== 'finish') return NextResponse.json({ error: "phase must be 'start' or 'finish'" }, { status: 400 });

  try {
    const attemptId = cleanAttemptId(body?.attemptId);
    const outcome = await prisma.$transaction(async (tx: any) => {
      // MUSIC-SUITE P6 FIX PASS: the duel's row lock first — every read below sees a concurrent start / finish committed
      if (!(await lockMatchRow(tx, matchId))) throw new ArenaError('NOT_FOUND', 'Match not found', 404);
      const match = await tx.competitionMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new ArenaError('NOT_FOUND', 'Match not found', 404);
      if (match.currency !== 'LC') throw new ArenaError('WRONG_BOOK', 'Not an Arena match', 400);
      if (!isMusicDuel(match.mode)) throw new ArenaError('NOT_A_MUSIC_DUEL', 'Only a Groove Academy duel plays a house-beat attempt.', 400);
      const isP1 = match.player1Id === userId;
      const isP2 = match.player2Id === userId;
      if (!isP1 && !isP2) throw new ArenaError('NOT_A_PLAYER', 'You are not in this duel.', 403);
      if (!['ACTIVE', 'WAITING'].includes(match.status)) throw new ArenaError('NOT_SUBMITTABLE', 'This duel is no longer accepting scores.', 409);
      if (!match.player2Id) throw new ArenaError('WAITING_OPPONENT', 'Waiting for an opponent to join — your one attempt waits too.', 409);
      if (match.expiresAt && new Date(match.expiresAt).getTime() <= Date.now()) throw new ArenaError('EXPIRED', 'This duel has expired.', 409);
      const myScore = isP1 ? match.player1Score : match.player2Score;
      if (myScore !== null && myScore !== undefined) throw new ArenaError('ALREADY_SCORED', 'Your score for this duel is already in.', 409);

      const player = isP1 ? 'p1' : 'p2';
      const beat = houseBeatFor(match.id);
      const attempt = await readMusicAttempt(tx, match.id, userId);

      if (phase === 'start') {
        if (attempt.startedAt) {
          // a retry of the start whose reply was lost: the same start again
          if (isStartReplay(attempt, attemptId, Date.now())) {
            return { phase, replayed: true, beat: houseBeatSummary(beat), rules: HOUSE_ARENA_RULES };
          }
          const v = musicAttemptScore(match.id, attempt);
          throw new Answer(409, {
            error: 'ONE_ATTEMPT', finished: !!attempt.finish, score: v.ok ? v.score : 0,
            detail: attempt.finish
              ? 'Your one attempt at this duel is finished — its score goes in now.'
              : 'Your one attempt at this duel has been used. A set left after START scores 0 — that goes in now.',
          });
        }
        // the deadline must leave room for the whole set (its finish is refused EXPIRED past it)
        if (match.expiresAt && new Date(match.expiresAt).getTime() - Date.now() < houseCountInMs(beat) + houseSetMs(beat) + HOUSE_START_MARGIN_MS) {
          throw new ArenaError('TOO_LATE', 'This duel ends before a set could be played to its end — nothing was used.', 409);
        }
        // the other player's score from before the house beat cannot be settled against: refund both, now
        if (houseSeatOf(match) === null) {
          const seats = await readMusicSeats(tx, match);
          if ((isP1 ? seats.p2 : seats.p1).legacy) {
            const feeLc = match.entryFeeCents;
            await arenaRefund(tx, { userId: match.player1Id, matchId: match.id, feeLc });
            await arenaRefund(tx, { userId: match.player2Id, matchId: match.id, feeLc });
            await tx.competitionMatch.update({ where: { id: match.id }, data: { status: 'VOIDED' } });
            await appendMatchEvent(tx, match.id, 'REFUNDED', null, { reason: PRE_HOUSE_BEAT_REASON, feeLc, legacySide: isP1 ? 'p2' : 'p1' });
            return { refusal: new Answer(409, {
              error: 'PRE_HOUSE_BEAT', refunded: true,
              detail: "Your opponent's score in this duel is from before the house beat, so a set can't be settled against it: both stakes were refunded.",
            }) };
          }
        }
        await appendMatchEvent(tx, match.id, MUSIC_ATTEMPT_START, userId, { player, ...houseBeatSummary(beat), ...(attemptId ? { attemptId } : {}) });
        return { phase, beat: houseBeatSummary(beat), rules: HOUSE_ARENA_RULES };
      }

      if (!attempt.startedAt) throw new ArenaError('NOT_STARTED', 'This attempt was never started.', 409);
      if (attempt.finish) {
        // a retry of the same finish (its reply was lost): the recorded score again; anything else is a second finish
        const again = parseHouseTaps(beat, body?.taps);
        if (again.ok && JSON.stringify(again.taps) === JSON.stringify(attempt.finish.taps)) {
          return { phase, replayed: true, taps: again.taps.length, score: judgeHouseSet(beat, attempt.finish.taps).score };
        }
        // (the recorded score rides along: a room whose own list lost the race posts THAT score, which is the one on file)
        throw new Answer(409, { error: 'ALREADY_FINISHED', detail: 'This attempt is already finished.', score: judgeHouseSet(beat, attempt.finish.taps).score });
      }
      if (Date.now() - attempt.startedAt.getTime() < houseMinFinishMs(beat)) {
        throw new ArenaError('FINISHED_TOO_SOON', 'This set finished sooner than it can be played.', 409);
      }
      const parsed = parseHouseTaps(beat, body?.taps);
      if (!parsed.ok) throw new ArenaError(parsed.code, parsed.detail, 400);
      await appendMatchEvent(tx, match.id, MUSIC_ATTEMPT_FINISH, userId, { player, v: beat.v, n: parsed.taps.length, taps: parsed.taps });
      return { phase, taps: parsed.taps.length, score: judgeHouseSet(beat, parsed.taps).score };
    });
    if ('refusal' in outcome && outcome.refusal instanceof Answer) return NextResponse.json(outcome.refusal.body, { status: outcome.refusal.status });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err: any) {
    if (err instanceof Answer) return NextResponse.json(err.body, { status: err.status });
    if (err instanceof ArenaError) return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus });
    console.error('[arena/music-attempt]', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
