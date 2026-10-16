// PHOTO FINISH (lane/w3-present, wave 3) — what the end image of a 100 m race says. Pure arithmetic.
//
// The sprint's end is a PHOTO FINISH: the frame the camera drew at the tape, printed with the finish line over it and a timing ruler under
// it that puts the two runners (the player and the pacer) on one clock. The mode takes the still and sends the times; the host
// (components/games/photo-finish.tsx) draws the print. This file is the ruler's maths, so it is tested without a scene or a browser.
//
// The ruler is a time axis: the FINISH LINE at a fixed place near the left, the WINNER on it, the LOSER to its right by the margin, on a
// scale that opens to fit the margin (a hundredth is visible; four seconds is on the page). It reads the RAW race clock — the moment
// each body crossed the line — not the official time, which has a dip bonus and false-start penalties folded in: a photo is a physical
// fact, and a penalty is a ruling.
//
// Nothing here touches the race, the clock, the score or the camera.

/** The pacer's crossing time, s — the signed-off RIVAL_TIME_S (SprintMode; sprintRules.pacerDistance reaches 100 m exactly then). */
export const PACER_FINISH_S = 13.4;

export type FinishWinner = 'you' | 'pacer' | 'tie';

export interface FinishMargin {
  winner: FinishWinner;
  /** Seconds between the two crossings, ≥ 0, to the hundredth (the ruler's resolution). */
  marginS: number;
  /** "YOU BY 0.56 s" / "PACER BY 0.31 s" / "DEAD HEAT". */
  call: string;
}

/** A dead heat is inside this many seconds (a hundredth: the line's own resolution on the clock). */
export const DEAD_HEAT_S = 0.005;

export function finishMargin(youS: number, pacerS: number = PACER_FINISH_S): FinishMargin {
  const d = pacerS - youS;   // + = the player crossed first
  const m = Math.round(Math.abs(d) * 100) / 100;
  if (!Number.isFinite(d) || Math.abs(d) < DEAD_HEAT_S) return { winner: 'tie', marginS: 0, call: 'DEAD HEAT' };
  const winner: FinishWinner = d > 0 ? 'you' : 'pacer';
  return { winner, marginS: m, call: `${winner === 'you' ? 'YOU' : 'PACER'} BY ${m.toFixed(2)} s` };
}

/** Where the line and the two runners sit on the ruler, 0..1 across its width. */
export interface Ruler {
  /** The finish line. */
  lineX: number;
  youX: number;
  pacerX: number;
  /** Seconds across the ruler's whole length (it opens to fit). */
  spanS: number;
  /** Seconds between two ticks. */
  stepS: number;
  /** The loser's marker would pass the ruler's end: drawn at the end with an arrow. */
  clipped: boolean;
}

/** The ruler's left margin (the line sits here) and the longest the loser's marker may run to, as fractions of its width. */
export const RULER = { lineX: 0.16, endX: 0.94, minSpanS: 0.2 } as const;
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5] as const;

/** The tick step that keeps a ruler of `spanS` seconds to about ten ticks. */
export function tickStep(spanS: number): number {
  const want = spanS / 10;
  for (const s of STEPS) if (s >= want - 1e-9) return s;
  return STEPS[STEPS.length - 1];
}

export function ruler(m: FinishMargin): Ruler {
  const room = RULER.endX - RULER.lineX;
  // open the span so the margin takes 55 % of the room (a close finish reads as close, a wide one is still on the page); never narrower than minSpanS
  const spanS = Math.max(RULER.minSpanS, Math.round((m.marginS / 0.55) * 100) / 100);
  const offset = (m.marginS / spanS) * room;
  const loserX = Math.min(RULER.endX, RULER.lineX + offset);
  const clipped = RULER.lineX + offset > RULER.endX + 1e-9;
  const winnerX = RULER.lineX;
  return {
    lineX: RULER.lineX,
    youX: m.winner === 'pacer' ? loserX : winnerX,
    pacerX: m.winner === 'pacer' ? winnerX : m.winner === 'tie' ? winnerX : loserX,
    spanS, stepS: tickStep(spanS), clipped,
  };
}

/** The time as the print shows it: 12.84 s (two places; the clock's resolution on a print). */
export function printTime(s: number): string { return Number.isFinite(s) ? `${s.toFixed(2)} s` : '—'; }

/** The finish line's place in the photo, 0..1 down the frame, from its projected pixel row; null when it is off the frame or behind the lens. */
export function lineRow01(projectedY: number, heightPx: number, depth: number): number | null {
  if (!(heightPx > 0) || !Number.isFinite(projectedY) || !(depth > 0 && depth < 1)) return null;
  const k = projectedY / heightPx;
  return k >= 0.02 && k <= 0.98 ? Math.round(k * 1000) / 1000 : null;
}

/** How long the host holds the result for the print, ms (any press skips it). */
export const PHOTO_HOLD_MS = 2600;
