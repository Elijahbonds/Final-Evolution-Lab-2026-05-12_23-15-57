// lib/coach/readiness/next.ts — CUE-REWRITE (2026-10-27): the readiness result's "what to do next", for every band.
//
// The readiness check said what it read (copy.ts reasonLine) and, on a low or a ready day, what to do (soloLine /
// coachedNextLine); on a normal day, or while it was still building your normal, it said nothing about what to do. The
// style guide (docs/CUE-STYLE.md) gives every result one next step. A separate file because copy.ts is being edited by
// the coach-delivery lane (its new readiness sources): this only fills the gap, it changes none of copy.ts's lines.
//
// Pure, client-safe. Held to MEDICAL_WORDS by lib/cue-style/corpus.test.ts.
import type { ReadinessBand } from './types';

export const DEFAULT_NEXT: Readonly<Record<ReadinessBand, string>> = {
  ready: 'Train as planned today.',
  normal: 'Train as planned today.',
  low: 'Take it a notch easier today.',
  building: 'Do the check again on another day to build your normal.',
};

/** The line shown under the reading: the band's own next line, or the default for its band. */
export const nextLineFor = (band: ReadinessBand, next: string | null): string => next ?? DEFAULT_NEXT[band];
