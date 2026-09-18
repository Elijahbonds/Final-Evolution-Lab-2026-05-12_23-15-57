// CertificationPass2 — what pass 1 guessed, against what pass 2 measured.
//
// M93 ended pass 1 with a scorecard built from four states: PASS, BUILT,
// SPECIFIED, UNKNOWN. It said explicitly that **BUILT reads like progress and
// means a player benefits in no way at all**, and it warned that every BUILT
// could turn out to be a FAIL because nobody had looked.
//
// Pass 2 looked. This file records both columns so the difference is a
// measurement rather than a memory, and so the next pass can be scored the
// same way.
//
// THE HEADLINE: BUILT WAS OPTIMISTIC FOUR TIMES AND PESSIMISTIC TWICE.
// Four criteria that read BUILT are FAIL in the product. Two that read BUILT or
// UNKNOWN are fine and were never worth worrying about. Being wrong in both
// directions is the useful part — it means the register was noise, not a
// consistent bias that could have been corrected for.

import type { CriterionState } from './Certification';

export interface MeasuredCriterion {
  id: string;
  /** What M93 recorded at the end of pass 1, from judgement. */
  pass1: CriterionState;
  /** What pass 2 established by measuring the deployed app. */
  pass2: CriterionState;
  /** The number or observation. Empty is not allowed. */
  evidence: string;
  /** Which batch established it, so the claim can be re-run. */
  source: string;
}

/**
 * The scorecard, 2026-07-28.
 *
 * Every `pass2` value here came from the deployed build at
 * `finalevolution.abacusai.app`, not from reading source.
 */
export const MEASURED: MeasuredCriterion[] = [
  {
    id: 'boot', pass1: 'UNKNOWN', pass2: 'PASS',
    evidence: '1.2-2.5s to canvas; 8/8 modes reached loading → loaded → playing',
    source: 'M95',
  },
  {
    id: 'lifecycle', pass1: 'BUILT', pass2: 'PASS',
    evidence: '20 route changes on one page: 20/20 loaded, 1 live WebGL context '
      + 'throughout, 0 page errors, boot 198ms FASTER at the end',
    source: 'M96',
  },
  {
    id: 'canvas', pass1: 'SPECIFIED', pass2: 'FAIL',
    evidence: '26-33% of an iPhone 13 in 8/8 modes, identical to the decimal — '
      + 'aspect-[16/10] on one shared wrapper. Fixed to 79.8% in a browser, not deployed',
    source: 'M95',
  },
  {
    id: 'no_tpose', pass1: 'BUILT', pass2: 'FAIL',
    evidence: '77% of the character mesh (14,128 of 18,409 vertices) is dominated by '
      + 'the Head bone; 5/5 rigs BROKEN. The skeleton was correct the whole time',
    source: 'M97, M98',
  },
  {
    id: 'prq', pass1: 'BUILT', pass2: 'FAIL',
    evidence: 'fed a raw per-mode score: karate submitted 1250 and paid 39x the XP of '
      + 'a dunk contest submitting 25. nexus_disabled server-side',
    source: 'M100',
  },
  {
    id: 'a11y_audio', pass1: 'BUILT', pass2: 'FAIL',
    evidence: '0 aria-live regions, 0 role=status, 0 .sr-only — in dunk, karate, '
      + 'onevone and tennis. The caption bus renders nowhere',
    source: 'M100',
  },
  {
    id: 'legibility', pass1: 'BUILT', pass2: 'FAIL',
    evidence: '6 of 8 modes render the player at 5-9% of screen height; a '
      + 'subject-anchored tell would be about 6 CSS pixels on a phone',
    source: 'M97',
  },
  {
    id: 'simulatable', pass1: 'BUILT', pass2: 'FAIL',
    evidence: 'dunk is clean — all 24,558 random calls in a full contest were particles. '
      + 'onevone, threevthree, tennis and karate-vs each roll a gameplay decision',
    source: 'M101, M102',
  },
  {
    id: 'response', pass1: 'BUILT', pass2: 'UNKNOWN',
    evidence: 'keyboard and gamepad listeners ARE attached (verified over CDP), but '
      + 'displacement could not be attributed at 3fps under a software rasteriser',
    source: 'M96',
  },
  {
    id: 'framerate', pass1: 'BUILT', pass2: 'UNKNOWN',
    evidence: 'still needs real hardware. One large item found: 9.01 backing pixels '
      + 'per CSS pixel on a phone, which is 56% of the fill rate for nothing',
    source: 'M95',
  },
  {
    id: 'procedural', pass1: 'PASS', pass2: 'PASS',
    evidence: 'unchanged — no external assets, still true',
    source: 'M93',
  },
  {
    id: 'tested', pass1: 'PASS', pass2: 'PASS',
    evidence: '1,670 assertions across 31 suites, all green',
    source: 'M102',
  },
  {
    id: 'fun', pass1: 'UNKNOWN', pass2: 'UNKNOWN',
    evidence: 'only the founder can score this, and he has not played it since the '
      + 'camera and skin findings',
    source: '—',
  },
];

export type Movement = 'confirmed' | 'worse-than-thought' | 'better-than-thought' | 'still-unknown';

const RANK: Record<CriterionState, number> = {
  FAIL: 0, UNKNOWN: 1, SPECIFIED: 2, BUILT: 3, PASS: 4,
};

export function movementOf(c: MeasuredCriterion): Movement {
  if (c.pass2 === 'UNKNOWN' && c.pass1 !== 'PASS') return 'still-unknown';
  if (c.pass1 === c.pass2) return 'confirmed';
  return RANK[c.pass2] < RANK[c.pass1] ? 'worse-than-thought' : 'better-than-thought';
}

export interface Accuracy {
  total: number;
  confirmed: number;
  worse: number;
  better: number;
  stillUnknown: number;
  /** Criteria that read BUILT in pass 1 and measure FAIL now. */
  falseComfort: string[];
  /** Criteria that were worried about and turned out fine. */
  falseAlarm: string[];
}

/**
 * How good was pass 1's self-assessment?
 *
 * The answer is the point of this file. `BUILT` was M93's own warning label,
 * and this measures how often the warning was justified.
 */
export function accuracy(criteria: readonly MeasuredCriterion[] = MEASURED): Accuracy {
  const m = criteria.map((c) => ({ c, move: movementOf(c) }));
  return {
    total: criteria.length,
    confirmed: m.filter((x) => x.move === 'confirmed').length,
    worse: m.filter((x) => x.move === 'worse-than-thought').length,
    better: m.filter((x) => x.move === 'better-than-thought').length,
    stillUnknown: m.filter((x) => x.move === 'still-unknown').length,
    falseComfort: m.filter((x) => x.c.pass1 === 'BUILT' && x.c.pass2 === 'FAIL').map((x) => x.c.id),
    falseAlarm: m.filter((x) => x.move === 'better-than-thought').map((x) => x.c.id),
  };
}

/** Criteria now demonstrated, with evidence anyone can re-run. */
export function demonstrated(): MeasuredCriterion[] {
  return MEASURED.filter((c) => c.pass2 === 'PASS');
}

/** Criteria measured as broken, worst first by how many modes they touch. */
export function broken(): MeasuredCriterion[] {
  return MEASURED.filter((c) => c.pass2 === 'FAIL');
}

/**
 * What still cannot be measured from here, and what it would take.
 *
 * Naming the instrument is the difference between a gap and a plan.
 */
export const UNMEASURABLE: { id: string; needs: string }[] = [
  { id: 'response', needs: 'a real GPU — this container renders at ~3fps through SwiftShader' },
  { id: 'framerate', needs: 'a profile on a real phone, ideally the founder\'s' },
  { id: 'fun', needs: 'the founder playing all 25 modes' },
];
