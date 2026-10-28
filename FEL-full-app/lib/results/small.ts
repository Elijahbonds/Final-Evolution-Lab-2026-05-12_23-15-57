// lib/results/small — the two results that are not camera measurements (PLAT-P03, 2026-10-28): the Playbook's chapter
// check score and the session player's finish (phase 1).
//
// BANDS: a quiz score has no measurement noise (the server grades it exactly), so "the same" is the same score.
// assumption: band 0 for the chapter check (flagged). The session finish has no "last time" in the player: no arrow.
//
// Pure.
import { compareLast, vsLineOf, type ResultNextStep, type ResultView } from './view';
import { RESULT_COPY } from './copy';

/** A chapter check's score against the best this device kept for the chapter (lib/education/checkDevice.ts), if any. */
export function chapterView(o: { score: number; bestBefore: number | null; line: string; next: ResultNextStep }): ResultView {
  const c = compareLast(o.score, o.bestBefore, 0);
  return {
    measure: 'Chapter check', value: String(Math.round(o.score)), unit: '%', estimate: false, pm: null,
    vsLast: c.vsLast, better: 'up',
    vsLine: vsLineOf(c, { against: RESULT_COPY.yourBest, up: 'higher', down: 'lower', fmt: (x) => `${Math.round(x)} points` }),
    line: o.line, next: o.next,
  };
}

/** The session player's finish: the sets done, no comparison. */
export function sessionFinishView(o: { setsDone: number; line: string; next: ResultNextStep }): ResultView {
  return {
    measure: 'Session done', value: String(o.setsDone), unit: o.setsDone === 1 ? 'set' : 'sets', estimate: false, pm: null,
    vsLast: null, better: 'up', vsLine: null, line: o.line, next: o.next,
  };
}
