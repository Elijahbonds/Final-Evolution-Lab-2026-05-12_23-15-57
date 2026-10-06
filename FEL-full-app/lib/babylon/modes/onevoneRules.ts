// onevoneRules — the 1v1's difficulty knobs, its win condition (first to 11, or win by 2), the contextual hint and the full
// control list, the release pips and the box score, as pure logic (IMPROVE 2026-10-06, owner-picked items #1 #2 #3 #4 #10 from
// the onevone section of docs/IMPROVEMENTS-2026-10-05.md). Nothing here touches the scene: OneVOneMode reads these and decides
// what to show; the host (components/games/basketball-babylon.tsx) draws the hint, the pips and the pause list; lib/proofLine
// prints the box score on the end card.

import type { Tier } from '../core/Difficulty';

// ── #2 DIFFICULTY ────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * What the shared OPPONENT pick (core/Difficulty: ROOKIE / PRO / ELITE, the one ladder the splash offers) does to the 1v1 rival.
 * Both knobs change what he DOES, not how fast he does it:
 *  · `defenderAggression` is the DefenderBrain's on-ball poke roll (aggression × 2 % a frame inside 1.1 m; 0.7 since the mode
 *    was written) — a rookie reaches for the ball less, an elite more;
 *  · `attackerAggression` multiplies Nerve's aggression where the mode turns it into AttackerBrain.patience — above 1 he pulls up
 *    out of a contain sooner and forces the look, below 1 he waits, giving the defender time to set.
 * PRO is the game exactly as it has always been tuned: 0.7 and ×1.
 */
export interface OneVOneKnobs { defenderAggression: number; attackerAggression: number }
export const ONEVONE_TIER: Readonly<Record<Tier, OneVOneKnobs>> = {
  rookie: { defenderAggression: 0.5, attackerAggression: 0.85 },
  pro: { defenderAggression: 0.7, attackerAggression: 1 },
  elite: { defenderAggression: 0.85, attackerAggression: 1.15 },
};
/** The rival's patience off the scoreboard (Nerve's aggression) and the tier: the old `1 / max(0.5, aggression)` at PRO. */
export function attackerPatience(nerveAggression: number, knobs: OneVOneKnobs): number {
  return 1 / Math.max(0.5, nerveAggression * knobs.attackerAggression);
}

// ── #3 THE WIN CONDITION ─────────────────────────────────────────────────────────────────────────────────────────────
export interface WinRule {
  /** First to this. */
  target: number;
  /** The winner must also lead by 2 (make-it-take-it lets a run end a game with no answer; this gives one). */
  winBy2: boolean;
  /** With win-by-2, the first to this wins whatever the margin — a game that cannot end is not a game. */
  cap: number;
}
/** The cap on a win-by-2 game (street rules: by 2, hard cap 15). */
export const WIN_BY_2_CAP = 15;
/** The biggest bucket there is (a three). */
export const BUCKET_MAX = 3;
export function winRule(target: number, winBy2: boolean): WinRule { return { target, winBy2, cap: WIN_BY_2_CAP }; }
/** Who has won at this score, or null while it is still live. Without win-by-2 it is exactly `score >= target` (mine first). */
export function gameWinner(me: number, foe: number, r: WinRule): 'me' | 'foe' | null {
  if (!r.winBy2) return me >= r.target ? 'me' : foe >= r.target ? 'foe' : null;
  if (me >= r.cap || foe >= r.cap) return me > foe ? 'me' : 'foe';   // (one bucket at a time: only the side that just scored can be past the cap)
  if (me >= r.target && me - foe >= 2) return 'me';
  if (foe >= r.target && foe - me >= 2) return 'foe';
  return null;
}
/** Game point for the side with `mine`: one more two wins it (the MC's "game point" call — 9 under first to 11, as always). */
export function onePointAway(mine: number, theirs: number, r: WinRule): boolean {
  return gameWinner(mine + 2, theirs, r) === 'me';
}
/** The most a WON game can post: one short of where it ends, plus the biggest bucket. 13 for first to 11 — the Arena stake
 *  ceiling for hoops1v1 (lib/arena-score-integrity firstToCeiling); a win-by-2 game can go to cap − 1 + 3 = 17, the session
 *  ceiling (arena-score-integrity SESSION_RULES_CEILINGS, owner 2026-10-06). */
export function postedMax(r: WinRule): number { return (r.winBy2 ? r.cap : r.target) - 1 + BUCKET_MAX; }
/** Where the READY screen's win-by-2 pick is remembered (this device only; off unless the player turned it on). */
export const WIN_BY_2_KEY = 'fel-1v1-winby2';
/** The query keys of a head-to-head run: an Arena stake, an async mp challenge, a challenge link. Both players must play the
 *  same game there, and the stake is held to the first-to-11 ceiling (13). */
export const HEAD_TO_HEAD_PARAMS: readonly string[] = ['arena', 'mp', 'c'];
/** Is the win-by-2 pick offered on this run? Never on a staked or head-to-head run. */
export function winBy2Offered(search: string): boolean {
  const q = new URLSearchParams(search);
  return !HEAD_TO_HEAD_PARAMS.some((k) => q.get(k));
}
/** The remembered pick: on only when the player turned it on (owner 2026-10-06: off by default). */
export function readWinBy2Pick(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(WIN_BY_2_KEY) === '1'; } catch { return false; }
}
export function writeWinBy2Pick(on: boolean): void {
  try { if (on) window.localStorage.setItem(WIN_BY_2_KEY, '1'); else window.localStorage.removeItem(WIN_BY_2_KEY); } catch { /* convenience only */ }
}
/**
 * Is win-by-2 on for this run? OWNER DECISION 2026-10-06 (moderate): a PLAYER OPTION, off by default — the toggle on the 1v1
 * READY screen (components/games/onevone-win-by-2.tsx) remembers it (`picked`, readWinBy2Pick); `?winby2=1` stays as the
 * development seam. Never on a staked or head-to-head run (winBy2Offered), so the Arena stake ceiling stays first to 11 (13);
 * a session may post the win-by-2 game's 17 (lib/arena-score-integrity SESSION_RULES_CEILINGS).
 */
export function winBy2Requested(search: string, o: { picked: boolean; dev: boolean }): boolean {
  if (!winBy2Offered(search)) return false;
  if (o.picked) return true;
  return o.dev && new URLSearchParams(search).get('winby2') === '1';
}

// ── #1 THE CONTEXTUAL HINT, AND THE FULL LIST FOR THE PAUSE SCREEN ───────────────────────────────────────────────────
/** Every control on offence (what the old always-on hint said, ~1,100 characters re-sent every possession). The pause shows it. */
export const CONTROLS_OFFENCE = 'HOLD R2 (SHIFT) + a direction to SPRINT · R2 + SQUARE (SHIFT + L) at the rim = DUNK, SQUARE (L) alone = LAY IT IN · SQUARE (L): hold, release in the green · L2 (F): POST UP · RIGHT STICK (2K, relative to the ball hand): flick TOWARD the ball = hesi · AWAY = between the legs · UP-AWAY = crossover · UP = in and out · DOWN-AWAY = behind the back · DOWN = STEP-BACK (shoot inside it = the step-back jumper) · UP-TOWARD = size-ups · ROTATE = SPIN · hold R2 with any of them = the ESCAPE (crossover → momentum cross · down → the SNATCHBACK · rotate → the STEEZO ROLL) · hold the stick = PAUSIN · hold L2 (F) or L1 (Q) near the block to POST UP (back to the rim: SQUARE = HOOK · stick OFF the rim + SQUARE = FADE, with R2 = SHIMMY FADE · stick AT the rim + SQUARE = DROP STEP · swing the stick across = SPIN · let go early = PUMP FAKE, then SQUARE again = UP AND UNDER) · drive into a body to SPIN off him';
/** Every control on defence. */
export const CONTROLS_DEFENCE = 'STAY IN FRONT — they sidestep, you slide · HOLD L2 (F): SIT DOWN and slide faster · SQUARE (L): STEAL as the ball crosses over (hold it for a HAND UP) · TRIANGLE (I): jump on the gather to BLOCK · HOLD CIRCLE (K): plant and TAKE THE CHARGE · L1: BOX OUT';

/** What the hint reads. One line for the state the player is in. */
export interface HintState {
  possession: 'mine' | 'defense';
  loose: boolean;
  shooting: boolean;
  dunking: boolean;
  /** The flight is a SHOWTIME dunk (the flush is timed). */
  showtime: boolean;
  posting: boolean;
  carrying: boolean;
  /** Standing still with the ball (triple threat). */
  set: boolean;
  /** Inside the drive dunk's range of the rim: the drive decides dunk / layup. */
  nearRim: boolean;
  /** The ref's three-second warning is up. */
  paintWarn: boolean;
  /** Their possession: 'check' | 'drive' | 'shot' | 'over'. */
  defPhase: string;
  /** The rival is gathering (the block cue). */
  gathering: boolean;
}
export const HINT_PAINT = 'GET OUT OF THE PAINT';
export function hintFor(s: HintState): string {
  if (s.possession === 'defense') {
    if (s.loose) return 'LOOSE BALL — GO GET IT · L1 BOXES OUT';
    if (s.defPhase === 'shot') return 'SHOT UP — L1 BOX OUT · TRIANGLE (I) TO CONTEST';
    if (s.gathering) return 'HE IS GATHERING — TRIANGLE (I) TO BLOCK';
    return 'STAY IN FRONT · SQUARE (L) STEAL ON THE CROSSOVER · HOLD CIRCLE (K) TAKE THE CHARGE';
  }
  if (s.paintWarn) return HINT_PAINT;
  if (s.dunking) return s.showtime ? 'SQUARE AT THE RIM — TIME THE FLUSH' : 'FLICK THE RIGHT STICK FOR A TRICK';
  if (s.shooting) return 'LET GO OF SQUARE (L) IN THE GREEN · EARLY = PUMP FAKE';
  if (s.loose || !s.carrying) return 'GO GET THE BOARD · L1 BOXES OUT';
  if (s.posting) return 'POST: SQUARE HOOK · STICK OFF THE RIM + SQUARE FADE · SWING THE STICK = SPIN';
  if (s.nearRim) return 'R2 + SQUARE (SHIFT + L) = DUNK · SQUARE (L) ALONE = LAY IT IN';
  if (s.set) return 'TAP THE STICK TO JAB · SQUARE (L) SHOOT · L2 (F) POST UP';
  return 'RIGHT STICK = DRIBBLE MOVES · R2 (SHIFT) SPRINT · SQUARE (L) SHOOT';
}
/** How long a hint holds before a calmer one may replace it inside the same possession (a body hovering on the "set" line's
 *  speed would otherwise flick it every frame). A possession change, or an urgent line, replaces it at once. */
export const HINT_DWELL_SEC = 0.35;
/** The lines that never wait: the ref's warning, the beats of a shot or a flight, and the block cue. */
export function hintUrgent(text: string): boolean {
  return text === HINT_PAINT || text.startsWith('LET GO OF SQUARE') || text.startsWith('SQUARE AT THE RIM') || text.startsWith('FLICK THE RIGHT STICK')
    || text.startsWith('HE IS GATHERING') || text.startsWith('SHOT UP');
}
/** Should the shown hint change to `want` now? */
export function hintSwap(shown: string, want: string, shownForSec: number, possessionChanged: boolean): boolean {
  if (want === shown) return false;
  return possessionChanged || !shown || hintUrgent(want) || shownForSec >= HINT_DWELL_SEC;
}

// ── #10 THE RELEASE PIPS ─────────────────────────────────────────────────────────────────────────────────────────────
/** How many releases the pips remember. */
export const PIP_COUNT = 5;
/** One letter per graded release, oldest first: p perfect, g good (both green), e early, l late, b brick (way late). A meter that
 *  ran out with the trigger held ('held') is not a release the player timed, so it is not a pip. */
export function pushPip(pips: string, quality: string): string {
  const c = quality === 'perfect' ? 'p' : quality === 'good' ? 'g' : quality === 'early' ? 'e' : quality === 'late' ? 'l' : quality === 'brick' ? 'b' : '';
  if (!c) return pips;
  return (pips + c).slice(-PIP_COUNT);
}
/** The pips' bias read (the line under the dots): which way the misses lean, once there are three releases to read. */
export function pipBias(pips: string): 'EARLY' | 'LATE' | '' {
  if (pips.length < 3) return '';
  let e = 0, l = 0;
  for (const c of pips) { if (c === 'e') e++; else if (c === 'l' || c === 'b') l++; }
  return e >= 2 && e > l ? 'EARLY' : l >= 2 && l > e ? 'LATE' : '';
}

// ── #4 THE BOX SCORE ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface BoxScore { fgm: number; fga: number; threes: number; steals: number; blocks: number; ankles: number }
export const emptyBox = (): BoxScore => ({ fgm: 0, fga: 0, threes: 0, steals: 0, blocks: 0, ankles: 0 });
/** The end card's line: FG 7/12 · 3PT 2 · STL 3 · BLK 1 · ANKLES 2 (a zero count is left out; the FG never is). */
export function boxLine(b: Partial<BoxScore>): string {
  const parts = [`FG ${b.fgm ?? 0}/${b.fga ?? 0}`];
  if (b.threes) parts.push(`3PT ${b.threes}`);
  if (b.steals) parts.push(`STL ${b.steals}`);
  if (b.blocks) parts.push(`BLK ${b.blocks}`);
  if (b.ankles) parts.push(`ANKLES ${b.ankles}`);
  return parts.join(' · ');
}
