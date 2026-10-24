// UX advice §4: a two-sided check shows left and right as a two-column row, each side with its own chip — not inline
// coloured text. No "gap" chip (5° is inside the detectable difference).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize } from './checks';

const cal = syntheticCalibration();
const FLAGGED = summarize(gradeSession({
  calibration: cal, T1: { front: ohsFront({ kneeInL: 0.06 }).frames, side: ohsSide().frames },
  T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: 38.5 }).frames },
  T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
  T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
}))!;
const html = renderToStaticMarkup(createElement(ResultsView, { summary: FLAGGED, age: '18+', onClear: () => {}, onRunAgain: () => {} }));

describe('left/right compare row (UX §4)', () => {
  it('renders as a two-column row with a labelled cell and its own chip per side', () => {
    expect(html).toContain('data-side-row');
    expect(html).toMatch(/data-side-row[^>]*grid-cols-2/);
    expect(html).toMatch(/data-side="left"[^>]*>\s*<p[^>]*>Left<\/p>/);
    expect(html).toMatch(/data-side="right"[^>]*>\s*<p[^>]*>Right<\/p>/);
  });
  it('no inline "Left: … · Right: …" text and no gap chip', () => {
    expect(html).not.toMatch(/Left:\s/);
    expect(html).not.toContain(' · Right');
    expect(html.toLowerCase()).not.toMatch(/data-gap|>gap</);
  });
});
