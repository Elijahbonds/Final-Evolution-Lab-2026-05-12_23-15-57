import { describe, it, expect } from 'vitest';
import { holeName, cardString, windBearingDeg, windWord, holeBoard, ACCURACY_CENTER, ACCURACY_HALF } from './golfHud';

describe('golf readability layer', () => {
  it('names strokes against par the way golf does', () => {
    expect(holeName(1, 3)).toBe('ACE');
    expect(holeName(2, 4)).toBe('EAGLE');
    expect(holeName(3, 4)).toBe('BIRDIE');
    expect(holeName(4, 4)).toBe('PAR');
    expect(holeName(5, 4)).toBe('BOGEY');
    expect(holeName(6, 4)).toBe('DOUBLE BOGEY');
    expect(holeName(7, 4)).toBe('TRIPLE BOGEY');
    expect(holeName(9, 4)).toBe('+5');
    expect(holeName(0, 3)).toBe('—');
  });

  it('card string: E, plus, minus', () => {
    expect(cardString(0)).toBe('E');
    expect(cardString(2)).toBe('+2');
    expect(cardString(-1)).toBe('-1');
  });

  it('wind bearing is relative to the shot line and reads in words', () => {
    const shot = { x: 0, z: 1 };
    expect(windBearingDeg({ x: 0, z: 2 }, shot)).toBe(0);                       // downwind
    expect(Math.abs(windBearingDeg({ x: 0, z: -2 }, shot))).toBe(180);          // into
    expect(windBearingDeg({ x: 2, z: 0 }, shot)).toBe(90);                      // left to right
    expect(windBearingDeg({ x: -2, z: 0 }, shot)).toBe(-90);
    expect(windBearingDeg({ x: 0, z: 0 }, shot)).toBe(0);
    expect(windWord(0, 3)).toBe('HELPING');
    expect(windWord(175, 3)).toBe('INTO');
    expect(windWord(90, 3)).toBe('LEFT → RIGHT');
    expect(windWord(-90, 3)).toBe('RIGHT → LEFT');
    expect(windWord(90, 0.2)).toBe('CALM');
    expect(ACCURACY_CENTER + ACCURACY_HALF).toBeLessThan(1);
  });

  it('scorecard rows: every hole listed, played ones named, a card total', () => {
    const rows = holeBoard([{ hole: 1, par: 3, strokes: 2 }, { hole: 2, par: 4, strokes: 12, pickedUp: true }], 3);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ name: 'HOLE 1', score: 2, line: 'PAR 3 · BIRDIE' });
    expect(rows[1].line).toBe('PAR 4 · PICKED UP');
    expect(rows[2]).toEqual({ name: 'HOLE 3', score: '—', line: '' });
    expect(rows[3]).toEqual({ name: 'CARD', score: 14, line: '+7' });
    expect(holeBoard([], 3)[3].line).toBe('');
  });
});
