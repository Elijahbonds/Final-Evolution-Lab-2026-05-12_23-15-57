import { describe, expect, it } from 'vitest';
import {
  StringBook, StrikeQueue, QUEUE_SEC, STRIKE_TIMING, canCancel, resolveMove, MOVES, STRING_WINDOW_SEC,
  pickTarget, stickDirTo, lungeFor, crowdStun, pathHits, pickGrab, THROW,
} from './HordeDynamics';
import { CombatAnimTree, type CombatAnimInput } from '../anim/combatTree';

describe('HordeDynamics — cancel + queue', () => {
  it('every hit beat lands before its cancel point (a cancel can never drop a hit)', () => {
    for (const t of Object.values(STRIKE_TIMING)) expect(t.hitAt).toBeLessThan(t.cancelAt);
    for (const t of Object.values(STRIKE_TIMING)) expect(t.cancelAt).toBeLessThan(QUEUE_SEC);
  });
  it('a press before the cancel point waits; a stale one expires', () => {
    const q = new StrikeQueue();
    expect(canCancel('light', 0, 0.1)).toBe(false);
    q.push('A', 'n', 0.1);
    expect(q.take(0.3)).toEqual({ btn: 'A', dir: 'n' });
    expect(q.take(0.3)).toBeNull();
    q.push('B', 'n', 0);
    expect(q.take(QUEUE_SEC + 0.01)).toBeNull();
    expect(canCancel('light', 0, STRIKE_TIMING.light.cancelAt)).toBe(true);
  });
});

describe('HordeDynamics — the string book', () => {
  it('jab-only is gone: six named strings resolve, and an ender resets the string', () => {
    const b = new StringBook();
    expect([b.press('A', 'n', 0).id, b.press('A', 'n', 0.3).id, b.press('A', 'n', 0.6).id]).toEqual(['jab', 'cross', 'uppercut']);
    expect(b.history.length).toBe(0);
    expect([b.press('A', 'n', 1).id, b.press('A', 'n', 1.3).id, b.press('B', 'n', 1.6).id]).toEqual(['jab', 'cross', 'whirl']);
    expect([b.press('A', 'n', 3).id, b.press('B', 'n', 3.3).id, b.press('Y', 'n', 3.6).id]).toEqual(['jab', 'kick', 'hammer']);
    expect([b.press('B', 'n', 5).id, b.press('B', 'n', 5.3).id, b.press('Y', 'n', 5.6).id]).toEqual(['kick', 'roundhouse', 'typhoon']);
  });
  it('the window breaks a string', () => {
    const b = new StringBook();
    b.press('A', 'n', 0); b.press('A', 'n', 0.3);
    expect(b.press('A', 'n', 0.3 + STRING_WINDOW_SEC + 0.01).id).toBe('jab');
  });
  it('stick variants open strings only', () => {
    expect(resolveMove(['Y'], 'f').id).toBe('rush');
    expect(resolveMove(['B'], 'b').id).toBe('backSpin');
    expect(resolveMove(['A', 'B'], 'b').id).toBe('kick');
  });
  it('every ender is a crowd move (stuns a radius) and every clip rate is faster than authored', () => {
    for (const m of Object.values(MOVES)) {
      if (m.ender) expect(m.stunRadius).toBeGreaterThanOrEqual(2.4);
      expect(m.speed).toBeGreaterThan(1);
    }
  });
});

describe('HordeDynamics — redirect', () => {
  const hero = { x: 0, z: 0 };
  const bodies = [{ x: 0, z: 1.2 }, { x: 0, z: -2.5 }, { x: 3, z: 0, threat: true }];
  it('no stick: a wound-up threat in range beats a nearer idle body', () => {
    expect(pickTarget(hero, null, [{ x: 0, z: 1 }, { x: 0, z: -2, threat: true }])).toBe(1);
    expect(pickTarget(hero, null, bodies)).toBe(0);   // the threat at 3 m is outside threatRange
  });
  it('the stick picks inside its cone — pulling back turns the string onto the body behind', () => {
    expect(pickTarget(hero, { x: 0, z: -1 }, bodies)).toBe(1);
    expect(pickTarget(hero, { x: 1, z: 0 }, bodies)).toBe(2);
    expect(pickTarget(hero, { x: -1, z: 0 }, bodies)).toBe(-1);
  });
  it('stick direction reads against a line', () => {
    expect(stickDirTo({ x: 0, z: 1 }, 0)).toBe('f');
    expect(stickDirTo({ x: 0, z: -1 }, 0)).toBe('b');
    expect(stickDirTo({ x: 1, z: 0 }, 0)).toBe('n');
    expect(stickDirTo(null, 0)).toBe('n');
  });
  it('the lunge closes to 70 % of reach and never beyond the move', () => {
    expect(lungeFor(1, MOVES.jab)).toBe(0);
    expect(lungeFor(2.2, MOVES.jab)).toBeCloseTo(2.2 - 1.55 * 0.7, 5);
    expect(lungeFor(9, MOVES.rush)).toBe(MOVES.rush.lunge);
  });
});

describe('HordeDynamics — crowd stun + body throw', () => {
  it('stuns everyone in radius with falloff and an outward shove', () => {
    const h = crowdStun({ x: 0, z: 0 }, [{ x: 1, z: 0 }, { x: 0, z: 2.9 }, { x: 5, z: 0 }], 3, 1);
    expect(h.map((x) => x.index)).toEqual([0, 1]);
    expect(h[0].sec).toBeGreaterThan(h[1].sec);
    expect(h[0].dx).toBeCloseTo(1); expect(h[1].dz).toBeCloseTo(1);
    expect(crowdStun({ x: 0, z: 0 }, [{ x: 0, z: 0.5 }], 0, 1)).toEqual([]);
  });
  it('a thrown body hits what its path passes', () => {
    const hits = pathHits({ x: 0, z: 0 }, { x: 0, z: 7 }, [{ x: 0.5, z: 3 }, { x: 2, z: 3 }, { x: 0, z: 8 }], THROW.throwHitM);
    expect(hits).toEqual([0, 2]);
    expect(pathHits({ x: 0, z: 0 }, { x: 0, z: 7 }, [{ x: 0.5, z: 3 }], 1, new Set([0]))).toEqual([]);
  });
  it('grabs only a staggered body in reach (any side — the hero turns onto it), the nearest first', () => {
    const hero = { x: 0, z: 0, yaw: 0 };
    expect(pickGrab(hero, [{ x: 0, z: 1, grabbable: false }, { x: 0.2, z: 1.2, grabbable: true }])).toBe(1);
    expect(pickGrab(hero, [{ x: 0, z: -1.2, grabbable: true }, { x: 0, z: 2, grabbable: true }])).toBe(0);
    expect(pickGrab(hero, [{ x: 0, z: 2.5, grabbable: true }])).toBe(-1);
  });
});

describe('CombatAnimTree — strikeSeq / strikeSpeed (additive)', () => {
  const base: CombatAnimInput = { speed01: 0, dashing: false, hasWeapon: false, striking: null, blocking: false, parryFlash: false, guardImpactFlash: false, hitBy: null, down: false, out: false, ulting: false };
  const fake = () => { const plays: { clip: string; opts: Record<string, unknown> }[] = []; return { plays, animator: { play: (clip: string, opts: Record<string, unknown>) => { plays.push({ clip, opts }); return null; }, setPlaybackScale: () => {} } }; };
  it('a new seq on the same strike weight replays with restart; the rate reaches the clip', () => {
    const f = fake(); const t = new CombatAnimTree(f.animator as never);
    t.update({ ...base, striking: 'light', strikeClip: 'jab', strikeSpeed: 1.45, strikeSeq: 1 });
    t.update({ ...base, striking: 'light', strikeClip: 'jab', strikeSpeed: 1.45, strikeSeq: 1 });
    expect(f.plays.length).toBe(1);
    expect(f.plays[0].opts.speedRatio).toBe(1.45);
    t.update({ ...base, striking: 'light', strikeClip: 'hook', strikeSpeed: 1.5, strikeSeq: 2 });
    expect(f.plays.length).toBe(2);
    expect(f.plays[1]).toMatchObject({ clip: 'hook', opts: { restart: true, speedRatio: 1.5 } });
  });
  it('without the new fields a strike still plays once (every other combat mode unchanged)', () => {
    const f = fake(); const t = new CombatAnimTree(f.animator as never);
    t.update({ ...base, striking: 'light', strikeClip: 'jab' });
    t.update({ ...base, striking: 'light', strikeClip: 'hook' });
    expect(f.plays.length).toBe(1);
    expect(f.plays[0].opts.restart).toBeUndefined();
    expect(f.plays[0].opts.speedRatio).toBeUndefined();
  });
});
