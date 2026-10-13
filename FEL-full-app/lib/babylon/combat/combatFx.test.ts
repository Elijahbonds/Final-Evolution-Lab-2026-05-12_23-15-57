// The fight's hit language (lane/vis-combat, 2026-10-13): the tables first, then the mount on a NullEngine scene.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { HIT_KINDS, HIT_LOOK, TIER_SCALE, auraLook, mountCombatFx, planHit, type HitKind } from './combatFx';
import { installOffscreenShim } from './canvasShim.test-helper';

installOffscreenShim();

describe('the hit table', () => {
  it('a bigger blow is a bigger flash and more sparks: light < medium < heavy < special', () => {
    const order: HitKind[] = ['light', 'medium', 'heavy', 'special'];
    for (let i = 1; i < order.length; i++) {
      expect(HIT_LOOK[order[i]].star, order[i]).toBeGreaterThan(HIT_LOOK[order[i - 1]].star);
      expect(HIT_LOOK[order[i]].streaks, order[i]).toBeGreaterThan(HIT_LOOK[order[i - 1]].streaks);
      expect(HIT_LOOK[order[i]].speed, order[i]).toBeGreaterThan(HIT_LOOK[order[i - 1]].speed);
    }
  });
  it('a parry is a ring (the loudest read in a defence) and a guard is the smallest chip', () => {
    expect(HIT_LOOK.parry.ring).toBeGreaterThan(HIT_LOOK.heavy.ring);
    expect(HIT_LOOK.guard.star).toBeLessThan(HIT_LOOK.light.star);
    expect(HIT_LOOK.guard.streaks).toBeLessThan(HIT_LOOK.light.streaks);
  });
  it('the defence reads are cool and the offence reads are warm (colour carries the meaning before shape does)', () => {
    const blueish = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (n & 255) > ((n >> 16) & 255); };
    for (const k of ['parry', 'guard', 'break'] as const) expect(blueish(HIT_LOOK[k].colors[1]), k).toBe(true);
    for (const k of ['light', 'medium', 'heavy'] as const) expect(blueish(HIT_LOOK[k].colors[1]), k).toBe(false);
  });
  it('every kind has a finite look', () => {
    for (const k of HIT_KINDS) { const L = HIT_LOOK[k]; expect(Object.values(L).flat().every((v) => typeof v !== 'number' || Number.isFinite(v)), k).toBe(true); expect(L.life).toBeLessThan(0.5); }
  });
  it('a phone gets about half the sparks but always the star, and never fewer than four sparks', () => {
    for (const k of HIT_KINDS) {
      const d = planHit(k, 'desktop'), m = planHit(k, 'mobile');
      expect(m.star).toBe(true); expect(m.streaks).toBeGreaterThanOrEqual(4); expect(m.streaks).toBeLessThanOrEqual(d.streaks);
    }
    expect(TIER_SCALE.mobile).toBeLessThan(TIER_SCALE.desktop);
    expect(planHit('heavy', 'high').streaks).toBeGreaterThan(planHit('heavy', 'desktop').streaks);
  });
  it('only the blows that earn it get a ring', () => {
    expect(planHit('light', 'desktop').ring).toBe(false); expect(planHit('medium', 'desktop').ring).toBe(false);
    for (const k of ['heavy', 'special', 'parry', 'break'] as const) expect(planHit(k, 'desktop').ring, k).toBe(true);
  });
});

describe('the aura table', () => {
  it('is off below a hair of meter and swells with it', () => {
    expect(auraLook(0, 'desktop').on).toBe(false); expect(auraLook(0.02, 'desktop').on).toBe(false);
    const lo = auraLook(0.3, 'desktop'), hi = auraLook(1, 'desktop');
    for (const k of ['height', 'radius', 'alpha', 'motes', 'pool'] as const) expect(hi[k], k).toBeGreaterThan(lo[k]);
    expect(hi.alpha).toBeLessThan(0.8);   // a veil, not a wall of light
  });
  it('is safe on junk and clamps over 1; a phone has fewer motes', () => {
    expect(auraLook(NaN, 'desktop').on).toBe(false);
    expect(auraLook(9, 'desktop')).toEqual(auraLook(1, 'desktop'));
    expect(auraLook(1, 'mobile').motes).toBeLessThan(auraLook(1, 'desktop').motes);
  });
});

describe('the mount', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 2, -6), scene); });

  it('builds its pools up front, and a hit emits into them', () => {
    const n0 = scene.particleSystems.length, fx = mountCombatFx(scene);
    expect(scene.particleSystems.length - n0).toBeGreaterThanOrEqual(16);
    const stars = scene.particleSystems.filter((p) => p.name.startsWith('cfx_star_')), streaks = scene.particleSystems.filter((p) => p.name.startsWith('cfx_streak_'));
    fx.hit(new Vector3(0, 1.2, 0), { x: 0, z: 2 }, 'heavy');
    expect(stars.some((s) => s.manualEmitCount === 1)).toBe(true);
    const k = streaks.find((s) => s.manualEmitCount > 0)!;
    expect(k.manualEmitCount).toBeGreaterThanOrEqual(HIT_LOOK.heavy.streaks / 2);
    // the sparks fly AWAY from the attacker (attacker at +z, so the blow travels toward −z)
    expect(k.direction1.z + k.direction2.z).toBeLessThan(0);
    fx.dispose();
  });

  // Babylon's size gradient is ABSOLUTE metres (minSize / maxSize are ignored once one exists): the gradients here are shapes in 0..1 and
  // the metres live in the scale. A gradient with metres in it made a spark a metre long on first sight.
  it('sizes are carried by the scale, and every size gradient is a 0..1 curve', () => {
    const fx = mountCombatFx(scene);
    for (const ps of scene.particleSystems.filter((p) => p.name.startsWith('cfx_'))) {
      for (const g of ps.getSizeGradients() ?? []) expect(g.factor1, `${ps.name} gradient ${g.gradient}`).toBeLessThanOrEqual(1.7);
    }
    fx.hit(new Vector3(0, 1, 0), { x: 0, z: 1 }, 'special');
    const star = scene.particleSystems.filter((p) => p.name.startsWith('cfx_star_')).find((p) => p.manualEmitCount === 1)!;
    expect(star.maxScaleX).toBeCloseTo(HIT_LOOK.special.star, 5); expect(star.maxScaleY).toBeCloseTo(HIT_LOOK.special.star, 5);
    const k = scene.particleSystems.filter((p) => p.name.startsWith('cfx_streak_')).find((p) => p.manualEmitCount > 0)!;
    expect(k.maxScaleY).toBeGreaterThan(0.2); expect(k.maxScaleY).toBeLessThan(1);     // a streak is a fraction of a metre long
    expect(k.maxScaleX).toBeLessThan(0.15);                                            // and thin
    fx.dispose();
  });

  it('a parry draws a ring and a plain jab does not', () => {
    const fx = mountCombatFx(scene);
    const rings = scene.particleSystems.filter((p) => p.name.startsWith('cfx_ringp_'));
    fx.hit(new Vector3(0, 1, 0), null, 'light');
    expect(rings.some((r) => r.manualEmitCount > 0)).toBe(false);
    fx.hit(new Vector3(0, 1, 0), null, 'parry');
    expect(rings.some((r) => r.manualEmitCount > 0)).toBe(true);
    fx.dispose();
  });

  it('a tint recolours the body of the spark and leaves the hot core', () => {
    const fx = mountCombatFx(scene);
    fx.hit(new Vector3(0, 1, 0), null, 'special', '#00ff88');
    const s = scene.particleSystems.filter((p) => p.name.startsWith('cfx_star_')).find((p) => p.manualEmitCount === 1)!;
    expect(s.color2.g).toBeCloseTo(1, 5); expect(s.color2.r).toBeCloseTo(0, 5);
    expect(s.color1.r).toBeCloseTo(1, 5);
    fx.dispose();
  });

  it('a slam enables a shockwave and a crack, then they fade and switch off', () => {
    const fx = mountCombatFx(scene);
    fx.slam(new Vector3(2, 0, 1), 1.2);
    const ring = scene.meshes.find((m) => m.name.startsWith('cfx_groundring_') && m.isEnabled())!;
    const crack = scene.meshes.find((m) => m.name.startsWith('cfx_crack_') && m.isEnabled())!;
    expect(ring).toBeTruthy(); expect(crack).toBeTruthy();
    expect(ring.position.x).toBeCloseTo(2, 5);
    for (let i = 0; i < 60; i++) fx.tick(1 / 60);       // 1 s: the shockwave (0.5 s) is gone, the crack (6 s) is not
    expect(ring.isEnabled()).toBe(false); expect(crack.isEnabled()).toBe(true);
    for (let i = 0; i < 60 * 6; i++) fx.tick(1 / 60);
    expect(crack.isEnabled()).toBe(false);
    fx.dispose();
  });

  it('FX meshes never cast a shadow and are not pickable', () => {
    const fx = mountCombatFx(scene);
    for (const m of scene.meshes.filter((x) => x.name.startsWith('cfx_'))) { expect(m.receiveShadows, m.name).toBe(false); expect(m.isPickable, m.name).toBe(false); }
    fx.dispose();
  });

  it('the two auras the modes use are built at mount (warm), docked and dark; one a mode never uses is built on demand', () => {
    const fx = mountCombatFx(scene), root = new TransformNode('fighter', scene);
    const me = scene.meshes.find((m) => m.name === 'cfx_aura_me')!;
    expect(me).toBeTruthy(); expect(me.isEnabled()).toBe(false); expect(me.parent).not.toBe(root);
    fx.aura('spare', root, 0, '#ffd36b');
    expect(scene.meshes.some((m) => m.name === 'cfx_aura_spare')).toBe(false);     // nothing built for a zero meter
    fx.aura('spare', root, 0.5, '#ffd36b');
    expect(scene.meshes.some((m) => m.name === 'cfx_aura_spare')).toBe(true);
    fx.dispose();
  });

  it('an aura swells on tick, parents to the fighter and goes dark when told', () => {
    const fx = mountCombatFx(scene), root = new TransformNode('fighter', scene);
    fx.aura('me', root, 0.8, '#ffd36b');
    const col = scene.meshes.find((m) => m.name === 'cfx_aura_me')!;
    expect(col.parent).toBe(root);
    for (let i = 0; i < 30; i++) fx.tick(1 / 60);
    expect(col.isEnabled()).toBe(true);
    const h1 = col.scaling.y;
    fx.aura('me', root, 1, '#ffd36b');
    for (let i = 0; i < 60; i++) fx.tick(1 / 60);
    expect(col.scaling.y).toBeGreaterThan(h1);
    fx.clearAuras();
    for (let i = 0; i < 240; i++) fx.tick(1 / 60);
    expect(col.isEnabled()).toBe(false);
    fx.dispose();
  });

  it('a particle budget that is full trims a burst but never below a readable few', () => {
    const fx = mountCombatFx(scene);
    scene.metadata = { felTier: 'mobile', felParticleScale: 0.2 };
    fx.hit(new Vector3(0, 1, 0), null, 'special');
    const k = scene.particleSystems.filter((p) => p.name.startsWith('cfx_streak_')).find((p) => p.manualEmitCount > 0)!;
    expect(k.manualEmitCount).toBeGreaterThanOrEqual(4);
    scene.metadata = {};
    fx.dispose();
  });

  it('debris throws chunks from where a thing broke, and a tint recolours them', () => {
    const fx = mountCombatFx(scene);
    fx.debris(new Vector3(1, 1.3, -5), 1.6, '#00aaff');
    const d = scene.particleSystems.filter((p) => p.name.startsWith('cfx_chunk_')).find((p) => p.manualEmitCount > 0)!;
    expect(d.manualEmitCount).toBeGreaterThan(10);
    expect((d.emitter as Vector3).z).toBeCloseTo(-5, 5);
    expect(d.color1.b).toBeCloseTo(1, 5);
    fx.dispose();
  });

  it('blink lays ghosts along the path and puffs at both ends; dispose takes everything', () => {
    const before = scene.meshes.length, sysBefore = scene.particleSystems.length;
    const fx = mountCombatFx(scene);
    fx.blink(new Vector3(0, 0, 0), new Vector3(4, 0, 0));
    const ghost = scene.particleSystems.find((p) => p.name === 'cfx_ghost')!;
    expect(ghost.manualEmitCount).toBeGreaterThanOrEqual(4);
    expect(scene.particleSystems.filter((p) => p.name.startsWith('cfx_smoke_')).some((p) => p.manualEmitCount > 0)).toBe(true);
    MeshBuilder.CreateBox('keep', {}, scene);
    fx.dispose();
    expect(scene.meshes.length).toBe(before + 1);
    expect(scene.particleSystems.length).toBe(sysBefore);
  });
});
