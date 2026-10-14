// The crowd's opt-in: it HEARS the Game-Breaker meter (reports and the rise to ON FIRE) and the end of the match, and it never
// talks back to it. NullEngine, phone tier (cards only: no crowd GLB is loaded on a phone).
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { MomentumBus, type MomentumEvent } from '../../core/MomentumBus';
import type { ModePhase } from '../../core/ModeHarness';
import { EVENT_WEIGHT, mountModeCrowd, reactionFor, reactionForTier } from './modeCrowd';

const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class { width = 1; height = 1; getContext() { return ctx2d; } };

describe('what a reported play does to the stands', () => {
  it('the crowd\'s weight table is the meter\'s own (measured through the bus, so the two cannot drift)', () => {
    for (const kind of Object.keys(EVENT_WEIGHT) as MomentumEvent['kind'][]) {
      const bus = new MomentumBus();
      bus.report({ kind: 'clean_hit', weight: 50 });
      const before = bus.score01;
      bus.report({ kind });
      expect(Math.round((bus.score01 - before) * 100), kind).toBe(EVENT_WEIGHT[kind]);
    }
  });
  it('a make is a cheer sized by its weight, a miss a groan, a nudge nothing', () => {
    expect(reactionFor({ kind: 'posterize' })).toEqual({ kind: 'cheer', strength: 1 });
    expect(reactionFor({ kind: 'big_make' })).toEqual({ kind: 'cheer', strength: 0.4 });
    expect(reactionFor({ kind: 'turnover' })!.kind).toBe('groan');
    expect(reactionFor({ kind: 'miss' })!.kind).toBe('groan');
    expect(reactionFor({ kind: 'clean_hit', weight: 3 })).toBeNull();
    expect(reactionFor({ kind: 'blunder', weight: -2 })).toBeNull();
  });
  it('only the rise to ON FIRE stands them up', () => {
    expect(reactionForTier('on_fire', 'hot')!.kind).toBe('stand');
    expect(reactionForTier('hot', 'warming')).toBeNull();
    expect(reactionForTier('cold', 'on_fire')).toBeNull();
  });
});

describe('mountModeCrowd on a scene', () => {
  const rig = () => {
    const engine = new NullEngine();
    engine.getDeltaTime = () => 1000 / 60;   // a steady 60 fps clock (the null engine's own is the wall clock between renders)
    const scene = new Scene(engine);
    new FreeCamera('c', new Vector3(0, 4, -18), scene);
    (scene.metadata ??= {}).felTier = 'mobile';
    const momentum = new MomentumBus();
    let phase: ModePhase = 'playing';
    const ctx = { scene, momentum, phase: () => phase };
    return { engine, scene, momentum, ctx, end: () => { phase = 'ended'; } };
  };

  it('hears reports and the end of the match, and never reports anything itself', async () => {
    const { scene, momentum, ctx, end } = rig();
    const crowd = mountModeCrowd(ctx, 'football', { deferFrames: 0 })!;
    expect(crowd).not.toBeNull();
    expect(crowd.fans).toBe(0);                 // a phone: cards only
    expect(crowd.cards).toBeGreaterThan(40);
    await crowd.ready;
    const reacts: string[] = [];
    const real = crowd.react.bind(crowd);
    crowd.react = (k, s) => { reacts.push(k); real(k, s); };
    const scoreBefore = momentum.score01;
    momentum.report({ kind: 'posterize' });
    momentum.report({ kind: 'turnover' });
    expect(reacts).toEqual(['cheer', 'groan']);
    for (let i = 0; i < 4; i++) momentum.report({ kind: 'contest_50' });   // into ON FIRE
    expect(reacts).toContain('stand');
    expect(momentum.score01).toBeGreaterThan(scoreBefore);   // the meter moved only by the mode's own reports
    end();
    scene.render();
    expect(reacts.at(-1)).toBe('finish');
    crowd.dispose();
    momentum.report({ kind: 'posterize' });
    expect(reacts.at(-1)).toBe('finish');      // unsubscribed
    expect(crowd.meshes().every((m) => m.isDisposed())).toBe(true);
    scene.dispose();
  });

  it('a phone crowd idles in a handful of draws and moves cards between pose meshes as it cheers', async () => {
    const { scene, ctx } = rig();
    const crowd = mountModeCrowd(ctx, 'football', { deferFrames: 0 })!;
    await crowd.ready;
    scene.render();
    const on = () => crowd.meshes().filter((m) => m.isEnabled() && /^crowd_card_/.test(m.name)).length;
    const idle = on();
    expect(idle).toBeGreaterThan(0);
    expect(idle).toBeLessThanOrEqual(4);       // one seated picture per painted person
    crowd.react('finish', 1);
    for (let i = 0; i < 120; i++) scene.render();
    expect(crowd.director.clipOf(0)).toBe('stand_cheer');
    expect(on()).toBeGreaterThan(0);
    crowd.dispose();
    scene.dispose();
  });
});

describe('the crowd waits for play', () => {
  it('builds nothing until the scene has drawn its first frames after the mode\'s load', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('c', new Vector3(0, 4, -18), scene);
    (scene.metadata ??= {}).felTier = 'mobile';
    const crowd = mountModeCrowd({ scene, momentum: new MomentumBus(), phase: () => 'playing' as ModePhase }, 'football')!;
    await Promise.resolve();
    expect(crowd.meshes()).toHaveLength(0);
    for (let i = 0; i < 25; i++) scene.render();
    await crowd.ready;
    expect(crowd.meshes().length).toBeGreaterThan(0);
    crowd.dispose(); scene.dispose();
  });
});
