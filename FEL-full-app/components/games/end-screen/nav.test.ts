// END SCREEN — console navigation: the d-pad / stick / A / B and the keyboard.
import { describe, it, expect } from 'vitest';
import { spatialNext, keyIntent, padFrame, padIntents, type Rect, type PadFrame } from './nav';

// The card's action area at 1080p, roughly: Play again and the Next teaser on one row, the secondary row under them.
//   [ primary 0 ][        next 1        ]
//   [modes 2][home 3][challenge 4][proof 5]
const R = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height });
const grid: Rect[] = [
  R(100, 800, 400, 90), R(540, 800, 900, 90),
  R(100, 910, 160, 50), R(280, 910, 160, 50), R(460, 910, 260, 50), R(740, 910, 600, 50),
];

describe('spatial focus', () => {
  it('moves to the nearest control in the pressed direction', () => {
    expect(spatialNext(grid, 0, 'right')).toBe(1);
    expect(spatialNext(grid, 1, 'left')).toBe(0);
    expect(spatialNext(grid, 0, 'down')).toBe(2);   // straight below beats diagonally across
    expect(spatialNext(grid, 2, 'right')).toBe(3);
    expect(spatialNext(grid, 5, 'up')).toBe(1);
    expect(spatialNext(grid, 3, 'up')).toBe(0);
  });
  it('a control on the same row beats a nearer one on the next row (Left from Next is Play again)', () => {
    // the secondary row's second button ends right under the teaser's left edge, nearer than Play again's right edge
    const g: Rect[] = [R(30, 600, 180, 60), R(260, 600, 900, 60), R(30, 670, 120, 40), R(160, 670, 96, 40)];
    expect(spatialNext(g, 1, 'left')).toBe(0);
    expect(spatialNext(g, 3, 'up')).toBe(0);   // up from the button under Play again's right half
  });

  it('stays put at an edge (no wrap off the card)', () => {
    expect(spatialNext(grid, 0, 'up')).toBe(0);
    expect(spatialNext(grid, 0, 'left')).toBe(0);
    expect(spatialNext(grid, 5, 'right')).toBe(5);
  });
  it('an unknown start lands on the first control; an empty card has none', () => {
    expect(spatialNext(grid, 99, 'down')).toBe(0);
    expect(spatialNext([], 0, 'down')).toBe(-1);
  });
});

describe('the keyboard', () => {
  it('arrows move, Enter / Space select, Escape / Backspace back; WASD stay the game\'s', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(keyIntent)).toEqual(['up', 'down', 'left', 'right']);
    expect(keyIntent('Enter')).toBe('select');
    expect(keyIntent(' ')).toBe('select');
    expect(keyIntent('Escape')).toBe('back');
    expect(keyIntent('Backspace')).toBe('back');
    for (const k of ['w', 'a', 's', 'd', 'j', 'k', 'Tab', 'Shift']) expect(keyIntent(k), k).toBeNull();
  });
});

describe('the pad', () => {
  const pad = (pressed: number[], axes: [number, number] = [0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })), axes });
  const idle: PadFrame = padFrame(pad([]));

  it('standard mapping: A 0, B 1, d-pad 12–15, and the left stick past its dead zone', () => {
    expect(padFrame(pad([0]))).toMatchObject({ a: true, b: false });
    expect(padFrame(pad([1]))).toMatchObject({ b: true });
    expect(padFrame(pad([12]))).toMatchObject({ up: true });
    expect(padFrame(pad([15]))).toMatchObject({ right: true });
    expect(padFrame(pad([], [-0.9, 0]))).toMatchObject({ left: true });
    expect(padFrame(pad([], [0, 0.3]))).toMatchObject({ down: false });   // dead zone
    expect(padFrame(null)).toEqual(idle);
  });

  it('a press counts once, on the way down — holding it does not repeat', () => {
    const a = padFrame(pad([0]));
    expect(padIntents(idle, a)).toEqual(['select']);
    expect(padIntents(a, a)).toEqual([]);
    expect(padIntents(a, idle)).toEqual([]);
    const right = padFrame(pad([], [0.9, 0]));
    expect(padIntents(idle, right)).toEqual(['right']);
    expect(padIntents(right, right)).toEqual([]);
  });

  it('whatever is already held when the card appears (the A mashed at the whistle) is not a press', () => {
    expect(padIntents(null, padFrame(pad([0, 1, 13])))).toEqual([]);
  });

  it('B backs out', () => {
    expect(padIntents(idle, padFrame(pad([1])))).toEqual(['back']);
  });
});
