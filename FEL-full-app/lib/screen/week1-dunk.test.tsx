// MIRROR step 3: week-1 day cards inside the Dunking & Plyometrics base weeks (adults, on-device, nothing saved).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LaneBody, ProgramLaneView, Week1Cards } from '@/app/screen/program/[lane]/program-lane';
import { AGE_BANDS, linksAllowed } from './age';
import { SUMMARY_VERSION, type ScreenSummary } from './checks';
import { THRESHOLDS_VERSION } from './PROPOSED-thresholds';
import { WEEK1_DUNK_DAYS, WEEK1_END_SET, WEEK1_EXIT, WEEK1_TITLE } from './week1-dunk';

const S = (lane: ScreenSummary['lane']): ScreenSummary => ({
  v: SUMMARY_VERSION, thresholdsVersion: THRESHOLDS_VERSION, checks: [], complete: true, clean: true, priorities: [], lane, topFlag: null, jumpBestIn: null,
});
const strings = () => [WEEK1_TITLE, WEEK1_END_SET, WEEK1_EXIT, ...WEEK1_DUNK_DAYS.flatMap((d) => [d.title, ...d.blocks.flatMap((b) => [b.name, b.what])])];

describe('MIRROR step 3: week 1 of the base weeks', () => {
  it('seven days in the program\'s weekly layout: A, snack, B, off, C, snack, off', () => {
    expect(WEEK1_DUNK_DAYS.map((d) => `${d.day}:${d.kind}`)).toEqual(['Mon:session', 'Tue:snack', 'Wed:session', 'Thu:rest', 'Fri:session', 'Sat:snack', 'Sun:rest']);
    expect(WEEK1_DUNK_DAYS.filter((d) => d.kind === 'session').map((d) => d.title)).toEqual(['Session A', 'Session B', 'Session C (re-test first)']);   // the doc's weekly layout, word for word
  });

  it('every session opens with the check-in, closes with the Neural Flush, and has Spring and Strong blocks', () => {
    for (const d of WEEK1_DUNK_DAYS.filter((x) => x.kind === 'session')) {
      const names = d.blocks.map((b) => b.name);
      expect(names[0], d.day).toBe('Check-in');
      expect(names[names.length - 1], d.day).toBe('Reset (Neural Flush)');
      expect(names, d.day).toEqual(expect.arrayContaining(['Down, Up, Check', 'Breath and stack', 'Spring', 'Strong']));
    }
  });

  it('base weeks only: rung 0–1, no drop jumps, no approach or max-effort work', () => {
    const spring = WEEK1_DUNK_DAYS.flatMap((d) => d.blocks.filter((b) => b.name === 'Spring').map((b) => b.what)).join(' ');
    expect(spring).toMatch(/Rung 0/);
    expect(spring).not.toMatch(/Rung [2-6]|drop jump|approach|dunk attempt|max/i);
  });

  it('player-visible text carries no tuning marker, placeholder, "coming soon", or harsh word', () => {
    for (const s of strings()) expect(s, s).not.toMatch(/\[TUNE|TUNE\]|to-tune|PLACEHOLDER|coming (soon|later)|\binjur\w*|\bfail\w*|\bdiagnos/i);
  });

  it('shows on the dunking lane for an adult, never on the other lanes', () => {
    expect(renderToStaticMarkup(createElement(LaneBody, { lane: 'dunking', s: S('dunking') }))).toContain('data-week1');
    for (const lane of ['correctives', 'posture'] as const) expect(renderToStaticMarkup(createElement(LaneBody, { lane, s: S(lane) }))).not.toContain('data-week1');
  });

  it('never for under 18 or an age not given (they get the parent card)', () => {
    for (const age of AGE_BANDS) {
      const h = renderToStaticMarkup(createElement(ProgramLaneView, { lane: 'dunking', state: { s: S('dunking'), age } }));
      if (linksAllowed(age)) expect(h, age).toContain('data-week1'); else expect(h, age).not.toContain('data-week1');
    }
  });

  it('the cards are text only: no link, form, input or button', () => {
    const h = renderToStaticMarkup(createElement(Week1Cards));
    expect(h.match(/data-week1-day=/g)?.length).toBe(7);
    expect(h).not.toMatch(/<a |<form|<input|<button|href=/);
  });
});
