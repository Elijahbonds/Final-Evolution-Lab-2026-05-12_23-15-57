// freestyle — THE CYPHER'S FREESTYLE SECTION, as pure decisions (lane/dance-extras, 2026-10-14; the redesign of closed PR #46's
// freestyle for MATCH — owner 2026-10-13: "freestyle where the button picks the move, without fighting MATCH").
//
// WHAT #46 DID, AND WHY IT FOUGHT MATCH. #46's freestyle slot was a press that a button answered with a move of its own choosing,
// and paid timing × a variety factor INTO THE SCORE. Today the four face buttons are MATCH's move families (chartPlay.FAMILY_BUTTON),
// every score value is pinned (the flawless pins in chart.test.ts, lib/arena-score-integrity.ts danceCeiling), and a stray press costs
// (DanceCore WILD_TAP_COST). So a freestyle bar that scored would move pay, and one that asked MATCH's buttons would fight them.
//
// WHAT IT IS NOW. A chart MARKS a section FREESTYLE (a free phrase with `"freestyle": true`, chart.ts) and for exactly that stretch:
//   · NO STEP is in it (the chart's validator holds this): no scored move starts inside it and a freeze's hold ends before it, so
//     MATCH is never asked — there is no step for a button to be right or wrong about;
//   · every face button picks the move: A, B, X and Y each dance a move of the family MATCH gives that button (FREESTYLE_PAD), cycling
//     through that button's moves on each press for variety; a trigger pull or SPACE is an A, as everywhere else in the room. With
//     MATCH off X and Y work too — inside the section they are not "taps", they are moves;
//   · it pays STYLE ONLY, and only the STYLE values that already exist: a press on one of the chart's own freestyle slots (the beats
//     its `free.every` lays down) banks chartPlay.GROOVE_STYLE into the run's STYLE tally, exactly as a groove tap does, and nothing
//     else does. No new value, no variety multiplier (a new STYLE number is a tuned number — assumption: the owner can add one);
//   · it never touches the judge: a freestyle press does not reach DancePerformance.hit, so it cannot cost a wild tap (−20), break the
//     combo or move the score; inside the section there is nothing to miss. A press that would belong to a step (one within the judge's
//     reach of a scored move — the edges of the section) is that step's, exactly as before.
// The score, the combo, the stars, the scored-step cap and the Arena ceiling are therefore the same with the section as without it
// (freestyleWiring.test.ts runs a whole chart both ways), and a chart with no freestyle section plays exactly as it did.

import type { FelInput } from '../core/InputBus';
import { MISS_AFTER, type DanceStep } from '../core/DanceCore';
import { FAMILY_BUTTON, GROOVE_STYLE, GROOVE_WINDOW_SEC, matchPress, pressTarget, styleTapAt } from './chartPlay';
import { danceMove } from './moves';

/** The gold the lane draws a freestyle slot and the section's own marker in (the HUD's score tone, a step cue's colours stay the families'). */
export const FREE_CUE_COLOR = '#FDE047';

/** A freestyle section: song beats, half-open [start, end). Whole bars (a phrase is a whole number of them). */
export interface FreeSpan { start: number; end: number }

/** The span a (fractional) song beat is inside, or null. Spans are sorted and do not overlap. */
export function freeSpanAt(spans: readonly FreeSpan[], beatPos: number): FreeSpan | null {
  if (!Number.isFinite(beatPos)) return null;
  let lo = 0, hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, s = spans[mid];
    if (beatPos < s.start) hi = mid - 1;
    else if (beatPos >= s.end) lo = mid + 1;
    else return s;
  }
  return null;
}

/** The next span that starts after `beatPos`, or null (the lane's look-ahead marker). */
export function nextFreeSpan(spans: readonly FreeSpan[], beatPos: number): FreeSpan | null {
  return spans.find((s) => s.start > beatPos) ?? null;
}

export type PadSlot = 'A' | 'B' | 'X' | 'Y';

/**
 * The moves each button dances in a freestyle section, in the order it cycles through them. Every move is one of the family MATCH gives
 * that button (A the standing grooves, B the floor, X the arms and turns, Y the freeze — chartPlay.FAMILY_BUTTON), so the button a
 * player learns on the chart is the button that dances that family here; freestyle.test.ts holds every row to it. The captured
 * moves (dance/moves.ts) are here as well as in the chart: freestyle is where a player picks them.
 */
export const FREESTYLE_PAD: Readonly<Record<PadSlot, readonly string[]>> = {
  A: ['dance_toprock_basic', 'dance_toprock_kick', 'dance_bounce_two_step', 'dance_bounce_shoulder'],
  B: ['dance_footwork_six', 'dance_power_helicopter', 'dance_power_headstand', 'dance_power_windmill'],
  X: ['dance_wave_arm', 'dance_pop_moonwalk', 'dance_pop_robot', 'dance_trans_spin'],
  Y: ['dance_freeze_baby', 'dance_freeze_side'],
};

/** A move's name as a button prints it. */
export const freeName = (clipId: string): string => (danceMove(clipId)?.name ?? clipId).toUpperCase();

/**
 * The deck a section's presses draw from: each button cycles through its moves, and consecutive presses alternate the mirror so a
 * repeated button still reads as dancing. Fresh at every section's start (the same first picks every time: deterministic).
 */
export class FreestyleDeck {
  private idx: Record<PadSlot, number> = { A: 0, B: 0, X: 0, Y: 0 };
  private presses = 0;
  reset(): void { this.idx = { A: 0, B: 0, X: 0, Y: 0 }; this.presses = 0; }
  /** The move the next press of `slot` will dance (what the pad prints on the button). */
  peek(slot: PadSlot): string {
    const list = FREESTYLE_PAD[slot];
    return list[this.idx[slot] % list.length];
  }
  /** Dance it: the move and whether it is mirrored; advances that button. */
  press(slot: PadSlot): { clipId: string; mirrored: boolean } {
    const clipId = this.peek(slot);
    this.idx[slot]++;
    const mirrored = this.presses++ % 2 === 1;
    return { clipId, mirrored };
  }
  /** What every button will dance next, by name (the pad's labels and the HUD's line). */
  legend(): Record<PadSlot, string> {
    return { A: freeName(this.peek('A')), B: freeName(this.peek('B')), X: freeName(this.peek('X')), Y: freeName(this.peek('Y')) };
  }
}

/** The HUD line for the legend: 'A TOP ROCK · B SIX STEP · X ARM WAVE · Y BABY FREEZE'. */
export const legendLine = (l: Readonly<Record<PadSlot, string>>): string => `A ${l.A} · B ${l.B} · X ${l.X} · Y ${l.Y}`;

// ── the routing decision ─────────────────────────────────────────────────────────────────────────────────────────────

export interface FreeRoute {
  /** The button that picks the move. */
  slot: PadSlot;
  /** The freestyle slot beat this press took (STYLE banked: GROOVE_STYLE), or null (a move danced, nothing paid). */
  slotBeat: number | null;
}

/**
 * One input inside a freestyle section, decided. `null` = this is not a freestyle press: not a face-button press or tap at all, or
 * it is a press the judge would take for a step (a scored move within MISS_AFTER of it — the section's edges), which is then the step's
 * exactly as before. Otherwise the press is a move: `slotBeat` is the freestyle slot it landed on, if any.
 *
 * Pure: the room calls it with what it already holds (the upcoming steps, the song beat, the slot beats and the ones taken) and acts
 * on the answer; nothing here can reach a score, a combo or the judge.
 */
export function routeFreestyle(o: {
  e: FelInput;
  /** danceTap's verdict for this event (a trigger pull / SPACE is a tap, and an A). */
  tap: boolean;
  /** The song's upcoming steps with their times (DancePerformance.upcoming), and the heard time of this press. */
  upcoming: readonly { time: number; step: DanceStep }[];
  heardNow: number;
  /** The song beat this press lands on (chart beats, fractional) and the beat length in seconds. */
  beatPos: number;
  beatSec: number;
  /** The chart's STYLE beats (accents, doubles, freestyle slots) and the ones already taken this run. */
  styleBeats: readonly number[];
  taken: ReadonlySet<number>;
}): FreeRoute | null {
  const slot = matchPress(o.e, o.tap);
  if (!slot) return null;
  if (pressTarget(o.upcoming, o.heardNow, MISS_AFTER)) return null;                                       // a step's press: the judge's
  const g = o.styleBeats.length ? styleTapAt(o.styleBeats, o.upcoming, o.heardNow, o.beatPos, GROOVE_WINDOW_SEC / o.beatSec, o.taken) : null;
  return { slot, slotBeat: g };
}

/** What a freestyle press pays into the run's STYLE tally: GROOVE_STYLE on a slot, nothing off one. The only STYLE number here. */
export const freeStyleFor = (r: FreeRoute): number => (r.slotBeat === null ? 0 : GROOVE_STYLE);

/** Every freestyle button is some MATCH family's: the pairing the pad and the chart share (freestyle.test.ts holds it). */
export const freeButtonOf = (clipId: string): PadSlot | null => {
  const m = danceMove(clipId);
  return m ? FAMILY_BUTTON[m.category] : null;
};
