// MIRROR step 3 (plan #4, review: "build week-1 cards inside Dunking & Plyometrics base weeks"; approved decision 3,
// SCREEN-AND-COACHING-UPGRADES §5: Phase 1–2 results point to Dunking & Plyometrics, which starts with the base weeks).
//
// Week 1 of the Dunk Program's Track 3 base weeks, as seven day cards. Every line is the program's own text, WORD FOR
// WORD (programs/DUNK-PROGRAM.md, the source; week1-dunk-source.test.ts pins each string as a whole table cell or a
// whole sentence of it): §9.3 "Weeks 1–2 · Base" (the A / B / C cells), the weekly layout and the Movement Snack, §6.1
// (check-in, the Neural Flush, the breath-and-stack block), the end-the-set rule and the base exit. No new number, no
// new drill, no paraphrase. Coach targets, not norms.
//
// Shown on the dunking lane page to adults (18+) only; on-device, read from nothing, saves nothing. Pure data.

export type Week1Kind = 'session' | 'snack' | 'rest';

export interface Week1Day {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  title: string;
  kind: Week1Kind;
  /** The blocks, in session order (§6.1). */
  blocks: { name: string; what: string }[];
}

const CHECK_IN = { name: 'Check-in', what: '"Anything hurt today?" Hours slept.' };
const FLUSH = { name: 'Reset (Neural Flush)', what: 'Three slow breaths, 4 s in through the nose, 8 s out' };
const DUC = { name: 'Down, Up, Check', what: "Your top flag's row (§7.1 or §8.1); landing flags use the Knees cave in row" };
const BREATH = { name: 'Breath and stack', what: 'The breathing ladder, then the RNT split-stance row and press' };
const STABILITY = 'Stability block: tempo goblet squat 3 × 8; split squat 2 × 8 each; side plank 2 × 20 s; dead bug 2 × 8; suitcase carry 3 × 20 m. Overcoming isometric, moderate effort, 3 × 3 s. Sprint build-ups 3–4 × 20 m easy to medium.';
const SNACK = { name: 'Movement Snack', what: '3 rounds of 3 slow breaths, 20 s of tiny ankle bounces while breathing, then a 3-breath Neural Flush.' };

export const WEEK1_DUNK_DAYS: readonly Week1Day[] = [
  { day: 'Mon', title: 'Session A', kind: 'session', blocks: [
    CHECK_IN, DUC, BREATH,
    { name: 'Breath and stack', what: '8–10 min' },
    { name: 'Spring', what: 'Rung 0: 4 × 5, rest 60 s' },
    { name: 'Strong', what: STABILITY },
    FLUSH,
  ] },
  { day: 'Tue', title: 'Movement Snack (5 min)', kind: 'snack', blocks: [SNACK] },
  { day: 'Wed', title: 'Session B', kind: 'session', blocks: [
    CHECK_IN, DUC,
    { name: 'Breath and stack', what: 'T-spine flow' },
    { name: 'Spring', what: 'Rung 0–1: 3 × 5 + 2 × 15' },
    { name: 'Strong', what: 'Carries and side plank' },
    FLUSH,
  ] },
  { day: 'Thu', title: 'Off or a walk', kind: 'rest', blocks: [] },
  { day: 'Fri', title: 'Session C (re-test first)', kind: 'session', blocks: [
    CHECK_IN,
    { name: 'Down, Up, Check', what: 'Re-test first: squat, rib turn, jump' },
    { name: 'Breath and stack', what: '8–10 min' },
    { name: 'Spring', what: 'Rung 1: 4 × 15' },
    { name: 'Strong', what: 'Same as A' },
    FLUSH,
  ] },
  { day: 'Sat', title: 'Movement Snack', kind: 'snack', blocks: [SNACK] },
  { day: 'Sun', title: 'Off', kind: 'rest', blocks: [] },
];

/** The end-the-set rule. */
export const WEEK1_END_SET = 'End the set the moment: the pop turns into a thud, the knees bend more than a little, the heels sink or the foot tripod collapses (big toe, little toe and heel stop sharing the load), the rhythm stutters, or anything hurts.';
/** §9.3: when the base weeks end. */
export const WEEK1_EXIT = 'Leave the base when you pass the RNT exit test and the rung 1 gate, two sessions in a row each.';
export const WEEK1_TITLE = 'Weeks 1–2 · Base';
