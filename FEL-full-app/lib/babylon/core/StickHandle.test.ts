import { describe, it, expect } from 'vitest';
import { StickHandleReader, stickMoveFor, STICK, pausinWanted, PAUSIN, dir8Of, sizeUpClip } from './StickHandle';

const play = (r: StickHandleReader, samples: [number, number, number][]) => samples.flatMap(([x, y, t]) => r.feed(x, y, t));

describe('StickHandleReader', () => {
  it('a snap from home past the flick ring is one flick, in its direction, once per excursion', () => {
    const r = new StickHandleReader();
    const g = play(r, [[0, 0, 0], [0.4, 0, 0.02], [0.9, 0, 0.05], [1, 0, 0.08], [0.95, 0, 0.11], [0.2, 0, 0.2], [0, 0, 0.25]]);
    expect(g).toEqual([{ kind: 'flick', dir: 'right', dir8: 'right', x: 0.9, y: 0 }]);
    const d = play(new StickHandleReader(), [[0, 0, 0], [0, 0.9, 0.04]]);
    expect(d[0]).toMatchObject({ kind: 'flick', dir: 'down' });
  });
  it('a slow push is not a flick; parked past the hold ring it is a HOLD, and letting go a RELEASE with the held time', () => {
    const r = new StickHandleReader();
    const g = play(r, [[0, 0, 0], [0.4, 0, 0.1], [0.6, 0, 0.2], [0.8, 0, 0.3], [0.8, 0, 0.4], [0.8, 0, 0.5], [0.8, 0, 0.6], [0, 0, 0.7]]);
    expect(g.map((x) => x.kind)).toEqual(['hold', 'release']);
    expect((g[1] as { heldSec: number }).heldSec).toBeCloseTo(0.6, 3);
  });
  it('a half circle around the ring at speed is a SWEEP with its sign', () => {
    const r = new StickHandleReader();
    const s: [number, number, number][] = [[0, 0, 0]];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; s.push([Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.05 + i * 0.03]); }
    const g = play(r, s);
    expect(g.some((x) => x.kind === 'sweep' && x.sign === 1)).toBe(true);
    expect(g.filter((x) => x.kind === 'sweep').length).toBe(1);
  });
});
describe('stickMoveFor (the 2K17 map)', () => {
  it('a side flick at speed is the momentum cross; slow it is the plain crossover', () => {
    expect(stickMoveFor({ kind: 'flick', dir: 'left', x: -1, y: 0 }, { speed01: 0.6, pressured: false, sprint: true })).toEqual({ move: 'momentum_cross', side: 'left' });
    expect(stickMoveFor({ kind: 'flick', dir: 'right', x: 1, y: 0 }, { speed01: 0.2, pressured: false, sprint: false })).toEqual({ move: 'crossover', side: 'right' });
  });
  it('THE 2K PRO STICK: down is the hesi at any pace; the down-DIAGONAL is the behind-the-back — aggressive at pace or right after a move', () => {
    expect(stickMoveFor({ kind: 'flick', dir: 'down', dir8: 'down', x: 0.2, y: 1 }, { speed01: 0.7, pressured: true, sprint: true })!.move).toBe('hesi');
    expect(stickMoveFor({ kind: 'flick', dir: 'down', dir8: 'downright', x: 0.7, y: 0.7 }, { speed01: 0.1, pressured: true, sprint: false })).toEqual({ move: 'behind_back', side: 'right' });
    expect(stickMoveFor({ kind: 'flick', dir: 'down', dir8: 'downleft', x: -0.7, y: 0.7 }, { speed01: 0.7, pressured: false, sprint: false })).toEqual({ move: 'momentum_btb', side: 'left' });
    expect(stickMoveFor({ kind: 'flick', dir: 'down', dir8: 'downleft', x: -0.7, y: 0.7 }, { speed01: 0.1, pressured: false, sprint: false, sinceMoveSec: 0.3 })!.move).toBe('momentum_btb');
  });
  it('the up-diagonals are size-ups (a cycle of package animations); L2 makes any flick a spin and a down flick a step-back; the sprint makes a side flick the escape', () => {
    expect(stickMoveFor({ kind: 'flick', dir: 'up', dir8: 'upright', x: 0.7, y: -0.7 }, { speed01: 0.1, pressured: false, sprint: false })).toEqual({ move: 'size_up', side: 'right' });
    expect(stickMoveFor({ kind: 'flick', dir: 'right', dir8: 'right', x: 1, y: 0 }, { speed01: 0.1, pressured: false, sprint: false, brace: true })).toEqual({ move: 'spin', side: 'right' });
    expect(stickMoveFor({ kind: 'flick', dir: 'down', dir8: 'down', x: -0.1, y: 1 }, { speed01: 0.1, pressured: false, sprint: false, brace: true })).toEqual({ move: 'stepback', side: 'left' });
    expect(stickMoveFor({ kind: 'flick', dir: 'left', dir8: 'left', x: -1, y: 0.05 }, { speed01: 0.1, pressured: false, sprint: true })!.move).toBe('momentum_cross');
    expect(dir8Of(0.7, -0.7)).toBe('upright'); expect(dir8Of(1, 0.2)).toBe('right'); expect(dir8Of(-0.5, 0.9)).toBe('downleft');
    expect(sizeUpClip(0, 'left')).toBe('bball_yoyo'); expect(sizeUpClip(1, 'left')).toBe('bball_in_and_out_left'); expect(sizeUpClip(5, 'right')).toBe('bball_between_legs_right');
  });
  it('a hold is nothing (a size-up), a sweep the steezo roll, a release nothing', () => {
    expect(stickMoveFor({ kind: 'hold', x: 1, y: 0 }, { speed01: 0.5, pressured: false, sprint: false })).toBeNull();
    expect(stickMoveFor({ kind: 'sweep', sign: -1 }, { speed01: 0.5, pressured: true, sprint: true })).toEqual({ move: 'steezo_roll', side: 'left' });
    expect(stickMoveFor({ kind: 'release', heldSec: 0.4 }, { speed01: 0, pressured: false, sprint: false })).toBeNull();
    expect(STICK.flick).toBeGreaterThan(STICK.hold);
  });
});
describe("pausin' (the spin dunk)", () => {
  it('the sweep with the turbo, inside range, at pace is the spin dunk; without any of those it is the roll', () => {
    expect(pausinWanted({ sprint: true, dist: 3.0, speed: 4, turbo01: 0.5 })).toBe(true);
    expect(pausinWanted({ sprint: false, dist: 3.0, speed: 4, turbo01: 0.5 })).toBe(false);
    expect(pausinWanted({ sprint: true, dist: PAUSIN.range + 0.5, speed: 4, turbo01: 0.5 })).toBe(false);
    expect(pausinWanted({ sprint: true, dist: 3.0, speed: 1, turbo01: 0.5 })).toBe(false);
    expect(pausinWanted({ sprint: true, dist: 3.0, speed: 4, turbo01: 0 })).toBe(false);
  });
});
