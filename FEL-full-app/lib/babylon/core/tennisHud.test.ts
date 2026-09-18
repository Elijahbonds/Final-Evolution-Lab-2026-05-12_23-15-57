import { describe, it, expect } from 'vitest';
import { answerFor, tellFor, rallyPace, tennisBoard, SHOT_FACE, PACE_FLOOR } from './tennisHud';

describe('tennis readability + feel layer', () => {
  it('every shot has an answer and a face', () => {
    expect(answerFor('lob')).toBe('drive');
    expect(answerFor('drop')).toBe('drop');
    expect(answerFor('slice')).toBe('drive');
    expect(answerFor('drive')).toBe('slice');
    expect(new Set(Object.values(SHOT_FACE)).size).toBe(4);
    for (const s of ['drive', 'slice', 'drop', 'lob'] as const) expect(tellFor(s).toUpperCase()).toContain(s.toUpperCase());
  });

  it('rally pace shortens flight with the rally and floors', () => {
    expect(rallyPace(0)).toBe(1);
    expect(rallyPace(4)).toBeLessThan(rallyPace(2));
    expect(rallyPace(50)).toBe(PACE_FLOOR);
    expect(rallyPace(-3)).toBe(1);
  });

  it('scoreboard rows carry games, the call and a streak', () => {
    const b = tennisBoard([3, 2], 'AD IN', 3);
    expect(b[0]).toEqual({ name: 'YOU', score: 3, line: 'AD IN · 3 STRAIGHT' });
    expect(b[1]).toEqual({ name: 'THEM', score: 2, line: '' });
    expect(tennisBoard([0, 0], '0-0', 1)[0].line).toBe('0-0');
  });
});
