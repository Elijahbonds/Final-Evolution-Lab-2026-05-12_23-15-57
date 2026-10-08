import { describe, it, expect } from 'vitest';
import { ITEM_GRID_CLEAR, onGrid } from './itemGrid';

describe('item rows stay off the starting grid', () => {
  it('is on the grid from behindM behind the line to aheadM past it, and nowhere else', () => {
    const L = 900, start = 100;
    expect(onGrid(start, start, L)).toBe(true);
    expect(onGrid(start - 6, start, L)).toBe(true);    // the measured row behind the kart
    expect(onGrid(start + 8, start, L)).toBe(true);    // the measured row ahead of it
    expect(onGrid(start - ITEM_GRID_CLEAR.behindM - 1, start, L)).toBe(false);
    expect(onGrid(start + ITEM_GRID_CLEAR.aheadM + 1, start, L)).toBe(false);
    expect(onGrid(start + L / 2, start, L)).toBe(false);
  });
  it('wraps past the line: a row near the end of the lap is behind a start near zero', () => {
    expect(onGrid(895, 5, 900)).toBe(true);   // 10 m behind, across the wrap
    expect(onGrid(5, 895, 900)).toBe(true);    // 10 m ahead, across the wrap
    expect(onGrid(15, 895, 900)).toBe(false);  // 20 m ahead: past aheadM
  });
});
