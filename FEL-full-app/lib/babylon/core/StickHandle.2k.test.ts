// THE RIGHT STICK, AGAINST 2K (Phase 3 of the hoops upgrade pass). docs/SPEC-STICK-2K-DECODE.md is the reference;
// every row of its gap table is a case here. Ball in the RIGHT hand unless a case says otherwise; 2K's map mirrors
// with the ball hand, so each case is also run mirrored and must produce the same move.
import { describe, expect, it } from 'vitest';
import { stickMoveFor, dir8Of, type StickGesture, type StickRead } from './StickHandle';

const flick = (x: number, y: number): StickGesture => ({ kind: 'flick', dir: Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up'), dir8: dir8Of(x, y), x, y });
const sweep = (sign: 1 | -1): StickGesture => ({ kind: 'sweep', sign });
const hold = (): StickGesture => ({ kind: 'hold', x: 1, y: 0 });

/** A walking, unpressured read with the ball in `hand`. */
const read = (over: Partial<StickRead> = {}): StickRead => ({ speed01: 0.2, pressured: false, sprint: false, hand: 'Right', ...over });

/** The same gesture with the ball in the other hand: x mirrored. Stick y (up/down) is not a side. */
const mirrored = (g: StickGesture): StickGesture => (g.kind === 'flick' ? flick(-g.x, g.y) : g.kind === 'sweep' ? sweep(g.sign > 0 ? -1 : 1) : g);
const move = (g: StickGesture, r: StickRead = read()) => stickMoveFor(g, r)?.move ?? null;

/** Every row is asserted with the ball in the right hand AND, mirrored, in the left. */
const bothHands = (name: string, g: StickGesture, expected: string, over: Partial<StickRead> = {}) => {
  it(`${name}: ball right`, () => expect(move(g, read(over))).toBe(expected));
  it(`${name}: ball LEFT (mirrored)`, () => expect(move(mirrored(g), read({ ...over, hand: 'Left' }))).toBe(expected));
};

describe('the 2K map, relative to the ball hand', () => {
  bothHands('hesitation is a flick TOWARD the ball hand', flick(1, 0), 'hesi');
  bothHands('between the legs is a flick AWAY from the ball hand', flick(-1, 0), 'between_legs');
  bothHands('crossover is up-away', flick(-0.75, -0.75), 'crossover');
  bothHands('in and out is up', flick(0, -1), 'in_and_out');
  bothHands('behind the back is down-away', flick(-0.75, 0.75), 'behind_back');
  bothHands('step-back is a plain down flick — no modifier', flick(0, 1), 'stepback');
  bothHands('a size-up is up-toward', flick(0.75, -0.75), 'size_up');
});

describe('R2 held is the ESCAPE', () => {
  bothHands('the crossover with R2 is the momentum cross', flick(-0.75, -0.75), 'momentum_cross', { escape: true });
  bothHands('behind the back with R2 is the momentum wrap', flick(-0.75, 0.75), 'momentum_btb', { escape: true });
  bothHands('the step-back with R2 is the SNATCHBACK — a step-back that crosses', flick(0, 1), 'snatchback', { escape: true });
  it('speed alone no longer promotes a move — a flick at a jog without R2 is the plain move', () => {
    expect(move(flick(-0.75, -0.75), read({ speed01: 0.9, sprint: true, escape: false }))).toBe('crossover');
  });
});

describe('the spin is a rotation, not a modifier', () => {
  it('a full sweep is the spin', () => expect(move(sweep(1))).toBe('spin'));
  it('a full sweep with R2 is the steezo roll (the drop step at the rim)', () => expect(move(sweep(1), read({ escape: true }))).toBe('steezo_roll'));
  it('L2 no longer turns a flick into a spin', () => expect(move(flick(-0.75, -0.75), read({ brace: true }))).toBe('crossover'));
  it('L2 + down is no longer the step-back — down alone is', () => expect(move(flick(0, 1), read({ brace: true }))).toBe('stepback'));
});

describe('what did not change', () => {
  it('a held stick is PAUSIN’ — the mode freezes the dribble on it, the table says nothing', () => expect(move(hold())).toBeNull());
  it('a release says nothing', () => expect(move({ kind: 'release', heldSec: 0.4 })).toBeNull());
  it('the ball hand defaults to the right, so every existing caller keeps a meaning', () => {
    expect(stickMoveFor(flick(1, 0), { speed01: 0.2, pressured: false, sprint: false })?.move).toBe('hesi');
  });
});

describe('side', () => {
  it('a crossover reports the side the ball is GOING to — away from the ball hand', () => {
    expect(stickMoveFor(flick(-0.75, -0.75), read({ hand: 'Right' }))?.side).toBe('left');
    expect(stickMoveFor(flick(0.75, -0.75), read({ hand: 'Left' }))?.side).toBe('right');
  });
  it('a hesi has no side', () => expect(stickMoveFor(flick(1, 0), read())?.side).toBeNull());
});
