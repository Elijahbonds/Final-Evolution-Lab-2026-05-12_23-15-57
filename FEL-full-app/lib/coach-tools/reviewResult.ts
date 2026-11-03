// reviewResult — a filmed set and a Mirror review as the P3 result card's "no number" variant (COACH-TOOLS-EASY,
// 2026-11-02; the coordinator's item 4, plat-p03's lib/results/view.ts: `value: null` draws no number row). A set review
// is a read of the reps, not one measurement, so its card is the read in one line (the tool's own words, unchanged) and
// one next step; the reps, the flags and the replay stay under Details.
//
// Pure.
import type { ResultView } from '@/lib/results/view';

export const REVIEW_RESULT_COPY = { send: 'Send it to my coach', again: 'Film it again', next: 'Next set' } as const;

const repsWord = (n: number) => (n === 1 ? '1 rep' : `${n} reps`);

/** The form-review set: "Goblet squat · 6 reps", the headline, and Send (or Film it again when it cannot be sent). */
export function formReviewView(exercise: string, reps: number, headline: string, canSend: boolean): ResultView {
  return {
    measure: `${exercise} · ${repsWord(reps)}`, value: null, unit: '', estimate: true, pm: null,
    vsLast: null, better: 'up', vsLine: null, line: headline,
    next: { label: canSend ? REVIEW_RESULT_COPY.send : REVIEW_RESULT_COPY.again, href: null },
  };
}

/** A Mirror review (a live set read by the coach): the movement and its reps, the review's own headline, "Next set". */
export function mirrorReviewView(movement: string, reps: number, headline: string): ResultView {
  return {
    measure: `${movement} · ${repsWord(reps)}`, value: null, unit: '', estimate: true, pm: null,
    vsLast: null, better: 'up', vsLine: null, line: headline,
    next: { label: REVIEW_RESULT_COPY.next, href: null },
  };
}
