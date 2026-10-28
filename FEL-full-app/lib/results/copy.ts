// lib/results/copy — the few NEW words the result card and My progress say (PLAT-P03, 2026-10-28). DRAFT COPY for the
// owner: every other line on a result is the tool's own (cue-rewrite's lib/cue-style/result.ts lines, the tools' copy
// files), displayed unchanged. Plain words, a 13-year-old can read each one (docs/CUE-STYLE.md §3); no line over 24 words.
//
// Pure.

export const RESULT_COPY = {
  /** The arrow inside the tool's own noise band. */
  same: (against: string) => `About the same as ${against}`,
  /** "1.6 in higher than last time". */
  changed: (amount: string, word: string, against: string) => `${amount} ${word} than ${against}`,
  estimate: 'estimate',
  details: 'Details',
  seeAll: 'See all',
  done: 'Done',
  runAgain: 'Run it again',
  nextSet: 'Next set',
  tryAgain: 'Try again',
  lastTime: 'last time',
  yourNormal: 'your normal',
  lastCombine: 'your last combine',
  yourBest: 'your best',
} as const;

/** My progress (/train/progress). */
export const PROGRESS_COPY = {
  eyebrow: 'Train',
  title: 'My progress',
  lede: 'Your numbers over time.',
  saved: 'Saved to your account',
  device: 'Kept on this phone',
  combine: 'From your combines',
  empty: 'No numbers yet. Do a jump check and your first one shows here.',
  emptyCta: 'Do a jump check',
  history: 'History',
  latest: 'Latest',
  close: 'Close',
  /** OWN-01: the combine tables are not applied yet. */
  combineSoon: 'Combine results are coming soon.',
  /** The page writes nothing: said once, at the foot. */
  privacy: 'This page only reads. Numbers on this phone stay on this phone.',
} as const;
