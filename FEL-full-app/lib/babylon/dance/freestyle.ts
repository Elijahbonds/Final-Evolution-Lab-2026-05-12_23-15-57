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
//     else does — plus, since lane/dance-options (owner 2026-10-17), the section's VARIETY when it ends (varietyBonus, below: +50 a
//     different button past the first, at most +150; one button earns none);
//   · it never touches the judge: a freestyle press does not reach DancePerformance.hit, so it cannot cost a wild tap (−20), break the
//     combo or move the score; inside the section there is nothing to miss. A press that would belong to a step (one within the judge's
//     reach of a scored move — the edges of the section) is that step's, exactly as before.
// The score, the combo, the stars, the scored-step cap and the Arena ceiling are therefore the same with the section as without it
// (freestyleWiring.test.ts runs a whole chart both ways), and a chart with no freestyle section plays exactly as it did.
// lane/dance-options (owner 2026-10-17, Q6) closes the section's EDGE: inside a section MATCH never fumbles the next step (routeFreestyle
// matchOn), and a would-be wild tap just after a section the player was still dancing is its follow-through (exitGraceForgives, below).

import type { FelInput } from '../core/InputBus';
import { MISS_AFTER, type DanceStep } from '../core/DanceCore';
import { FAMILY_BUTTON, GROOVE_STYLE, GROOVE_WINDOW_SEC, buttonForStep, matchPress, pressTarget, styleTapAt } from './chartPlay';
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
  /** MATCH is on (lane/dance-options, Q6): a press in the section that the judge would take for a step with the WRONG button is still the
   *  section's — a move danced, never a fumble — because MATCH is never asked inside a section. Absent / false: exactly as before. */
  matchOn?: boolean;
}): FreeRoute | null {
  const slot = matchPress(o.e, o.tap);
  if (!slot) return null;
  const target = pressTarget(o.upcoming, o.heardNow, MISS_AFTER);
  // lane/dance-options (owner 2026-10-17, Q6): in a section's last moment the next step is already within the judge's reach. A press with
  // that step's button is the step's (an early hit, exactly as before); with MATCH on, a press with ANOTHER button used to reach the room's
  // MATCH check and fumble the step — a MISS and the combo gone, for a press made where MATCH is never asked. It dances its move instead,
  // pays nothing, and leaves the step to the player's next press (a step nobody presses still expires a MISS).
  if (target && o.matchOn && buttonForStep(target.step) !== slot) return { slot, slotBeat: null };
  if (target) return null;                                                                                 // a step's press: the judge's
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

// ── the VARIETY bonus (owner 2026-10-17, lane/dance-options, Q2 A) ──────────────────────────────────────────────────────────
//
// A section pays a little more STYLE for dancing it with more of the pad: +VARIETY_STYLE for every DIFFERENT button that took one of the
// section's slots, past the first, at most VARIETY_CAP (all four buttons). Counted once, when the section ends. One button — however often
// it is pressed, mashed or not — earns nothing: the deck already cycles a button's moves, so "a new move" would pay the deck, not the
// player (docs/DANCE-EXTRAS-OPTIONS.md (b), measured). Only a press that TOOK a slot counts (FreeRoute.slotBeat): a press off the beat
// dances its move and adds no button. STYLE only, like everything else here: never the score, the combo, the pay or a compared number.

/** TUNED (new, owner 2026-10-17): STYLE for each different button that took a slot in a section, past the first. */
export const VARIETY_STYLE = 50;
/** TUNED (new, owner 2026-10-17): the most a section's variety pays (= all four buttons: 3 × VARIETY_STYLE). */
export const VARIETY_CAP = 150;

/** The variety STYLE a section pays for the buttons that took its slots (any order, repeats allowed). Pure. */
export function varietyBonus(slotButtons: Iterable<PadSlot>): number {
  const n = new Set(slotButtons).size;
  return Math.min(VARIETY_CAP, VARIETY_STYLE * Math.max(0, n - 1));
}

// ── the EXIT GRACE (owner 2026-10-17, lane/dance-options, Q6) ──────────────────────────────────────────────────────────────
//
// WHAT WAS WRONG (measured on the shipped charts, docs/DANCE-EXTRAS-OPTIONS.md (c)): on four of the six songs the next scored step lands
// ON a section's last beat line. A press in the section's last MISS_AFTER is that step's (routeFreestyle hands it to the judge, as it
// should), so a player still dancing the section up to its last instant catches the step EARLY — and then their press ON the beat finds
// no step and is a WILD TAP: −WILD_TAP_COST, the combo gone, the spam lock on the next hit. The same when a last-moment press takes the
// first STYLE tap after the section. Measured cost: 460–1,000 points a run.
//
// THE FIX, as small as it needs to be: a press that the judge would call a WILD tap (no step within its reach — pressTarget null), made
// within EXIT_GRACE_SEC after a section ends, by a player who pressed inside that section within MISS_AFTER of its end, is the section's
// follow-through: it is absorbed (no move, no STYLE, no cost). It only ever removes a wild tap's penalty: a press that would catch a step
// still catches it, a step that nobody hit still expires a MISS and still breaks the combo (DancePerformance.update, untouched), and a
// flawless run has no wild taps to forgive, so no flawless score moves.

/** TUNED (new, owner 2026-10-17): how long after a freestyle section ends a would-be wild tap is the section's follow-through (s). */
export const EXIT_GRACE_SEC = 0.1;

/**
 * Is a press at `beatPos` (song beats) — one the judge would call a wild tap — the forgiven follow-through of a section the player was
 * still dancing at its end? `lastSectionPressBeat` = the song beat of the last press made inside a section (null: none this run). Pure.
 */
export function exitGraceForgives(o: { spans: readonly FreeSpan[]; beatPos: number; beatSec: number; lastSectionPressBeat: number | null; graceSec?: number }): boolean {
  const { spans, beatPos, beatSec, lastSectionPressBeat: last } = o;
  const grace = o.graceSec ?? EXIT_GRACE_SEC;
  if (last === null || !Number.isFinite(beatPos) || !(beatSec > 0)) return false;
  for (const f of spans) {
    const after = (beatPos - f.end) * beatSec;
    if (after < 0 || after > grace) continue;
    if (last >= f.start && last < f.end && (f.end - last) * beatSec <= MISS_AFTER) return true;
  }
  return false;
}
