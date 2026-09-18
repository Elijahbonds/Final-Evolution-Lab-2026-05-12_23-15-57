// What the "alive" layer actually puts on screen (dunk visuals pass, 2026-09-16).
//
// Both of these were found by looking at a frame, not by reading the code, and neither could have failed a test that
// did not exist: the ball trail read as a dozen loose orange ORBS in the sky, and the ambient gulls were white
// RECTANGLES over Venice beach. Particle and billboard work is exactly the kind of thing that never gets a test
// because "it's just visual" — which is why it shipped wrong.
import { describe, expect, it, beforeAll } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { EffectsKit, applyTrail, TRAIL_LOOK, GULL_RADIUS, GULL_Y, type TrailLevel } from './EffectsKit';

// Babylon's DynamicTexture reaches for OffscreenCanvas, which node has not got, so both procedural textures in this
// kit (the particle dot and the gull) are unconstructible headlessly. The shim only lets the 2-D calls land — nothing
// asserted below depends on a pixel, only on the alpha flags, the mesh shape and where the birds fly.
class ShimCtx {
  fillStyle = ''; strokeStyle = ''; lineWidth = 0; lineCap = '';
  clearRect(): void {} fillRect(): void {} beginPath(): void {} moveTo(): void {}
  quadraticCurveTo(): void {} stroke(): void {} drawImage(): void {}
  createRadialGradient(): { addColorStop(): void } { return { addColorStop() {} }; }
  getImageData(): { data: Uint8ClampedArray } { return { data: new Uint8ClampedArray(4) }; }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  width: number; height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(): ShimCtx { return new ShimCtx(); }
};

let scene: Scene;
beforeAll(() => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 1, -3), scene);
});

describe('the ball trail', () => {
  const levels: TrailLevel[] = ['off', 'soft', 'hang', 'flash'];

  it('tapers to nothing — the thing that makes it a trail and not a pile', () => {
    for (const level of levels) {
      const ball = MeshBuilder.CreateSphere(`b_${level}`, { diameter: 0.24 }, scene);
      const ps = EffectsKit.ballTrail(scene, ball);
      applyTrail(ps, level);
      const g = ps.getSizeGradients() ?? [];
      expect(g.length).toBeGreaterThanOrEqual(2);
      expect(g[0].gradient).toBe(0);
      expect(g[g.length - 1].gradient).toBe(1);
      expect(g[g.length - 1].factor1).toBe(0);                     // it ends at nothing
      expect(g[0].factor1).toBeGreaterThan(g[1].factor1);          // and it only ever shrinks
    }
  });

  // rc-baseline, measured: the hang pushed 170/s at 0.2 m over a 0.25–0.4 s life = ~55 fat dots standing in the air at
  // the one beat where the ball barely moves. Small and brief is what reads as speed.
  it('is small and brief at every level', () => {
    for (const level of levels) {
      const look = TRAIL_LOOK[level];
      expect(look.head).toBeLessThanOrEqual(0.14);
      expect(look.life[1]).toBeLessThanOrEqual(0.25);
      expect(look.rate).toBeLessThanOrEqual(150);
    }
  });

  it('never has more than a streak in the air at once', () => {
    for (const level of levels) {
      const look = TRAIL_LOOK[level];
      expect(look.rate * look.life[1]).toBeLessThanOrEqual(25);   // the hang used to sit at ~68
    }
  });

  it('the flight is the loudest it gets, and OFF is off', () => {
    expect(TRAIL_LOOK.hang.alpha).toBeGreaterThan(TRAIL_LOOK.soft.alpha);
    expect(TRAIL_LOOK.off.rate).toBe(0);
  });

  it('switching levels rebuilds the taper instead of stacking stale gradients', () => {
    const ball = MeshBuilder.CreateSphere('b_switch', { diameter: 0.24 }, scene);
    const ps = EffectsKit.ballTrail(scene, ball);
    applyTrail(ps, 'hang');
    const hangHead = (ps.getSizeGradients() ?? [])[0].factor1;
    applyTrail(ps, 'soft');
    const g = ps.getSizeGradients() ?? [];
    expect(g.length).toBe(3);                                      // not six
    expect(g[0].factor1).toBeLessThan(hangHead);                   // the soft head, not the hang's
  });

  it('lays the path rather than spraying: particles stay where the ball was', () => {
    const ball = MeshBuilder.CreateSphere('b_power', { diameter: 0.24 }, scene);
    const ps = EffectsKit.ballTrail(scene, ball);
    expect(ps.maxEmitPower).toBe(0);
  });
});

describe('the ambient gulls', () => {
  let gulls: AbstractMesh[];
  beforeAll(() => {
    const s = new Scene(new NullEngine());
    new FreeCamera('c2', new Vector3(0, 1, -3), s);
    EffectsKit.ambient(s, 'venice');
    s.render();
    gulls = s.meshes.filter((m) => m.name.startsWith('gull_'));
  });

  it('are gull-SHAPED: a plane with no alpha is a white rectangle', () => {
    expect(gulls.length).toBe(4);
    for (const g of gulls) {
      const m = g.material as StandardMaterial;
      expect(m.diffuseTexture).toBeTruthy();
      expect(m.diffuseTexture!.hasAlpha).toBe(true);
      expect(m.useAlphaFromDiffuseTexture).toBe(true);
    }
  });

  it('fly in the BACKGROUND, not across the rim', () => {
    for (const g of gulls) {
      expect(Math.hypot(g.position.x, g.position.z + 6)).toBeGreaterThanOrEqual(GULL_RADIUS - 0.01);
      expect(g.position.y).toBeGreaterThanOrEqual(GULL_Y - 0.5);
    }
  });

  it('still flap', () => {
    for (const g of gulls) { expect(g.scaling.y).toBeGreaterThan(0.6); expect(g.scaling.y).toBeLessThan(1.3); }
  });
});
