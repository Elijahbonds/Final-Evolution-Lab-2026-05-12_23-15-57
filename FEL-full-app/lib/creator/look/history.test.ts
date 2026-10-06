// Undo / redo history (IMPROVE (2026-10-06), CREATOR-PLAN phase 1).
import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, pushHistory, redo, resetHistory, undo } from './history';

describe('history', () => {
  it('undo and redo walk the steps both ways', () => {
    let h = createHistory({ hair: 'Fade' });
    h = pushHistory(h, { hair: 'Afro' });
    h = pushHistory(h, { hair: 'Locs' });
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
    h = undo(h); expect(h.present).toEqual({ hair: 'Afro' });
    h = undo(h); expect(h.present).toEqual({ hair: 'Fade' });
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);   // nothing to undo: unchanged, same object
    h = redo(h); expect(h.present).toEqual({ hair: 'Afro' });
    h = redo(h); expect(h.present).toEqual({ hair: 'Locs' });
    expect(redo(h)).toBe(h);
  });
  it('a new change clears redo', () => {
    let h = pushHistory(createHistory(1), 2);
    h = undo(h);
    h = pushHistory(h, 3);
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual([1]);
    expect(h.present).toBe(3);
  });
  it('a change that changes nothing records nothing', () => {
    const h = createHistory({ a: 1 });
    expect(pushHistory(h, { a: 1 })).toBe(h);
  });
  it('a drag (same group) is ONE step; another group or no group starts a new one', () => {
    let h = createHistory(0);
    for (let v = 1; v <= 30; v++) h = pushHistory(h, v, 'slider:faceLong');
    expect(h.past).toEqual([0]);
    expect(h.present).toBe(30);
    h = pushHistory(h, 31, 'slider:jawOpen');
    h = pushHistory(h, 32);
    h = pushHistory(h, 33);
    expect(h.past).toEqual([0, 30, 31, 32]);
    expect(undo(h).present).toBe(32);
    // after an undo the same group does not merge into the restored state
    h = undo(h);
    h = pushHistory(h, 40, 'slider:jawOpen');
    expect(h.past).toEqual([0, 30, 31, 32]);
  });
  it('keeps at most `limit` steps of past', () => {
    let h = createHistory(0, 5);
    for (let v = 1; v <= 20; v++) h = pushHistory(h, v);
    expect(h.past).toEqual([15, 16, 17, 18, 19]);
    expect(h.present).toBe(20);
  });
  it('reset starts over with no undo across a load', () => {
    let h = pushHistory(createHistory('a'), 'b');
    h = resetHistory(h, 'loaded');
    expect(h).toMatchObject({ past: [], present: 'loaded', future: [] });
  });
});
