// IMPROVE (2026-10-06, big air items 19 / 20) — Big Air's piste: two flag materials for six flags, a tiled snow texture
// instead of one canvas stretched over 60 × 400 m, and frozen static meshes. buildSlope without the new options is the
// piste every other caller always got (one stretched canvas, nothing frozen).
// paintedGround paints a DynamicTexture, which reaches for OffscreenCanvas — a no-op 2D surface lets it build under node.
if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  const ctx2d = new Proxy({}, {
    get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 })
      : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => undefined })
      : k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
      : () => undefined),
    set: () => true,
  });
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    width: number; height: number;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext(): unknown { return ctx2d; }
  };
}
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, type PBRMaterial } from '@babylonjs/core';
import { VenueKit } from './VenueKit';

const build = (fn: (scene: Scene) => void) => {
  const scene = new Scene(new NullEngine());
  fn(scene);
  const ground = scene.getMeshByName('venue_ground')!;
  const flags = scene.meshes.filter((m) => m.name.startsWith('gate_'));
  return { scene, ground, flags, tex: (ground.material as PBRMaterial).albedoTexture! };
};

describe('VenueKit.buildBigAirSlope', () => {
  const big = build((s) => VenueKit.buildBigAirSlope(s));

  it('shares one material per flag colour (six flags, two materials)', () => {
    expect(big.flags.length).toBe(6);
    expect(new Set(big.flags.map((f) => f.material)).size).toBe(2);
  });

  it('tiles the snow: a 512² tile repeated over the piste, not one canvas stretched over it', () => {
    expect(big.tex.getSize().width).toBe(512);
    expect(big.tex.uScale).toBeCloseTo(60 / 30);
    expect(big.tex.vScale).toBeCloseTo(400 / 30);
  });

  it('freezes the static piste and flags', () => {
    expect(big.ground.isWorldMatrixFrozen).toBe(true);
    expect(big.flags.every((f) => f.isWorldMatrixFrozen)).toBe(true);
  });
});

describe('VenueKit.buildSlope with no new options (the other callers)', () => {
  const plain = build((s) => VenueKit.buildSlope(s, undefined, { walls: false }));
  it('keeps the one stretched 1024² canvas and leaves the meshes unfrozen', () => {
    expect(plain.tex.getSize().width).toBe(1024);
    expect(plain.tex.uScale).toBe(1);
    expect(plain.ground.isWorldMatrixFrozen).toBe(false);
  });
});
