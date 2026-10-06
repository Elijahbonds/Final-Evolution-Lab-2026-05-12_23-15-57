// What the "alive" layer actually puts on screen (dunk visuals pass, 2026-09-16).
//
// Both of these were found by looking at a frame, not by reading the code, and neither could have failed a test that
// did not exist: the ball trail read as a dozen loose orange ORBS in the sky, and the ambient gulls were white
// RECTANGLES over Venice beach. Particle and billboard work is exactly the kind of thing that never gets a test
// because "it's just visual" — which is why it shipped wrong.
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, ParticleSystem, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { EffectsKit, applyTrail, TRAIL_LOOK, GULL_RADIUS, GULL_Y, BURST_LOOK, BURST_POOL_PER_KIND, burstPoolSize, type TrailLevel } from './EffectsKit';
import { setParticleBudgetScale } from './ParticleBudget';

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

  // IMPROVE (2026-10-06, 3PT #16): a level change rewrites the taper and the colours IN PLACE (it removed and re-added three
  // gradients and allocated two Color4s each time) — the same objects, the new numbers, the same look as a fresh apply
  it('a level change rewrites the taper and the colours in place, to the same values a fresh trail gets', () => {
    const ball = MeshBuilder.CreateSphere('b_inplace', { diameter: 0.24 }, scene);
    const ps = EffectsKit.ballTrail(scene, ball);
    const c1 = ps.color1, c2 = ps.color2, g0 = (ps.getSizeGradients() ?? [])[0];
    for (const level of ['hang', 'flash', 'off', 'soft'] as TrailLevel[]) {
      applyTrail(ps, level, '#ffd75e');
      const fresh = EffectsKit.ballTrail(scene, MeshBuilder.CreateSphere(`b_fresh_${level}`, { diameter: 0.24 }, scene));
      for (const g of [0, 0.55, 1]) { try { fresh.removeSizeGradient(g); } catch { /* none */ } }
      applyTrail(fresh, level, '#ffd75e');
      expect(ps.color1).toBe(c1); expect(ps.color2).toBe(c2);
      expect(ps.getSizeGradients()?.[0]).toBe(g0);
      expect(ps.color1.asArray()).toEqual(fresh.color1.asArray());
      expect(ps.color2.asArray()).toEqual(fresh.color2.asArray());
      expect((ps.getSizeGradients() ?? []).map((g) => [g.gradient, g.factor1, g.factor2])).toEqual((fresh.getSizeGradients() ?? []).map((g) => [g.gradient, g.factor1, g.factor2]));
      expect(ps.emitRate).toBe(TRAIL_LOOK[level].rate);
    }
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

// IMPROVE (2026-10-06): the flock shares ONE material (it built four around one texture), and the call hands back what it
// mounted — a mode's dispose took none of it (4 planes, 4 materials, 4 per-frame observers outlived every mode).
describe('the ambient handle', () => {
  const fresh = () => { const s = new Scene(new NullEngine()); new FreeCamera('ca', new Vector3(0, 1, -3), s); return s; };

  it('the four gulls share one material', () => {
    const s = fresh();
    EffectsKit.ambient(s, 'venice');
    const gulls = s.meshes.filter((m) => m.name.startsWith('gull_'));
    expect(gulls.length).toBe(4);
    expect(new Set(gulls.map((g) => g.material)).size).toBe(1);
    expect(s.materials.filter((m) => m.name.startsWith('gull_m')).length).toBe(1);
  });

  it('dispose takes the planes, the material and the per-frame observers', () => {
    const s = fresh();
    // (Babylon defers an observer's removal to the next tick and flags it meanwhile: the live ones are the unflagged)
    const live = () => s.onBeforeRenderObservable.observers.filter((o) => !(o as unknown as { _willBeUnregistered?: boolean })._willBeUnregistered).length;
    const before = live();
    const h = EffectsKit.ambient(s, 'venice');
    expect(live()).toBe(before + 4);
    h.dispose();
    expect(s.meshes.filter((m) => m.name.startsWith('gull_')).length).toBe(0);
    expect(s.materials.filter((m) => m.name.startsWith('gull_m')).length).toBe(0);
    expect(live()).toBe(before);
    expect(() => { h.dispose(); s.render(); }).not.toThrow();   // twice is harmless, and the scene still draws
  });

  it('a particle ambient is taken down too', () => {
    const s = fresh();
    const h = EffectsKit.ambient(s, 'dojo');
    expect(s.particleSystems.some((p) => p.name === 'amb_petals')).toBe(true);
    h.dispose();
    expect(s.particleSystems.some((p) => p.name === 'amb_petals')).toBe(false);
  });
});

// IMPROVE (2026-10-06): a burst used to build (and then dispose) a whole ParticleSystem per call; a 50 in the dunk fires six
// in one frame. They come out of a small per-scene, per-kind pool now, and the caller cannot tell.
describe('the burst pool', () => {
  const fresh = () => { const s = new Scene(new NullEngine()); new FreeCamera('cb', new Vector3(0, 1, -3), s); return s; };
  const bursts = (s: Scene, kind: string) => s.particleSystems.filter((p) => p.name.startsWith(`fx_${kind}_`)) as ParticleSystem[];

  it('a burst that has finished is the one the next burst uses — no new system', () => {
    vi.useFakeTimers();
    try {
      const s = fresh();
      EffectsKit.burst(s, new Vector3(0, 1, 0), 'net');
      const first = bursts(s, 'net');
      expect(first.length).toBe(1);
      vi.advanceTimersByTime(200);                                   // its stop
      // (a NullEngine never readies the particle effect, so the frames are stepped as Babylon's own pre-warm steps them)
      for (let i = 0; i < 400 && first[0].isStarted(); i++) first[0].animate(true);
      expect(first[0].isStarted()).toBe(false);                      // every particle dead: idle
      EffectsKit.burst(s, new Vector3(2, 1, 0), 'net', 1.5, '#ff0000');
      expect(bursts(s, 'net')).toEqual(first);                       // the same system, re-aimed
      expect((first[0].emitter as Vector3).x).toBe(2);
      expect(first[0].manualEmitCount).toBe(27);                     // 18 x 1.5: the caller's size still holds
      expect(burstPoolSize(s, 'net')).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('a pile-up past the pool falls back to the old self-disposing one-off, and the pool never grows past its cap', () => {
    const s = fresh();
    for (let i = 0; i < BURST_POOL_PER_KIND + 2; i++) EffectsKit.burst(s, new Vector3(i, 1, 0), 'confetti', 2);
    const all = bursts(s, 'confetti');
    expect(all.length).toBe(BURST_POOL_PER_KIND + 2);
    expect(burstPoolSize(s, 'confetti')).toBe(BURST_POOL_PER_KIND);
    expect(all.filter((p) => p.disposeOnStop).length).toBe(2);
    for (const p of all) expect(p.manualEmitCount).toBeLessThanOrEqual(p.getCapacity());   // the biggest ask fits a pooled system
  });

  it('a pooled system disposed under the pool leaves it', () => {
    const s = fresh();
    EffectsKit.burst(s, new Vector3(0, 1, 0), 'sparks');
    expect(burstPoolSize(s, 'sparks')).toBe(1);
    bursts(s, 'sparks')[0].dispose();
    expect(burstPoolSize(s, 'sparks')).toBe(0);
  });
});

// A9.8 (visual-foundation, 2026-10-06): each burst kind reads as what it is, and every burst answers to the budget.
describe('burst looks and the particle budget', () => {
  const last = (kind: string) => {
    const list = scene.particleSystems.filter((p) => p.name.startsWith(`fx_${kind}_`));
    return list[list.length - 1] as ParticleSystem;
  };
  it('sparks and glitch are additive streaks stretched along their flight', () => {
    for (const kind of ['sparks', 'glitch'] as const) {
      EffectsKit.burst(scene, Vector3.Zero(), kind);
      const ps = last(kind);
      expect(ps.blendMode, kind).toBe(ParticleSystem.BLENDMODE_ADD);
      expect(ps.billboardMode, kind).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
      expect(ps.maxScaleY / ps.maxScaleX, kind).toBeGreaterThan(3);
    }
  });
  it('dust is a puff: it grows while it fades out', () => {
    EffectsKit.burst(scene, Vector3.Zero(), 'dust');
    const ps = last('dust');
    const g = ps.getSizeGradients() ?? [];
    expect(g[g.length - 1].factor1).toBeGreaterThan(g[0].factor1 * 2);
    const c = ps.getColorGradients() ?? [];
    expect(c[c.length - 1].color1.a).toBe(0);
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_STANDARD);
  });
  it('confetti is paper that tumbles: a strip texture and a spin', () => {
    EffectsKit.burst(scene, Vector3.Zero(), 'confetti');
    const ps = last('confetti');
    expect(ps.maxAngularSpeed).toBeGreaterThan(0);
    expect(ps.minAngularSpeed).toBeLessThan(0);
    expect(ps.particleTexture?.name).toBe('fx_quad');
  });
  it('the net flick is unchanged', () => {
    EffectsKit.burst(scene, Vector3.Zero(), 'net');
    const ps = last('net');
    expect(ps.blendMode).toBe(ParticleSystem.BLENDMODE_STANDARD);
    expect(ps.billboardMode).toBe(ParticleSystem.BILLBOARDMODE_ALL);
    expect(BURST_LOOK.net).toEqual({ additive: false, stretched: false, grow: 1, spin: 0, quad: false });
  });
  it('the streak shader is warmed at load (ambient / ball trail), once per scene, and never emits', () => {
    const s2 = new Scene(new NullEngine());
    EffectsKit.ambient(s2, 'dojo');
    EffectsKit.ballTrail(s2, MeshBuilder.CreateSphere('bb', {}, s2));
    const warm = s2.particleSystems.filter((p) => p.name === '__fx_prewarm_streak');
    expect(warm.length).toBe(1);
    expect((warm[0] as ParticleSystem).billboardMode).toBe(ParticleSystem.BILLBOARDMODE_STRETCHED);
    expect(warm[0].isStarted()).toBe(false);
  });
  it('the governor lever trims every burst; at 1 nothing changes', () => {
    EffectsKit.burst(scene, Vector3.Zero(), 'confetti');
    expect(last('confetti').manualEmitCount).toBe(60);
    setParticleBudgetScale(scene, 0.5);
    EffectsKit.burst(scene, Vector3.Zero(), 'confetti');
    expect(last('confetti').manualEmitCount).toBe(30);
    setParticleBudgetScale(scene, 1);
  });
});
