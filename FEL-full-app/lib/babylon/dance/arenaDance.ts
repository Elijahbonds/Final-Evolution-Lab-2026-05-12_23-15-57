// lib/babylon/dance/arenaDance.ts — the Cypher's side of an Arena dance duel (MUSIC-SUITE P9, 2026-09-29; owner decision
// #10: "Arena dance (fixed): same house song for both players, accuracy-based score; own songs free play only"). PURE
// except the storage it is handed (DanceMode hands window.sessionStorage; the tests hand a stub), so every decision the
// room makes about a staked set is tested in node.
//
// WHAT WAS WRONG: no dance file read ?arena= (lib/stakingPause.ts's header, P1). A duel opened the ordinary pick screen, the
// player chose any track — their own export included — and the shell submitted whatever points total the run ended on:
// the song decided the duel, and nothing checked the number. What the room does now in an Arena run (DanceMode.ts, the
// MUSIC-SUITE P9 "ARENA" blocks), mirroring the Groove Academy's P6 Arena set:
//   * the song is the duel's HOUSE SONG (houseSong.ts houseSongFor(match id) — the same on the server): no pick screen, no
//     browsing, no free dance, no difficulty; the chart is houseSongSteps, the one the server rejudges;
//   * the rules are said BEFORE the count-in (DANCE_ARENA_RULES: one attempt, used the moment START is pressed, leaving
//     after that scores 0), with the song on the banner, and nothing starts until the player presses START;
//   * START posts the attempt's start (/api/arena/music-attempt {phase: 'start', attemptId} — the route takes dance duels
//     through the same code as music's, lib/arena-music.ts HOUSE_SET_RULES) and only a 'play' answer counts in. A used
//     attempt (a reload, another tab) is SETTLED now (arenaUsedEnd): the kept presses of a set whose finish never landed
//     are sent, a finished one's recorded score goes in, and a set left after START goes in as 0 (#29);
//   * every judged press and release goes on the list (DanceMode judgePress / judgeRelease — the one seam), on the heard
//     clock from beat 0 (houseSong.ts dancePress);
//   * at the end the list is posted ({phase: 'finish', taps}; kept on the device until the Arena has it — SEND AGAIN with
//     A), and the shell is handed judgeDanceSet's ACCURACY score — THE number the server reruns at submit and must equal —
//     or, when the Arena already had another list for this attempt, the score on file (arenaFinishEnd).
// The posting itself (retries, timeout, the start/finish verdicts) is lib/babylon/music/arenaAttempt.ts, shared as it is.

import {
  houseSongFor, houseSongTrack, judgeDanceSet, parseDancePresses, DANCE_ARENA_RULES, DANCE_ARENA_SCALE,
  type HousePress, type HouseSong, type DanceSetVerdict,
} from './houseSong';
import { pickBanner } from '../core/danceTracks';
import type { ArenaFinishVerdict } from '../music/arenaAttempt';

/** Where the room is in its one attempt. */
export type ArenaDancePhase = 'ready' | 'starting' | 'playing' | 'finishing' | 'unsent' | 'refused' | 'done';

/** The duel this run was staked in: `?arena=<matchId>` (the id the shell submits under), or null for free play. */
export function arenaMatchFromQuery(search: string | null | undefined): string | null {
  if (!search) return null;
  try {
    const id = new URLSearchParams(search).get('arena');
    return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
  } catch { return null; }
}

/**
 * The rule as the room's top chip says it — the timing host draws `round` (top chip), `banner` (centre) and `nextStep`
 * (bottom line) for dance, and no `hint` (components/games/timing-babylon.tsx; a shared file — PR #19 holds edits to it —
 * so this phase says it in the fields that are drawn). The whole DANCE_ARENA_RULES line is said in the Arena lobby before
 * anything is staked (components/arena-view.tsx) and rides in `hint` for a host that draws it.
 */
export const ARENA_DANCE_CHIP = 'ARENA · ONE ATTEMPT — USED AT START · LEAVING AFTER THAT SCORES 0 · NO PAUSE';   // MUSIC-SUITE P9 FIX PASS: + NO PAUSE

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): a dance duel's house song, said in the Arena lobby — on an OPEN challenge before
 * anyone joins it, and on the player's own duels (the create confirmation lands there). The song is houseSongFor(match
 * id), computable from the client bundle the moment create answers, and CANCEL refunds a waiting duel in full, so a
 * creator could cancel and re-post until the pick was the song they had practised (difficulty 1 to 6) while the joiner
 * staked without being shown it. Now both sides stake knowing it. Pure (the lobby is a client component).
 */
export function houseSongLine(matchId: string): string {
  const h = houseSongFor(matchId);
  const t = houseSongTrack(h);
  return `HOUSE SONG: ${t.name.toUpperCase()} · DIFFICULTY ${h.difficulty}/6 · ${h.bpm} BPM`;
}

/** What the ready screen shows before START: the house song (never a pick), the rule, and the one button. */
export function arenaReadyHud(house: HouseSong): { round: string; banner: string; nextStep: string; hint: string } {
  return {
    round: ARENA_DANCE_CHIP,
    banner: pickBanner(houseSongTrack(house)),
    nextStep: 'A  START MY ONE ATTEMPT',
    hint: DANCE_ARENA_RULES,
  };
}

// ── the set kept on the device until the Arena has it (arenaAttempt.ts saveArenaFinish's twin, for presses) ──────────
type StoreLike = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
export const arenaDanceKey = (matchId: string): string => `fel.arena.dance.finish.${matchId}`;

/** Keep the finished set's presses for this duel (sessionStorage: this tab, this visit). false = nothing could be kept. */
export function keepDanceFinish(store: StoreLike | null | undefined, matchId: string, presses: readonly HousePress[]): boolean {
  try { store?.setItem(arenaDanceKey(matchId), JSON.stringify(presses)); return !!store; } catch { return false; }
}
/** The kept presses for this duel, checked as the server checks them (parseDancePresses), or null. */
export function readDanceFinish(store: StoreLike | null | undefined, matchId: string): HousePress[] | null {
  try {
    const raw = store?.getItem(arenaDanceKey(matchId));
    if (!raw) return null;
    const p = parseDancePresses(houseSongFor(matchId), JSON.parse(raw));
    return p.ok ? p.presses : null;
  } catch { return null; }
}
export function clearDanceFinish(store: StoreLike | null | undefined, matchId: string): void {
  try { store?.removeItem(arenaDanceKey(matchId)); } catch { /* nothing kept */ }
}

/** What the room hands the shell at the end of an Arena run, and the line it shows first. */
export interface ArenaDanceEnd {
  /** The Arena score (accuracy × 10,000): the score the shell submits and the server rejudges. */
  score: number;
  /** The judged set it came from (the rejudge of the list the room recorded, or of nothing for a used attempt). */
  verdict: DanceSetVerdict;
  line: string;
}

const fmt = (n: number): string => n.toLocaleString('en-US');
/** An Arena score as the player reads it: 8,237 = 82.37 %. */
export function arenaScoreWords(score: number): string {
  return `${fmt(score)} (${(score / (DANCE_ARENA_SCALE / 100)).toFixed(2)} % accuracy)`;
}

/**
 * The finish landed (or the Arena already had one): the score to hand the shell. The Arena's recorded score wins when it
 * differs — another tab's list got there first, and that list is the one the server rejudges at submit.
 */
export function arenaFinishEnd(house: HouseSong, presses: readonly HousePress[], v: Extract<ArenaFinishVerdict, { kind: 'sent' }>): ArenaDanceEnd {
  const verdict = judgeDanceSet(house, presses);
  const score = v.score ?? verdict.score;
  if (score === verdict.score) {
    return { score, verdict, line: `Judged on the house song: ${arenaScoreWords(score)} is the score the Arena checks.` };
  }
  return { score, verdict: { ...verdict, score }, line: `The Arena already had a set for this attempt: ${arenaScoreWords(score)} is the score on file, and it goes in.` };
}

/**
 * START answered 409 ONE_ATTEMPT (a reload, another tab): the attempt is used, and what it scores goes in NOW. `kept` =
 * the presses of a set whose finish never reached the Arena (they are to be SENT first: 'send'); a finished attempt's
 * recorded score; or 0 for a set left after START (decision #29, said before the count-in).
 */
export function arenaUsedEnd(
  house: HouseSong, kept: readonly HousePress[] | null, v: { finished: boolean; score: number },
): { kind: 'send'; presses: HousePress[] } | { kind: 'end'; end: ArenaDanceEnd } {
  if (!v.finished && kept) return { kind: 'send', presses: [...kept] };
  if (v.finished) {
    const mine = kept ? judgeDanceSet(house, kept) : null;
    const verdict = mine && mine.score === v.score ? mine : { ...judgeDanceSet(house, []), score: v.score };
    return { kind: 'end', end: { score: v.score, verdict, line: `Your set is already in the Arena: ${arenaScoreWords(v.score)} — it goes in now.` } };
  }
  return { kind: 'end', end: { score: 0, verdict: judgeDanceSet(house, []), line: 'Your one attempt was used and left after START: it scores 0, and that goes in now.' } };
}

/** The line the room shows while a finished set has not reached the Arena (A sends it again). */
export const ARENA_DANCE_UNSENT_HINT = 'A  SEND AGAIN';

/**
 * MUSIC-SUITE P9 FIX PASS (2026-09-29): what the room says when START is pressed mid-set in an Arena run — P6's words for
 * the Groove Academy's Arena set (StudioMode.tsx), owner decision #40. The song does not hold (danceRoomFlow.holdAction's
 * `arena`): the harness's pause overlay is only an overlay, and every step it covers passes as a MISS.
 */
export const ARENA_DANCE_NO_PAUSE = 'An Arena set runs to its end — there is no pause';
