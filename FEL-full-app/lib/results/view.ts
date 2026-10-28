// lib/results/view — the one shape every measured result takes on screen (PLAT-P03, 2026-10-28).
//
// The owner, at the 2026-10-27 playtest: "People need to be able to understand and interpret the results and understand
// what they are doing." So every tool's result reads the same way, top to bottom (components/result-card):
//
//   1. ONE big number, its unit, and "estimate" where the tool says so (every camera number, OWN-12: no accuracy claim
//      until the force-plate pilot);
//   2. an arrow against last time, which says "about the same" whenever the change is inside THAT TOOL'S OWN noise band;
//   3. one line on what it means (cue-rewrite's words, lib/cue-style/result.ts, moved, never reworded);
//   4. one next-step button.
//
// THE BAND RULE. `compareLast` only ever reads a band handed to it by an adapter, and each adapter reads its tool's own
// constant or its tool's own "is this real?" test, read-only (lib/results/*.ts say which). A tool with no band gets no
// arrow (`band: null` → vsLast null), never an invented one.
//
// Pure.
import { RESULT_COPY } from './copy';

export type VsLast = 'up' | 'down' | 'same' | null;

export interface ResultNextStep {
  label: string;
  /** A same-origin path. An in-page action (run again, next set) is the card's `onNext`, and `href` is null. */
  href: string | null;
}

export interface ResultView {
  /** What was measured, as a short name: "Vertical jump", "40 yd sprint", "Back squat · 100 kg". */
  measure: string;
  /** The headline number, formatted, or null when nothing was measured. */
  value: string | null;
  unit: string;
  /** A camera estimate (or a tool that calls its number an estimate): the card tags it. */
  estimate: boolean;
  /** The ± the tool shows, formatted without the sign ("0.06"), or null. */
  pm: string | null;
  /** The number against the last comparable one: up / down / inside the tool's own noise band / no comparison. */
  vsLast: VsLast;
  /** Which way is better for this number: a time is better 'down'. */
  better: 'up' | 'down';
  /** The arrow's words: "About the same as last time", "0.19 s faster than last time". Null with no arrow. */
  vsLine: string | null;
  /** What it means: the tool's own line. */
  line: string;
  next: ResultNextStep;
}

export interface Comparison {
  vsLast: VsLast;
  /** now − last, in the value's unit; null without a last. */
  delta: number | null;
}

/**
 * Now against the last comparable value. "same" when |now − last| ≤ band (the tool's own band, in the value's unit; the
 * jump's realChange and profile v2's compareWeeks read "same" the same way, ≤). No last, or no band: no arrow.
 */
export function compareLast(now: number | null, last: number | null | undefined, band: number | null): Comparison {
  if (now === null || last == null || !Number.isFinite(now) || !Number.isFinite(last)) return { vsLast: null, delta: null };
  const delta = now - last;
  if (band === null || !Number.isFinite(band)) return { vsLast: null, delta };
  return { vsLast: Math.abs(delta) <= Math.max(0, band) ? 'same' : delta > 0 ? 'up' : 'down', delta };
}

/** The words for a comparison: what it is compared with, the change and its unit, and what up and down are called. */
export interface VsWords {
  /** "last time", "your normal", "your last combine", "your best" */
  against: string;
  /** "higher" / "faster" … for the number going up, and for it going down. */
  up: string;
  down: string;
  /** How the change is printed ("1.6 in", "0.19 s"). */
  fmt: (abs: number) => string;
}

/** "About the same as last time" · "1.6 in higher than last time" · null with no arrow. */
export function vsLineOf(c: Comparison, w: VsWords): string | null {
  if (c.vsLast === null || c.delta === null) return null;
  if (c.vsLast === 'same') return RESULT_COPY.same(w.against);
  return RESULT_COPY.changed(w.fmt(Math.abs(c.delta)), c.vsLast === 'up' ? w.up : w.down, w.against);
}

/** Is the change good news? (For the chip's tone: never colour alone, the words say it too.) */
export function isBetter(v: Pick<ResultView, 'vsLast' | 'better'>): boolean | null {
  if (v.vsLast === null || v.vsLast === 'same') return null;
  return v.vsLast === v.better;
}

/** A number to a fixed number of places, trailing ".0" kept (a jump is "24.5", a time "5.12"). */
export const fixed = (x: number, places: number): string => x.toFixed(places);
