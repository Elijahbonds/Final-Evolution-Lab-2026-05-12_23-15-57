// MUSIC-SUITE P4 (2026-09-25): the pocket grid's rules (ui/gridMath.ts) — page math, the ≥ 40 px phone cell at 375 px,
// the drag-to-paint stroke, the cursor, and where a transient line may float.
import { describe, expect, it } from 'vitest';
import {
  MIN_CELL_PX, PHONE_MAX_PX, bandOverlap, beatShade, cellSizePx, clampPage, gridLayout, gridTemplate, isBeatStart, moveCursor,
  pageLabel, pageOfStep, paintRows, phoneContainerPx, stepsOnPage, strokeBreak, strokeCells, strokeEnter, strokeStart, swipePage, toastSpot,
} from './gridMath';

describe('page math', () => {
  it('under 640 px the grid is two pages of 8; at 640 and up one page of 16', () => {
    expect(gridLayout(375)).toEqual({ compact: true, pageSteps: 8, pages: 2, steps: 16 });
    expect(gridLayout(PHONE_MAX_PX - 1).compact).toBe(true);
    expect(gridLayout(PHONE_MAX_PX)).toEqual({ compact: false, pageSteps: 16, pages: 1, steps: 16 });
    expect(gridLayout(1280).pages).toBe(1);
    expect(gridLayout(0).compact).toBe(false);          // an unmeasured width (SSR) is the desktop grid
    expect(gridLayout(Number.NaN).compact).toBe(false);
  });

  it('each page draws its own 8 steps, and a step knows its page', () => {
    const phone = gridLayout(375);
    expect(stepsOnPage(0, phone)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(stepsOnPage(1, phone)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(stepsOnPage(7, phone)).toEqual(stepsOnPage(1, phone));   // clamped
    expect(pageOfStep(0, phone)).toBe(0);
    expect(pageOfStep(7, phone)).toBe(0);
    expect(pageOfStep(8, phone)).toBe(1);
    expect(pageOfStep(15, phone)).toBe(1);
    expect(pageLabel(0, phone)).toBe('1–8');
    expect(pageLabel(1, phone)).toBe('9–16');
    const desk = gridLayout(1280);
    expect(stepsOnPage(0, desk)).toHaveLength(16);
    expect(pageOfStep(15, desk)).toBe(0);
    expect(pageLabel(0, desk)).toBe('1–16');
    expect(clampPage(-3, phone)).toBe(0);
    expect(clampPage(Number.NaN, phone)).toBe(0);
  });

  it('a sideways swipe turns the page (right-to-left = next); a short or mostly vertical one does not', () => {
    const phone = gridLayout(375);
    expect(swipePage(0, -80, 10, phone)).toBe(1);
    expect(swipePage(1, 80, 10, phone)).toBe(0);
    expect(swipePage(1, -80, 0, phone)).toBe(1);    // no page 3
    expect(swipePage(0, -30, 0, phone)).toBe(0);    // too short
    expect(swipePage(0, -80, 70, phone)).toBe(0);   // a scroll, not a swipe
    expect(swipePage(0, -200, 0, gridLayout(1280))).toBe(0);   // desktop has one page
  });

  it('THE P4 TARGET: a phone cell is ≥ 40 px at 375 px inside GameShell (8 px gutter) and on /dev/music (none)', () => {
    const phone = gridLayout(375);
    const inShell = cellSizePx(phoneContainerPx(375, 8), phone);
    const onDev = cellSizePx(phoneContainerPx(375, 0), phone);
    expect(inShell).toBeGreaterThanOrEqual(MIN_CELL_PX);
    expect(onDev).toBeGreaterThanOrEqual(MIN_CELL_PX);
    expect(inShell).toBeCloseTo((375 - 16 - 8 - 7 * 2) / 8, 6);    // 42.125 (P4 FIX PASS: the room's pad 8 → 4)
    // P4 FIX PASS: 360 px, the most common Android width, inside GameShell — was 39.25 px with the 8 px pad
    expect(cellSizePx(phoneContainerPx(360, 8), gridLayout(360))).toBeCloseTo(40.25, 6);
    expect(cellSizePx(phoneContainerPx(360, 8), gridLayout(360))).toBeGreaterThanOrEqual(MIN_CELL_PX);
    // P1's grid at 375 (90 px names + 16 columns) — the number this replaces
    expect(cellSizePx(1280 - 32, gridLayout(1280))).toBeGreaterThan(60);
  });

  it('the row template: phone = 8 equal columns; desktop = a name column + 16', () => {
    expect(gridTemplate(gridLayout(375))).toEqual({ columns: 'repeat(8, minmax(0, 1fr))', gap: 2 });
    expect(gridTemplate(gridLayout(1280)).columns).toBe('112px repeat(16, minmax(0, 1fr))');
  });

  it('beats: shaded alternately every 4 steps, a beat starts on 0 / 4 / 8 / 12', () => {
    expect(Array.from({ length: 16 }, (_, s) => beatShade(s)).join('')).toBe('0000111100001111');
    expect(Array.from({ length: 16 }, (_, s) => s).filter(isBeatStart)).toEqual([0, 4, 8, 12]);
  });
});

describe('drag-to-paint', () => {
  const empty = (): boolean[][] => [new Array(16).fill(false), new Array(16).fill(false)];

  it('down on an OFF cell paints ON across the cells it crosses', () => {
    const out = paintRows(empty(), [{ row: 0, step: 2 }, { row: 0, step: 3 }, { row: 0, step: 4 }]);
    expect(out[0].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([2, 3, 4]);
  });

  it('down on an ON cell paints OFF, and leaves off cells off', () => {
    const rows = empty();
    rows[0][0] = rows[0][2] = rows[0][3] = true;
    const out = paintRows(rows, [{ row: 0, step: 2 }, { row: 0, step: 3 }, { row: 0, step: 4 }, { row: 0, step: 5 }]);
    expect(out[0].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([0]);   // 2, 3 cleared; 4, 5 stay off
  });

  it('a stroke paints ONE value: an on cell it crosses while painting ON stays on (never toggles back)', () => {
    const rows = empty();
    rows[0][3] = true;
    const out = paintRows(rows, [{ row: 0, step: 1 }, { row: 0, step: 5 }]);
    expect(out[0].slice(0, 7)).toEqual([false, true, true, true, true, true, false]);
  });

  it('a fast drag that skips cells fills the ones between (strokeCells)', () => {
    expect(strokeCells({ row: 0, step: 2 }, { row: 0, step: 6 })).toEqual([2, 3, 4, 5, 6].map((step) => ({ row: 0, step })));
    expect(strokeCells({ row: 0, step: 6 }, { row: 0, step: 4 })).toEqual([6, 5, 4].map((step) => ({ row: 0, step })));
    expect(strokeCells({ row: 0, step: 0 }, { row: 2, step: 0 })).toEqual([0, 1, 2].map((row) => ({ row, step: 0 })));
    expect(strokeCells({ row: 1, step: 1 }, { row: 1, step: 1 })).toEqual([{ row: 1, step: 1 }]);
  });

  it('across rows: a diagonal stroke paints the line it drew', () => {
    const out = paintRows(empty(), [{ row: 0, step: 0 }, { row: 1, step: 3 }]);
    expect(out[0].slice(0, 4).concat(out[1].slice(0, 4)).filter(Boolean)).toHaveLength(4);
    expect(out[0][0]).toBe(true);
    expect(out[1][3]).toBe(true);
  });

  it('P4 FIX PASS: a stroke that leaves the cells and comes back paints only where it re-entered — never the gap', () => {
    // bass step 3 (row 0) → down over an open NoteRow (no cell) → lead step 11 (row 1): the review's desktop case
    const out = paintRows(empty(), [{ row: 0, step: 3 }, null, null, { row: 1, step: 11 }, { row: 1, step: 13 }]);
    expect(out[0].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([3]);          // not bass 4–6
    expect(out[1].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([11, 12, 13]);  // lead 11, then the line again
    // without the break it filled the line it never drew
    expect(paintRows(empty(), [{ row: 0, step: 3 }, { row: 1, step: 11 }]).flat().filter(Boolean).length).toBeGreaterThan(2);
    // a break then the SAME cell again paints nothing new and is harmless
    let { stroke } = strokeStart({ row: 0, step: 3 }, false);
    stroke = strokeBreak(stroke);
    expect(strokeEnter(stroke, { row: 0, step: 3 }).paint).toEqual([]);
    expect(strokeEnter(stroke, { row: 0, step: 3 }).stroke.broken).toBeFalsy();
  });

  it('each cell is painted once per stroke (back and forth over it changes nothing more)', () => {
    let { stroke, paint } = strokeStart({ row: 0, step: 0 }, false);
    expect(stroke.value).toBe(true);
    expect(paint).toEqual([{ row: 0, step: 0 }]);
    ({ stroke, paint } = strokeEnter(stroke, { row: 0, step: 1 }));
    expect(paint).toEqual([{ row: 0, step: 1 }]);
    ({ stroke, paint } = strokeEnter(stroke, { row: 0, step: 0 }));
    expect(paint).toEqual([]);
    ({ stroke, paint } = strokeEnter(stroke, { row: 0, step: 0 }));   // no move
    expect(paint).toEqual([]);
    ({ stroke, paint } = strokeEnter(stroke, { row: 0, step: 3 }));
    expect(paint).toEqual([{ row: 0, step: 2 }, { row: 0, step: 3 }]);
  });

  it('a tap (down, no move) is one cell toggled', () => {
    const rows = empty();
    rows[1][9] = true;
    expect(paintRows(rows, [{ row: 1, step: 9 }])[1][9]).toBe(false);
    expect(paintRows(empty(), [{ row: 1, step: 9 }])[1][9]).toBe(true);
  });
});

describe('the step cursor', () => {
  it('the first arrow shows it (top row, the page’s first step); then it moves and stops at the edges', () => {
    const first = moveCursor(null, 0, 1, 4, 16, 8);
    expect(first).toEqual({ row: 0, step: 8 });
    expect(moveCursor(first, 0, 1, 4, 16)).toEqual({ row: 0, step: 9 });
    expect(moveCursor({ row: 0, step: 15 }, 0, 4, 4, 16)).toEqual({ row: 0, step: 15 });
    expect(moveCursor({ row: 0, step: 0 }, 0, -1, 4, 16)).toEqual({ row: 0, step: 0 });
    expect(moveCursor({ row: 3, step: 5 }, 1, 0, 4, 16)).toEqual({ row: 3, step: 5 });
    expect(moveCursor({ row: 3, step: 5 }, -1, 0, 4, 16)).toEqual({ row: 2, step: 5 });
    expect(moveCursor({ row: 9, step: 5 }, 0, 0, 4, 16)).toEqual({ row: 3, step: 5 });   // rows shrank under it
    expect(moveCursor({ row: 0, step: 0 }, 0, 1, 0, 16)).toBeNull();
  });
  it('crossing step 7 → 8 is a page change on the phone grid', () => {
    const phone = gridLayout(375);
    const c = moveCursor({ row: 0, step: 7 }, 0, 1, 4, 16)!;
    expect(pageOfStep(c.step, phone)).toBe(1);
  });
});

describe('where a transient line floats', () => {
  it('the band covering less of the grid and the transport: bottom when they fill the top, top when they fill the bottom', () => {
    const vh = 812;
    // scrolled so the grid starts at the top of the screen and the transport ends at 700: the bottom band is free
    expect(toastSpot(vh, [{ top: 20, bottom: 560 }, { top: 560, bottom: 700 }])).toBe('bottom');
    // scrolled down: the grid and transport run to the bottom edge; the top is free
    expect(toastSpot(vh, [{ top: 300, bottom: 740 }, { top: 740, bottom: 900 }])).toBe('top');
    // nothing to keep clear: the old spot
    expect(toastSpot(vh, [])).toBe('bottom');
  });
  it('bandOverlap sums the covered pixels', () => {
    expect(bandOverlap({ top: 0, bottom: 80 }, [{ top: 50, bottom: 100 }, { top: -10, bottom: 10 }])).toBe(40);
    expect(bandOverlap({ top: 0, bottom: 80 }, [{ top: 90, bottom: 100 }])).toBe(0);
  });
});
