// MIRROR step 3 (plan #4, review: "build week-1 cards inside Dunking & Plyometrics base weeks"; approved decision 3,
// SCREEN-AND-COACHING-UPGRADES §5: Phase 1–2 results point to Dunking & Plyometrics, which starts with the base weeks).
//
// Week 1 of the Dunk Program's Track 3 base weeks, as seven day cards. Every line is the program's own text
// (programs/DUNK-PROGRAM.md §9.3 "Weeks 1–2 · Base", §6.4 weekly layout and Movement Snack, §6.3 rung 0–1 and the
// end-the-set rule, §6.1 check-in and Neural Flush): no new number, no new drill. Coach targets, not norms.
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

const CHECK_IN = { name: 'Check-in', what: 'Anything hurt today? Hours slept.' };
const FLUSH = { name: 'Reset (Neural Flush)', what: 'Three slow breaths, 4 s in through the nose, 8 s out.' };
const DUC = { name: 'Down, Up, Check', what: 'Your top flag\'s row. Landing flags use the knees cave in row.' };
const STABILITY = 'Tempo goblet squat 3 × 8; split squat 2 × 8 each; side plank 2 × 20 s; dead bug 2 × 8; suitcase carry 3 × 20 m. Overcoming isometric, moderate effort, 3 × 3 s. Sprint build-ups 3–4 × 20 m easy to medium.';
const SNACK = { name: 'Movement Snack (5 min)', what: '3 rounds of 3 slow breaths, 20 s of tiny ankle bounces while breathing, then a 3-breath Neural Flush.' };

export const WEEK1_DUNK_DAYS: readonly Week1Day[] = [
  { day: 'Mon', title: 'Session A', kind: 'session', blocks: [
    CHECK_IN, DUC,
    { name: 'Breath and stack', what: 'The breathing ladder, then the band split-stance row and press, 8–10 min.' },
    { name: 'Spring', what: 'Rung 0 (Land): snap-down to stick, 4 × 5, rest 60 s.' },
    { name: 'Strong', what: STABILITY },
    FLUSH,
  ] },
  { day: 'Tue', title: 'Movement Snack', kind: 'snack', blocks: [SNACK] },
  { day: 'Wed', title: 'Session B', kind: 'session', blocks: [
    CHECK_IN, DUC,
    { name: 'Breath and stack', what: 'T-spine flow.' },
    { name: 'Spring', what: 'Rung 0–1: 3 × 5 snap-downs to stick, plus 2 × 15 two-foot pogos, rest 60 s.' },
    { name: 'Strong', what: 'Carries and side plank.' },
    FLUSH,
  ] },
  { day: 'Thu', title: 'Off, or a walk', kind: 'rest', blocks: [] },
  { day: 'Fri', title: 'Session C', kind: 'session', blocks: [
    CHECK_IN,
    { name: 'Down, Up, Check', what: 'Re-test first: squat, rib turn, jump. Then your row.' },
    { name: 'Breath and stack', what: 'The breathing ladder, 8–10 min.' },
    { name: 'Spring', what: 'Rung 1 (Bounce): two-foot pogos in place, 4 × 15, rest 60 s.' },
    { name: 'Strong', what: 'Same as session A.' },
    FLUSH,
  ] },
  { day: 'Sat', title: 'Movement Snack', kind: 'snack', blocks: [SNACK] },
  { day: 'Sun', title: 'Off', kind: 'rest', blocks: [] },
];

/** §6.3: when a set ends. */
export const WEEK1_END_SET = 'End the set the moment the pop turns into a thud, the heels sink, the rhythm stutters, or anything hurts. Pop, not thud.';
/** §9.3: when the base weeks end (coach targets). */
export const WEEK1_EXIT = 'Base weeks run two weeks. Move on when the band row and press and the rung 1 bounce stay clean two sessions in a row.';
export const WEEK1_TITLE = 'Week 1: Base';
