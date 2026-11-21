// lane/online-play: one game, read from each side — the scores swap, YOUR becomes THEIR, a WIN is a LOSS, my body is mine.
import { describe, it, expect } from 'vitest';
import { flipBanner, hudForSide, flipOutcome, localOrder, PRIVATE_HUD } from '../../lib/net/perspective';

describe('flipBanner (the hoops banners, read by the other side)', () => {
  it.each([
    ['YOUR BALL', 'THEIR BALL'],
    ['THEIR BALL — DEFEND!', 'YOUR BALL'],
    ['THEIR BOARD — DEFEND AGAIN!', 'YOUR BOARD AGAIN'],
    ['CHECK UP — DEFEND!', 'CHECK UP — YOUR BALL'],
    ['BOXED OUT — YOUR BOARD', 'BOXED OUT — THEIR BOARD'],
    ['POSTERIZED — THEY THREW IT DOWN ON YOU', 'POSTERIZED — YOU THREW IT DOWN ON THEM'],
    ['FOUL ON YOU — THEIR BALL', 'FOUL ON THEM — YOUR BALL'],
    ['JUMPER +2', 'THEY SCORE — JUMPER +2'],
    ['STRIPPED!', 'STRIPPED!'],
  ])('%s → %s', (a, b) => { expect(flipBanner(a)).toBe(b); });
  it('flipping twice is not required to round-trip, but a swapped word is never swapped back in one pass', () => {
    expect(flipBanner('YOUR THEIR')).toBe('THEIR YOUR');
  });
});

describe('hudForSide', () => {
  it('an opponent swaps the scores and flips the banner', () => {
    expect(hudForSide({ score: 7, foeScore: 3, banner: 'YOUR BALL', time: 90 }, false)).toEqual({ foeScore: 7, score: 3, banner: 'THEIR BALL', time: 90 });
  });
  it('a teammate keeps them', () => {
    expect(hudForSide({ score: 7, foeScore: 3, banner: 'YOUR BALL' }, true)).toEqual({ score: 7, foeScore: 3, banner: 'YOUR BALL' });
  });
  it('the running player\'s own meter, shot label, hints and momentum never reach another page', () => {
    const h = hudForSide({ shotType: 'JUMPER', shotMeterT: 0.4, hint: 'HOLD X', momentum: 0.8, score: 1 }, true);
    expect(h).toEqual({ score: 1 });
    expect(PRIVATE_HUD.test('shotMeterT')).toBe(true);
  });
});

describe('outcomes and bodies', () => {
  it('flipOutcome', () => {
    expect(flipOutcome('WIN', false)).toBe('LOSS'); expect(flipOutcome('LOSS', false)).toBe('WIN');
    expect(flipOutcome('WIN', true)).toBe('WIN'); expect(flipOutcome('TIE', false)).toBe('TIE');
  });
  it('1v1: the guest draws itself from the host\'s second body and its rival from the first', () => {
    expect(localOrder({ seats: { h1: 0, foe: 1 }, teams: [0, 1], bodies: [{ p: [0, 0, 0] }, { p: [0, 0, 0] }] }, 'foe').order).toEqual([1, 0]);
  });
  it('3v3: a rival seat lays its team out first, then the host\'s', () => {
    const w = { seats: { h1: 0, net1: 3 }, teams: [0, 0, 0, 1, 1, 1], bodies: Array.from({ length: 6 }, () => ({ p: [0, 0, 0] as [number, number, number] })) };
    expect(localOrder(w, 'net1')).toEqual({ order: [3, 4, 5, 0, 1, 2], team: 1, seat: 3 });
    expect(localOrder(w, 'wspy').order).toEqual([0, 1, 2, 3, 4, 5]);   // a watcher draws the host's layout
  });
});
