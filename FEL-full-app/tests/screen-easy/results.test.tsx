// SCREEN-EASY (2026-10-28): the Quick Screen's result on ONE screen — the big read, at most the top priorities (each
// what we saw / what it means / what to do next, docs/CUE-STYLE.md §4), the one next step; everything else behind
// "More detail". The same cards and words as before (lib/screen/results-view.test.tsx holds those); this pins the shape.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultsView, overallRead } from '@/app/play/mirror/assess/_components/results-view';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize, type ScreenSummary } from '@/lib/screen/checks';
import { BAND_WORDS, TOP_PRIORITIES } from '@/lib/screen/PROPOSED-thresholds';
import { DISCLAIMER, NOTHING_TO_RANK, STOP_LINE, WIN_LINE } from '@/lib/screen/copy';
import { MORE_DETAIL, OVERALL_WORK_LINE } from '@/lib/screen-easy/copy';

const cal = syntheticCalibration();
const session = (o: { kneeInL?: number; tibiaR?: number; dimT5?: boolean } = {}): ScreenSummary => {
  const r = gradeSession({
    calibration: cal, T1: { front: ohsFront({ kneeInL: o.kneeInL ?? 0 }).frames, side: ohsSide().frames },
    T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: o.tibiaR ?? 44 }).frames },
    T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
    T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
  });
  if (o.dimT5) r.tests[3] = { ...r.tests[3], status: 'notScored', sides: {}, score100: null, score03: null };
  return summarize(r)!;
};
const CLEAN = session();
const FLAGGED = session({ kneeInL: 0.06, tibiaR: 38.5 });
const UNREAD = session({ dimT5: true });
const html = (s: ScreenSummary) => renderToStaticMarkup(createElement(ResultsView, { summary: s, age: '18+', onClear: () => {}, onRunAgain: () => {} }));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
/** What shows before "More detail" is opened. */
const main = (h: string) => h.replace(/<details[\s\S]*<\/details>/, '');

describe('the big read: one word for the whole screen, from the cards\' bands', () => {
  it('clean: "Good to go" with the win line; flagged: "Two things to work on"; unread: "Not fully read"', () => {
    expect(overallRead(CLEAN)).toMatchObject({ kind: 'clean', word: BAND_WORDS.green, line: WIN_LINE });
    expect(overallRead(FLAGGED)).toMatchObject({ kind: 'work', word: 'Two things to work on', line: OVERALL_WORK_LINE, colour: 'red' });
    expect(overallRead(UNREAD).kind === 'unread' || overallRead(UNREAD).kind === 'work').toBe(true);
    const none = { ...UNREAD, priorities: [], clean: false };
    expect(overallRead(none)).toMatchObject({ kind: 'unread', word: 'Not fully read', line: NOTHING_TO_RANK });
  });

  it('it is the first thing after the disclaimer and the stop line', () => {
    const t = text(html(FLAGGED));
    expect(t.trim().startsWith(DISCLAIMER)).toBe(true);
    expect(t.indexOf(STOP_LINE)).toBeLessThan(t.indexOf('Two things to work on'));
  });
});

describe('one screen: priorities and the next step up front, the rest behind "More detail"', () => {
  it('flagged: only the top priorities show (≤ TOP_PRIORITIES, never more than 3), each saw / means / next', () => {
    const m = main(html(FLAGGED));
    const top = [...m.matchAll(/data-check-card="([^"]+)"/g)].map((x) => x[1]);
    expect(top).toEqual(['T1', 'T2']);
    expect(top.length).toBeLessThanOrEqual(Math.min(3, TOP_PRIORITIES));
    for (const id of top) {
      const card = m.slice(m.indexOf(`data-check-card="${id}"`)).split('</li>')[0];
      expect(card).toContain('data-check-row');                 // what we saw
      expect(card).toContain('data-means');                     // what it means
      expect(card).toContain('data-cue');                       // what to do next
    }
  });

  it('the other checks, the jump, the screenshot line and the privacy page are behind "More detail"', () => {
    const h = html(FLAGGED);
    const d = h.slice(h.indexOf('<details'), h.indexOf('</details>'));
    expect(d).toContain(MORE_DETAIL);
    expect([...d.matchAll(/data-check-card="([^"]+)"/g)].map((x) => x[1])).toEqual(['T3', 'T5']);
    for (const a of ['data-personal-best', 'data-screenshot-line', 'data-privacy-link']) expect(d).toContain(a);
    expect(main(h)).not.toMatch(/data-personal-best|data-screenshot-line/);
  });

  it('a clean screen shows no card up front: the read, the next step and Done', () => {
    const m = main(html(CLEAN));
    expect(m).not.toContain('data-check-card');
    expect(m).toContain('data-win-card');
    expect(m.match(/data-primary/g)).toHaveLength(1);
    expect(m).toContain('data-done-clear');
  });

  it('exactly one primary, and fewer words up front than the whole page', () => {
    for (const s of [CLEAN, FLAGGED, UNREAD]) {
      const h = html(s);
      expect(h.match(/data-primary/g)).toHaveLength(1);
      const words = (x: string) => text(x).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
      expect(words(main(h))).toBeLessThan(words(h));
    }
  });
});
