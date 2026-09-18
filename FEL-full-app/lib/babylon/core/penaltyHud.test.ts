import { describe, it, expect } from 'vitest';
import { kickPips, kicksBoard } from './penaltyHud';
import { freshDerby, bankSwing, feetFromMetres, distanceLine, derbyBoard, OUTS_CAP } from './derbyHud';

describe('penalty kicks board', () => {
  it('pips: goals, misses, kicks still to take, sudden death after a bar', () => {
    expect(kickPips([])).toBe('· · · · ·');
    expect(kickPips(['goal', 'miss'])).toBe('● ○ · · ·');
    expect(kickPips(['goal', 'goal', 'goal', 'goal', 'goal', 'miss', 'goal'])).toBe('● ● ● ● ● | ○ ●');
  });
  it('board rows count goals and carry both sides', () => {
    const b = kicksBoard(['goal', 'miss', 'goal'], ['goal', 'goal']);
    expect(b[0]).toEqual({ name: 'YOU', score: 2, line: '● ○ ● · ·' });
    expect(b[1]).toEqual({ name: 'THEM', score: 2, line: '● ● · · ·' });
  });
});

describe('derby counters', () => {
  it('banks homers with distance, counts outs, ends at the cap', () => {
    const t = freshDerby();
    expect(bankSwing(t, true, 410)).toBe(false);
    expect(bankSwing(t, true, 388)).toBe(false);
    expect(bankSwing(t, false)).toBe(false);
    expect(t).toEqual({ homers: 2, outs: 1, longestFt: 410, totalFt: 798 });
    for (let i = 0; i < OUTS_CAP - 2; i++) expect(bankSwing(t, false)).toBe(false);
    expect(bankSwing(t, false)).toBe(true);
    expect(t.outs).toBe(OUTS_CAP);
  });
  it('feet and lines', () => {
    expect(feetFromMetres(100)).toBe(328);
    expect(feetFromMetres(-2)).toBe(0);
    expect(distanceLine(410, 410)).toBe('410 FT · LONGEST');
    expect(distanceLine(380, 410)).toBe('380 FT');
    const b = derbyBoard({ homers: 3, outs: 4, longestFt: 421, totalFt: 1200 }, 5, 'ticking');
    expect(b[0]).toEqual({ name: 'YOU', score: 3, line: '4 / 10 OUTS · LONGEST 421 FT' });
    expect(b[1]).toEqual({ name: 'RIVAL', score: 5, line: 'ticking' });
  });
});
