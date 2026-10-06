// IMPROVE (2026-10-06), velocitykart #15: the mini-turbo sparks are one emitter whose rate follows the tier.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { SparkEmitter, sparkRateFor, SPARK_RATE } from './speedFx';
import { MINI_COLOR } from './MiniTurbo';

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return new Proxy({}, { get: (_t, k) => (k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) }); }
};

describe('the spark emitter', () => {
  it('rate 0 on the straight, climbing with the tier; junk tiers clamp', () => {
    expect(sparkRateFor(0)).toBe(0);
    expect(SPARK_RATE[1]).toBeLessThan(SPARK_RATE[2]);
    expect(SPARK_RATE[2]).toBeLessThan(SPARK_RATE[3]);
    expect(sparkRateFor(9)).toBe(SPARK_RATE[3]);
    expect(sparkRateFor(-2)).toBe(0);
    expect(sparkRateFor(NaN)).toBe(0);
  });

  it('is ONE particle system for the whole race, however long the slide', () => {
    const scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 2, -8), scene);
    const before = scene.particleSystems.length;
    const fx = new SparkEmitter(scene, new TransformNode('k', scene), 'kart', MINI_COLOR);
    for (let i = 0; i < 600; i++) fx.update(1 + (Math.floor(i / 100) % 3));
    fx.update(0);
    expect(scene.particleSystems.length - before).toBe(1);
    fx.dispose();
    expect(scene.particleSystems.length).toBe(before);
    scene.dispose();
  });
});
