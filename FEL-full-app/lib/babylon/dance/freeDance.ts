// freeDance — THE CYPHER'S FREE DANCE, as pure decisions (lane/dance-extras-2, owner 2026-10-24: "a no-score free-dance mode: dance to
// any song with no judging pressure"; the re-land of closed PR #46's toggle on today's dance code, not a merge of it).
//
// WHAT IT IS. A switch on the pick screen (X: FREE ON / FREE OFF). With it on, the song plays to its end with:
//   · NO JUDGE — no step is fired, judged or missed (DanceMode never runs the performance's update or hit in free dance), so there is
//     no score, combo, MISS, grade or STYLE, and no cue lane to keep up with;
//   · THE BAND IN FULL — every part the song has plays from the first beat (fillBand), where a judged run has to earn each one;
//   · EVERY FACE BUTTON A MOVE — A B X Y (and a trigger pull or SPACE, as an A) each dance the next move of the family MATCH gives that
//     button, exactly as inside a chart's freestyle section (freestyle.ts FreestyleDeck): the player picks the moves, nobody marks them.
// The run ends with a card that says FREE DANCE and posts the run with score 0 and `freeDance` + `endless` in its stats.
//
// WHAT IT PAYS: NOTHING (lib/session-payout.ts isFreeDanceSession; app/api/sessions records it on its run, unpaid, with no GameSession
// row — the AGENT / PLAYTEST path). The owner's rule (2026-10-24): "pay nothing beyond whatever the existing no-score / free-play floor
// rule allows". The rules that exist: a played no-score run's floor (Prove It's payFloorOnly and the endless ceiling's floor: sessionXp(0)
// = 10 XP, sessionShards(0) = 1 shard) and the no-score CREATION session (nothing). Free dance pays the lower, nothing, because the floor
// is paid THROUGH a GameSession row, and a score-0 dance row would be read by the Arena's rival draw (arena-ghost: the player's last ten
// scores in the mode), today's daily goals and season XP's first-of-day count — the "never feeds rivals or leaderboards" rule. No row,
// nothing paid, nothing anyone ranks. (A row-less run that still paid the floor would slip the daily cap and the finish rate limit,
// which both count GameSession rows.) sessions-route.test.ts holds the route to it.
//
// WHERE IT IS OFFERED: free play only. Any session kind whose score someone else meets — an Arena duel, a friend challenge, a challenge
// link, the Signature ladder, a Story node, the Carnival relay, netplay, a party match, a ranked or agent run (the feel panel's own
// list, lib/feel-panel/sessionGate.ts FEEL_BLOCK_PARAMS) — and a head-to-head chart (chartPlay.comparedRun) never shows it: X stays an
// empty socket on the pick screen and DanceMode keeps free dance off. Dance staking stays paused (lib/stakingPause.ts) and is not read
// or touched here.
import type { FelInput } from '../core/InputBus';
import { FEEL_BLOCK_PARAMS } from '@/lib/feel-panel/sessionGate';
import { comparedRun, matchPress } from './chartPlay';
import type { PadSlot } from './freestyle';

/** The stats key a free-dance run carries (lib/session-payout.ts FREE_DANCE_STAT reads the same name; freeDance.test pins the two). */
export const FREE_DANCE_STAT = 'freeDance';
/** A free-dance run has no score: it posts this (the route refuses anything else from a free-dance run). */
export const FREE_DANCE_SCORE = 0;
/** And this outcome: never 'GREAT', which the timing host reads as a win. */
export const FREE_DANCE_OUTCOME = 'GOOD';

/** The pick screen's chip while it is on, and the card's first words. */
export const FREE_DANCE_CHIP = 'FREE DANCE · NO SCORE · NO PAY';
/** The hint at GO in a free-dance run (a judged run's says how the band is earned; here it is all there already). */
export const FREE_GO_HINT = 'Free dance — no judge, no score, the whole band plays. Every button is a move: A B X Y';

/**
 * Why free dance is NOT offered on this page, or null when it is. `search` is the page's query string (with or without its '?').
 * Blocked by any session kind the feel panel blocks (an Arena duel, a challenge, the ladder…) and by a head-to-head chart. Pure.
 */
export function freeDanceBlock(search: string | null | undefined): string | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search ?? ''); } catch { return 'unknown'; }
  for (const [key] of FEEL_BLOCK_PARAMS) if (q.has(key)) return key;
  if (comparedRun(search ?? '')) return 'compared';
  return null;
}

/**
 * The button a free-dance press dances, or null (not a move). A face button is itself; a trigger pull or SPACE (`tap`, from
 * SongClock.danceTap) is an A — the same reading MATCH and the freestyle section give a press (chartPlay.matchPress). A release is
 * never a move.
 */
export function freeDanceSlot(e: FelInput, tap: boolean): PadSlot | null {
  return matchPress(e, tap);
}

/** The free-dance run's stats: what the card and the session read. No judge counts at all (no hits, rounds, stars or accuracy). */
export function freeDanceStats(o: { moves: number; bpm: number; difficulty: number }): Record<string, number> {
  return { [FREE_DANCE_STAT]: 1, endless: 1, moves: Math.max(0, Math.floor(o.moves)), bpm: o.bpm, difficulty: o.difficulty };
}

/** Is this result (a GameResult / SessionResult) a free-dance run? The shell asks before it mints a challenge link from it. */
export function isFreeDanceResult(r: { stats?: Readonly<Record<string, unknown>> | null } | null | undefined): boolean {
  const v = r?.stats?.[FREE_DANCE_STAT];
  return v === 1 || v === true;
}

/** The card's line for a free-dance run (the timing host's headline and the results banner). */
export function freeDanceHeadline(moves: number): string {
  const n = Math.max(0, Math.floor(moves));
  return `FREE DANCE · ${n} MOVE${n === 1 ? '' : 'S'} · NO SCORE`;
}

/** The pick screen's control line: X is named only where free dance is offered. */
export function pickControls(freeOffered: boolean): string {
  return `◀ ▶ TRACK · ▲ ▼ LEVEL · Y MATCH${freeOffered ? ' · X FREE' : ''} · A START`;
}

/** What a band has to answer for fillBand: a judged step (the stem bands and a community song) or a clean hit (your own song). */
export interface FillableBand {
  judge?: (cat: never, judgement: 'PERFECT') => void;
  level?: (cat: never) => number;
  hit?: () => unknown;
}

/** How many judgements fillBand gives a part at most: far past any band's top level (each PERFECT steps a level up). */
export const FILL_MAX_STEPS = 64;

/**
 * THE BAND IN FULL: every part plays from the first beat. A stem band (and a community song) is told PERFECT for each family until its
 * level stops rising; your own song (YourSongBand, which counts clean hits, not families) is given clean hits until every part has
 * joined. Returns how many judgements it took. Display and sound only: nothing here reaches a judge.
 */
export function fillBand(band: FillableBand | null | undefined, cats: readonly string[]): number {
  if (!band) return 0;
  let n = 0;
  if (typeof band.hit === 'function' && typeof band.judge !== 'function') {
    for (let i = 0; i < FILL_MAX_STEPS * 4; i++, n++) band.hit();
    return n;
  }
  if (typeof band.judge !== 'function') return 0;
  for (const cat of cats) {
    for (let i = 0; i < FILL_MAX_STEPS; i++) {
      const before = band.level ? band.level(cat as never) : NaN;
      band.judge(cat as never, 'PERFECT');
      n++;
      if (band.level && band.level(cat as never) === before) break;
    }
  }
  return n;
}
