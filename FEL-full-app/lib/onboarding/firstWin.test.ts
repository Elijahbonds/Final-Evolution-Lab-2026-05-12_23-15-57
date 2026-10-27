import { describe, expect, it } from 'vitest';
import { WAKE_UP } from '../drills/drills';
import { COUNT_DWELL_MS } from '../knowledge/state';
import { PATHS } from './firstRun';
import {
  BREATH_LEAD_SEC, CARD_COUNT_SEC, FIRST_WINS, FIRST_WIN_CAP_SEC, TEACH_HELD_LINE, breathAt, breathPhase, breathSeconds,
  firstWinSummary, pickerOptions,
} from './firstWin';

describe('ONB-02: one first win per path, each inside the minute', () => {
  it('has one for every path, and promises no more than the cap', () => {
    expect(Object.keys(FIRST_WINS).sort()).toEqual([...PATHS].sort());
    for (const p of PATHS) {
      const w = FIRST_WINS[p];
      expect(w.path).toBe(p);
      expect(w.aboutSec, p).toBeLessThanOrEqual(FIRST_WIN_CAP_SEC);
      expect(w.steps.length, p).toBeGreaterThan(0);
      expect(w.next.href.startsWith('/'), p).toBe(true);
      expect(w.doneTitle).toBe('You did it');
    }
    expect(FIRST_WIN_CAP_SEC).toBe(60);
  });

  it("train's win is the Wake-Up's own breathing phase, with the book's numbers (not retyped)", () => {
    const p = breathPhase();
    expect(WAKE_UP.phases).toContain(p);
    expect(p.id).toBe('pressurize');
    expect(p.pacer).toEqual({ from: 6, inSec: 4, holdSec: 2, outSec: 6, rounds: 3 });
    expect(breathSeconds()).toBe(36);
    expect(FIRST_WINS.train.aboutSec).toBe(BREATH_LEAD_SEC + 36);
  });

  it('paces the breaths: ready, then in / hold / out three times, then done', () => {
    expect(breathAt(0).beat).toBe('ready');
    expect(breathAt(BREATH_LEAD_SEC + 0.1)).toMatchObject({ beat: 'in', round: 1 });
    expect(breathAt(BREATH_LEAD_SEC + 4.1)).toMatchObject({ beat: 'hold', round: 1 });
    expect(breathAt(BREATH_LEAD_SEC + 6.1)).toMatchObject({ beat: 'out', round: 1 });
    expect(breathAt(BREATH_LEAD_SEC + 12.1)).toMatchObject({ beat: 'in', round: 2 });
    expect(breathAt(BREATH_LEAD_SEC + 35.9)).toMatchObject({ beat: 'out', round: 3 });
    expect(breathAt(BREATH_LEAD_SEC + 36).beat).toBe('done');
  });

  it("learn's card counts the way the feed counts it", () => {
    expect(CARD_COUNT_SEC * 1000).toBe(COUNT_DWELL_MS);
  });

  it('holds teach in the picker until the age step says verified adult', () => {
    for (const adult of [null, false]) {
      const teach = pickerOptions({ adult }).find((o) => o.path === 'teach')!;
      expect(teach.held).toBe(true);
    }
    expect(pickerOptions({ adult: true }).every((o) => !o.held)).toBe(true);
    expect(pickerOptions({ adult: false }).filter((o) => o.held).map((o) => o.path)).toEqual(['teach']);
    expect(TEACH_HELD_LINE).toMatch(/adults/i);
  });

  it('summarises first wins for the funnel: count, median, under the cap; junk is ignored', () => {
    const lines = firstWinSummary([
      { path: 'train', sec: 40 }, { path: 'train', sec: 44 }, { path: 'train', sec: 70 },
      { path: 'learn', sec: 6 }, { path: 'nope', sec: 1 }, { path: 'learn', sec: -1 }, null, 'x',
    ]);
    expect(lines.find((l) => l.path === 'train')).toEqual({ path: 'train', wins: 3, medianSec: 44, underCap: 2 });
    expect(lines.find((l) => l.path === 'learn')).toEqual({ path: 'learn', wins: 1, medianSec: 6, underCap: 1 });
    expect(lines.find((l) => l.path === 'teach')).toEqual({ path: 'teach', wins: 0, medianSec: null, underCap: 0 });
  });
});
