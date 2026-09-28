/**
 * lib/arena-ghost.ts — the house rival's score for a Quick Match (GHOST_DUEL), drawn in ONE place.
 *
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): this was inline in /api/arena/submit-score, the only place a Quick Match could
 * settle. The expiry sweep (lib/arena-reclaim.ts) now settles a music Quick Match whose player STARTED a set and never
 * submitted it (owner decision #29: leaving after the count-in scores 0 — the sweep voided and refunded it instead), so
 * the sweep draws the house's score too, and it must be the SAME draw submit-score would have made: same seed, same
 * history (strictly before the duel was created — the submitted score is never an input), same ceiling. One function.
 *
 * Honesty rules (lib/arena-rivals.ts header): the draw never reads the human's score for this duel; it is banded on the
 * player's own recent scores in the mode (music: their past rejudged Arena sets only — RIVAL_FROM_DUEL_SCORES /
 * RIVAL_SCORE_EVENT), else the population's, else the cold-start baseline; the house is held to the player's ceiling.
 */

import { arenaModeKey } from '@/lib/arena';
import {
  drawRivalScore, median, ownDuelScores, RIVAL_FROM_DUEL_SCORES, RIVAL_SCORE_EVENT, storedModeKeys, type RivalDraw,
} from '@/lib/arena-rivals';

export interface HouseDraw { score: number; draw: RivalDraw }

/**
 * The house's score for this duel. `humanId` is the player it is banded on; `ceilingMax` the mode's ceiling as applied to
 * the player (Infinity when the kill switch lifts it). Reads only rows created before `match.createdAt`.
 */
export async function drawHouseScore(
  tx: any,
  match: { mode: string; seed: string; createdAt: Date | string },
  humanId: string,
  ceilingMax: number,
): Promise<HouseDraw> {
  // HOTFIX (2026-09-24): sessions are read under the key GameShell saves them under. A duel stored as 'musicAcademy'
  // reads 'music' here. Raw, it found no sessions and drew its rival off the default baseline of 100 on a 5000 scale.
  const sessionMode = arenaModeKey(match.mode);
  // A mode whose sessions are on another scale than a staked run (music: free play has no end, an Arena set does) is
  // banded on this player's own past duel scores in the mode, never their sessions, and on the baseline until they have
  // one. Past scores above today's ceiling came from before it, and are left out.
  // MUSIC-SUITE P6 (owner decision #12, "old music duel scores stop counting"): and only a duel that carries the player's
  // RIVAL_SCORE_EVENT (a finished house-beat attempt) counts — asked of the database, so the 10 read are 10 that count,
  // and checked again on the rows by ownDuelScores.
  const fromDuels = RIVAL_FROM_DUEL_SCORES.has(sessionMode);
  const scoreEvent: string | undefined = RIVAL_SCORE_EVENT[sessionMode];
  const createdAt = new Date(match.createdAt);
  const [recent, population] = await Promise.all([
    fromDuels
      ? tx.competitionMatch.findMany({
        where: {
          currency: 'LC', mode: { in: storedModeKeys(sessionMode) }, createdAt: { lt: createdAt },
          OR: [{ player1Id: humanId, player1Score: { not: null } }, { player2Id: humanId, player2Score: { not: null } }],
          ...(scoreEvent ? { events: { some: { eventType: scoreEvent, userId: humanId } } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          player1Id: true, player1Score: true, player2Score: true,
          ...(scoreEvent ? { events: { where: { eventType: scoreEvent, userId: humanId }, select: { eventType: true, userId: true }, take: 1 } } : {}),
        },
      }).then((rows: { player1Id: string; player1Score: number | null; player2Score: number | null; events?: { eventType: string; userId: string | null }[] }[]) =>
        ownDuelScores(rows, humanId, ceilingMax, scoreEvent))
      : tx.gameSession.findMany({
        where: { userId: humanId, mode: sessionMode, createdAt: { lt: createdAt } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { score: true },
      }).then((rows: { score: number }[]) => rows.map((r) => r.score)),
    fromDuels
      ? []
      : tx.gameSession.findMany({
        where: { mode: sessionMode, createdAt: { lt: createdAt } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { score: true },
      }),
  ]);
  const draw = drawRivalScore({
    seed: match.seed,
    mode: sessionMode,
    playerHistory: recent,
    populationMedian: population.length ? median(population.map((r: { score: number }) => r.score)) : null,
  });
  // HOTFIX (2026-09-24): the house is held to the same ceiling as the player. A cold-start baseline on another scale
  // (tennis draws around 21 in a first-to-4-games match) posted a score no human could reach.
  return { score: Number.isFinite(ceilingMax) ? Math.min(draw.score, ceilingMax) : draw.score, draw };
}
