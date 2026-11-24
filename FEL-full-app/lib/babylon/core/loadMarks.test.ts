// lane/improve-hoops phase 3 (2026-11-22): the load marks are logging only — a line per stage, the time since the last, never a throw.
import { describe, expect, it } from 'vitest';
import { LoadMarks, beginLoadMarks, loadMarks } from './loadMarks';

describe('loadMarks', () => {
  it('logs each stage with the time since the previous mark, and ranks the longest', () => {
    let t = 1000; const lines: string[] = [];
    const m = new LoadMarks('onevone', () => t, (s) => lines.push(s));
    t = 1500; expect(m.mark('venue')).toBe(500);
    t = 9500; expect(m.mark('body.hero')).toBe(8000);
    expect(lines).toEqual(['[FEL-LOAD] onevone venue +500 ms (@1500 ms)', '[FEL-LOAD] onevone body.hero +8000 ms (@9500 ms)']);
    expect(m.longest(1)).toEqual([['body.hero', 8000]]);
  });
  it('a mode marks on the harness\'s current load; with none, the mark is a no-op', () => {
    const lm = beginLoadMarks('tennis');
    expect(loadMarks()).toBe(lm);
    expect(() => loadMarks().mark('stage')).not.toThrow();
    expect(lm.marks.map((x) => x.stage)).toEqual(['stage']);
  });
  it('never throws, even when the log does', () => {
    const m = new LoadMarks('x', () => 0, () => { throw new Error('no console'); });
    expect(m.mark('a')).toBe(0);
  });
});
