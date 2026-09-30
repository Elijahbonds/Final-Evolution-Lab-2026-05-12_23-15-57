/**
 * lib/stakingPause.ts — THE ONE LIST OF MODES THAT CANNOT BE STAKED RIGHT NOW (MUSIC-SUITE P1, 2026-09-25).
 *
 * Owner decision #9 (outbox/finish-release/musicsuite/DECISIONS.md, 2026-09-25): "pause staking both now". Music and
 * dance come out of the Arena (Quick Match, a posted duel, accepting someone's posted duel) and out of friend challenges
 * (the /multiplayer online challenge and its pass-and-play twin). Each comes back when its own fairness phase lands.
 * Free play is not touched: /play/music and /play/dance without ?arena= never read this file.
 *
 * WHY (the map's findings, understand-wf_3a55346f-032.json; music came back in phase 6, dance in phase 9 — see the list below):
 *   · dance — the song you pick decides a staked duel, not the dancing. A flawless BATTLE run tops out at 4,355 against a
 *     first-duel rival of 5,000 ±18 % (lib/arena-rivals.ts:180), while a player's own 64-bar export can reach the 79,680
 *     ceiling (lib/arena-score-integrity.ts danceCeiling). No dance file reads ?arena=.
 *   · music — an Arena set is not one set: STOP/PLAY and the BUILD tab restart it as often as you like before END SET,
 *     tempo and swing stay adjustable mid-set, and every 16th step is a note whatever the grid holds (performSet.ts).
 *
 * WHAT A PAUSE STOPS, and what it deliberately leaves alone:
 *   · NEW stakes are refused before anything is written — no row, no event, no Lab Credits locked:
 *     app/api/arena/create, app/api/arena/quick-match, app/api/arena/join (joining puts up a new stake),
 *     app/api/v1/mp/create and app/api/v1/mp/local (via isMpChallengeOpen), and the dark real-money engine's
 *     app/api/competition/create + join.
 *   · The lobbies stop offering them: /api/arena/config lists only stakeable modes (and names the paused ones), the
 *     Arena's OPEN CHALLENGES hides a paused duel nobody can accept, and the multiplayer mode picker skips them.
 *   · A duel that ALREADY EXISTS still finishes: /api/arena/submit-score has no pause check (the mode keeps its ceiling
 *     in lib/arena-score-integrity.ts, so a staked set is still bounded), the MY DUELS row keeps its PLAY link, a posted
 *     duel nobody joined is refunded by its creator's CANCEL (/api/arena/cancel), and an open friend challenge can still
 *     be accepted and settle (/api/v1/mp/join — it locks no stake).
 *
 * The key is the mode as its GameShell saves sessions (MODE_INFO's key). The Arena stores duels under that key; a
 * friend challenge's key goes through sessionModeFor first; an old spelling ('musicAcademy') goes through
 * canonicalModeKey, so a duel stored before the rename is paused too.
 *
 * TO RE-ENABLE A MODE: delete its line below. Nothing else changes — every gate and every lobby reads this set.
 */
import { canonicalModeKey, MODE_INFO } from './game-data';

// MUSIC-SUITE P6 (2026-09-26): 'music' is out — its fairness phase landed. An Arena music set is the duel's house beat
// (lib/babylon/music/houseBeat.ts: seeded by the match, tempo and swing locked), one attempt with a count-in recorded by
// /api/arena/music-attempt, a score the server rejudges from the recorded taps (lib/arena-music.ts, submit-score), the
// house-beat ceiling (lib/arena-score-integrity.ts) and a rival banded only on rejudged sets (lib/arena-rivals.ts).
// MUSIC-SUITE P9 (2026-09-29): 'dance' is out too — owner decisions #9 and #10, its fairness phase landed. An Arena dance
// set is the duel's HOUSE SONG (lib/babylon/dance/houseSong.ts: one of the six FEL songs and its chart, seeded by the
// match; no pick screen, difficulty locked; own songs free play only), one attempt with a count-in recorded through the
// same /api/arena/music-attempt (lib/arena-music.ts HOUSE_SET_RULES.dance), an ACCURACY score 0..10,000 the server
// rejudges from the recorded presses (judgeDanceSet, submit-score), the house song's ceiling (10,000 —
// lib/arena-score-integrity.ts ARENA_STAKE_CEILINGS) and a rival banded only on rejudged dance sets, 5,000 until then
// (lib/arena-rivals.ts). FRIEND CHALLENGES on dance stay closed on their own gate (lib/mp/match-core.ts
// MP_HOUSE_SET_ONLY): the challenge engine settles stored best scores, which carry no song, so "the same house song for
// both" (decision #10, "friend challenges same rule") cannot hold there yet.
export const STAKING_PAUSED: ReadonlySet<string> = new Set<string>([]);

/** Is a NEW stake or challenge on this mode refused right now? Takes any spelling a stored row or an old client may use. */
export function isStakingPaused(mode: string | null | undefined): boolean {
  return STAKING_PAUSED.has(canonicalModeKey(mode));
}

/** The error code every refusing route answers with, so a client (and a grep) can tell a pause from a bad mode. */
export const STAKING_PAUSED_CODE = 'STAKING_PAUSED';
/** 409: the mode is real and playable; a stake on it is what is unavailable right now. */
export const STAKING_PAUSED_STATUS = 409;

/** The line a player reads when a stake is refused, or beside a paused mode in a lobby. */
export function stakingPausedDetail(mode: string | null | undefined): string {
  const key = canonicalModeKey(mode);
  const name = MODE_INFO[key]?.name ?? key;
  return `Staking on ${name} is paused while its duels are made fair. Free play is open, and a duel you already have still plays and settles.`;
}

/** The paused modes as a lobby lists them. */
export function pausedStakeModes(): { key: string; name: string; detail: string }[] {
  return Array.from(STAKING_PAUSED).map((key) => ({ key, name: MODE_INFO[key]?.name ?? key, detail: stakingPausedDetail(key) }));
}
