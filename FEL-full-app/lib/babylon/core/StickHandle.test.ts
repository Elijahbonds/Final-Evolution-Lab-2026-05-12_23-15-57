import { describe, it, expect } from 'vitest';
import { StickHandleReader, stickMoveFor, STICK, pausinWanted, PAUSIN } from './StickHandle';

const play = (r: StickHandleReader, samples: [number, number, number][]) => samples.flatMap(([x, y, t]) => r.feed(x, y, t));

describe('StickHandleReader', () => {
  it('a snap from home past the flick ring is one flick, in its direction, once per excursion', () => {
    const r = new StickHandleReader();
    const g = play(r, [[0, 0, 0], [0.4, 0, 0.02], [0.9, 0, 0.05], [1, 0, 0.08], [0.95, 0, 0.11], [0.2, 0, 0.2], [0, 0, 0.25]]);
    expect(g).toEqual([{ kind: 'flick', dir: 'right', x: 0.9, y: 0 }]);
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
  it('a down flick at speed is the momentum behind-the-back; slow it is the hesi', () => {
    expect(stickMoveFor({ kind: 'flick', dir: 'down', x: 0.2, y: 1 }, { speed01: 0.7, pressured: true, sprint: true })!.move).toBe('momentum_btb');
    expect(stickMoveFor({ kind: 'flick', dir: 'down', x: 0, y: 1 }, { speed01: 0.1, pressured: true, sprint: false })!.move).toBe('hesi');
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
