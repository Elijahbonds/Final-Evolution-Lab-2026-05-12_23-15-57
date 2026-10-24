/**
 * lib/rival-history.ts — which past sessions in a mode may set a rival, a ghost or an opponent's score. Pure.
 *
 * BASEBALL-GHOST (owner decision, 2026-10-23: "ignore old scores"). Until DERBY-KEY (#403) the home-run derby saved its
 * sessions under 'baseball', scored in the hundreds. Three-inning Baseball keeps 'baseball' (runs, at most 27; arena
 * baseline 19). So every 'baseball' session from before the cutoff is a derby night on another scale: the arena ghost
 * drew its rival from them and the ceiling clamped it to 27, and a Quick Match could at best be tied. Anything that reads
 * past 'baseball' scores to pick a rival or a stake reads only the sessions created at or after the cutoff; with none
 * left, the arena ghost falls to its cold-start baseline (ARENA_SCORE_BASELINES.baseball, 19).
 *
 * Also applied to the end card's account personal best (lib/records/account-bests), so an old derby 300 never hides a
 * three-inning best. Not applied to profile/cards history: those show what was played.
 */

import { canonicalModeKey } from '@/lib/game-data';

/**
 * The first moment a 'baseball' session can be a three-inning game and not a derby night.
 *
 * assumption: #403 (the derby-key split) merged into lane/finish-release at 2026-10-23T23:32:06Z and auto-deploys to
 * production after its release CI (in progress past midnight UTC). Until it ships, production keeps saving derby nights
 * under 'baseball', so the coordinator set this to 06:00 UTC on 10-24, safely after that deploy. A later cutoff only
 * costs a few three-inning games falling back to the house baseline of 19.
 */
export const BASEBALL_INNINGS_SINCE = '2026-10-24T06:00:00Z';

/** Session keys whose older history is on another game's scale, and the first instant that counts (ISO, UTC). */
export const RIVAL_HISTORY_SINCE: Readonly<Record<string, string>> = {
  baseball: BASEBALL_INNINGS_SINCE,
};

/** The earliest createdAt a session in `mode` may have to set a rival or a stake, or null when all history counts. */
export function rivalHistorySince(mode: string | null | undefined): Date | null {
  const iso = RIVAL_HISTORY_SINCE[canonicalModeKey(mode)];
  return iso ? new Date(iso) : null;
}

