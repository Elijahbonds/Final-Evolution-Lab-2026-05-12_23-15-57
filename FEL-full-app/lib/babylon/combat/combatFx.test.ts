// The fight's hit language (lane/vis-combat, 2026-10-13): the tables first, then the mount on a NullEngine scene.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { HIT_KINDS, HIT_LOOK, TIER_SCALE, auraLook, mountCombatFx, planHit, type HitKind } from './combatFx';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';
import { EffectsKit } from '../visual/EffectsKit';
import { PARTICLE_BUDGET, committedParticles, particleBudget } from '../visual/ParticleBudget';

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

// lane/kvs-skin (2026-10-16): Karate VS read 18-26 live on a phone against a row of 5. A ceiling of 5, ONE petal and no aura motes; the hit keeps
// its readable minimum (a star, two or more streaks, a ring where its kind has one) and is trimmed to the room that is left.
describe('a hit under Karate VS\'s phone ceiling', () => {
  const mk = (md: Record<string, unknown>) => { const sc = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 2, -6), sc); sc.metadata = md; return sc; };
  const sum = (sc: Scene, prefix: string) => sc.particleSystems.filter((p) => p.name.startsWith(prefix)).reduce((n, p) => n + Math.max(0, p.manualEmitCount), 0);
  const PHONE = { felTier: 'mobile', felModeId: 'karate-vs' };

  it('one hit of ANY kind, beside the one petal, stays inside the budget and keeps its star, its streaks and its ring', () => {
    for (const kind of HIT_KINDS) {
      const sc = mk(PHONE);
      const amb = EffectsKit.ambient(sc, 'dojo');
      const petals = sc.particleSystems.find((p) => p.name === 'amb_petals')!;
      expect(petals.getCapacity(), 'one petal').toBe(1);
      // the petal is in the air nearly all the time (6-10 s of life, a new one within 0.2 s), and a live particle is what the room is measured against;
      // a NullEngine does not step particles, so the system's one live particle is stood in for here (its capacity, asserted above, is what bounds it)
      const live = vi.spyOn(petals, 'getActiveCount').mockReturnValue(1);
      const fx = mountCombatFx(sc);
      fx.hit(new Vector3(0, 1.2, 0), { x: 0, z: 2 }, kind);
      const star = sum(sc, 'cfx_star_'), streaks = sum(sc, 'cfx_streak_'), ring = sum(sc, 'cfx_ringp_');
      expect(star, `${kind} star`).toBe(1);
      expect(streaks, `${kind} streaks`).toBeGreaterThanOrEqual(2);          // the direction still reads
      expect(ring > 0, `${kind} ring`).toBe(planHit(kind, 'mobile').ring);   // a parry / heavy / special / break is still answered by its ring
      expect(committedParticles(sc), kind).toBeLessThanOrEqual(particleBudget(sc as never));   // the petal in the air, the star, the streaks, the ring: 5 at most
      live.mockRestore(); fx.dispose(); amb.dispose(); sc.dispose();
    }
  });

  it('the chi aura has no motes (the column, its light and the lit edge stay), however full the meter', () => {
    const sc = mk(PHONE), fx = mountCombatFx(sc), root = new TransformNode('fighter', sc);
    fx.aura('me', root, 1, '#ffd36b'); fx.aura('foe', root, 1, '#ff4d5e');
    for (let i = 0; i < 120; i++) fx.tick(1 / 60);
    const motes = sc.particleSystems.filter((p) => p.name.startsWith('cfx_aura_motes_'));
    expect(motes.length).toBe(2);
    for (const m of motes) { expect(m.emitRate, m.name).toBe(0); expect(m.getCapacity(), m.name).toBe(1); }   // (never fed: a motes system emits at L.motes x 3 a second once an aura is up)
    expect(sc.meshes.find((m) => m.name === 'cfx_aura_me')!.isEnabled()).toBe(true);   // the column itself is up
    fx.dispose(); sc.dispose();
  });

  it('the hit streaks are the same size on desktop and on another phone mode as before (CONTROL: nothing else moved)', () => {
    for (const [md, tier] of [[{ felTier: 'desktop', felModeId: 'karate-vs' }, 'desktop'], [{ felTier: 'mobile', felModeId: 'onevone' }, 'mobile'], [{ felTier: 'high', felModeId: 'karate-vs' }, 'high']] as const) {
      const sc = mk(md), fx = mountCombatFx(sc);
      fx.hit(new Vector3(0, 1.2, 0), { x: 0, z: 2 }, 'heavy');
      expect(sum(sc, 'cfx_streak_'), tier).toBe(planHit('heavy', tier).streaks);
      const root = new TransformNode('fighter', sc);
      fx.aura('me', root, 1, '#ffd36b');
      for (let i = 0; i < 30; i++) fx.tick(1 / 60);
      expect(sc.particleSystems.find((p) => p.name === 'cfx_aura_motes_me')!.emitRate, `${tier} motes`).toBeGreaterThan(0);
      expect(sc.particleSystems.find((p) => p.name === 'cfx_aura_motes_me')!.getCapacity(), `${tier} motes cap`).toBe(40);
      fx.dispose(); sc.dispose();
    }
    expect(PARTICLE_BUDGET.mobile).toBeGreaterThan(5);
  });

  // lane/kvs-combo changed this case (owner 2026-10-16, "Second hit drops streaks"): it held that the second hit kept a star and two streaks (+3,
  // so a pair reached 8-9 against the 5). Now the second hit keeps its star only (a light has no ring), and the first hit's streaks give way for it.
  it('a second hit in the same frame shows its star, gives up its streaks, and the first hit\'s streaks make the room for it', () => {
    const sc = mk(PHONE), fx = mountCombatFx(sc);
    fx.hit(new Vector3(0, 1.2, 0), { x: 0, z: 2 }, 'light');
    expect(committedParticles(sc)).toBe(5);           // the first fills the room: a star and four streaks
    fx.hit(new Vector3(1, 1.2, 0), { x: 0, z: 2 }, 'light');
    expect(sum(sc, 'cfx_star_')).toBe(2);              // both blows flash
    expect(sum(sc, 'cfx_streak_')).toBe(0);            // the second gave up its streaks; the first's gave way to its star
    expect(committedParticles(sc)).toBeLessThanOrEqual(5);
    fx.dispose(); sc.dispose();
  });

  it('a blink keeps two afterimages and the puff where the body lands, and not the second puff', () => {
    const sc = mk(PHONE), fx = mountCombatFx(sc);
    fx.blink(new Vector3(0, 0, 0), new Vector3(4, 0, 0));
    expect(sc.particleSystems.find((p) => p.name === 'cfx_ghost')!.manualEmitCount).toBe(2);
    expect(sc.particleSystems.filter((p) => p.name.startsWith('cfx_smoke_')).filter((p) => p.manualEmitCount > 0).length).toBe(1);
    fx.dispose(); sc.dispose();
    const sd = mk({ felTier: 'mobile', felModeId: 'showdown' }), fd = mountCombatFx(sd);   // CONTROL: another phone mode keeps four afterimages and both puffs
    fd.blink(new Vector3(0, 0, 0), new Vector3(4, 0, 0));
    expect(sd.particleSystems.find((p) => p.name === 'cfx_ghost')!.manualEmitCount).toBe(4);
    expect(sd.particleSystems.filter((p) => p.name.startsWith('cfx_smoke_')).filter((p) => p.manualEmitCount > 0).length).toBe(2);
    fd.dispose(); sd.dispose();
  });
});

// lane/kvs-combo (owner 2026-10-16, "Second hit drops streaks"): one hit fills Karate VS's 5, so two hits whose lives overlapped peaked at 9 and
// three at 13. A hit landing while an earlier hit's burst is live keeps its CORE (its star, and its ring when its kind has one and room is left)
// and gives up its streaks; the earlier hits' streaks give way for that core, oldest first, and only then (a fourth blow) the oldest earlier
// ring, then star. These run the particle clock for real: `animate(true)` steps a system 0.01 s of particle age on a NullEngine (the plain
// `animate()` waits for a GPU-ready texture that a NullEngine never has), so a burst flies, ages and dies here as it does on the phone.
describe('two and three hits overlapping under Karate VS\'s phone ceiling', () => {
  const mk = (md: Record<string, unknown>) => { const sc = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 2, -6), sc); sc.metadata = md; return sc; };
  const PHONE = { felTier: 'mobile', felModeId: 'karate-vs' };
  const step = (sc: Scene, n = 1) => { for (let i = 0; i < n; i++) for (const p of sc.particleSystems) (p as unknown as { animate(w: boolean): void }).animate(true); };
  const live = (sc: Scene) => sc.particleSystems.reduce((n, p) => n + p.getActiveCount(), 0);
  const queued = (sc: Scene, prefix: string) => sc.particleSystems.filter((p) => p.name.startsWith(prefix)).reduce((n, p) => n + Math.max(0, p.manualEmitCount), 0);
  const heldBy = (sc: Scene, name: string) => { const p = sc.particleSystems.find((q) => q.name === name)!; return p.getActiveCount() + Math.max(0, p.manualEmitCount); };
  const AT = new Vector3(0, 1.2, 0), FROM = { x: 0, z: 2 };
  /** A dojo phone scene with its one petal already in the air (the petal is what the room is measured beside, as on the rig). */
  const dojo = (md: Record<string, unknown> = PHONE) => {
    const sc = mk(md), amb = EffectsKit.ambient(sc, 'dojo'), fx = mountCombatFx(sc);
    for (let i = 0; i < 400 && sc.particleSystems.find((p) => p.name === 'amb_petals')!.getActiveCount() < 1; i++) step(sc);
    expect(sc.particleSystems.find((p) => p.name === 'amb_petals')!.getActiveCount(), 'the petal is up').toBeGreaterThanOrEqual(1);
    return { sc, fx, done: () => { fx.dispose(); amb.dispose(); sc.dispose(); } };
  };
  /** Fires `hits` (kind, at step) and runs the clock until all of it has died; returns the worst live and committed count on any step. */
  const stage = (sc: Scene, fx: ReturnType<typeof mountCombatFx>, hits: ReadonlyArray<readonly [HitKind, number]>) => {
    let worst = live(sc), stars = 0;
    for (let t = 0; t <= 60; t++) {
      for (const [kind, at] of hits) if (at === t) {
        const starSys = sc.particleSystems.filter((p) => p.name.startsWith('cfx_star_')), before = starSys.map((p) => Math.max(0, p.manualEmitCount));
        fx.hit(AT.add(new Vector3(0.2 * t, 0, 0)), FROM, kind);
        stars += starSys.some((p, i) => p.manualEmitCount > before[i]) ? 1 : 0;   // this blow queued a star (an earlier one may have given way for it)
        worst = Math.max(worst, committedParticles(sc));
      }
      step(sc);
      worst = Math.max(worst, live(sc));
    }
    return { worst, stars };
  };

  it('a hit landing while the first burst is in the air keeps its star and ring and gives up its streaks', () => {
    const { sc, fx, done } = dojo();
    fx.hit(AT, FROM, 'heavy'); step(sc, 3);
    expect(live(sc)).toBe(5);                                    // the petal and the first hit: a star, two streaks, a ring
    fx.hit(AT, FROM, 'parry');
    expect(queued(sc, 'cfx_star_')).toBe(1);                     // the second blow flashes
    expect(queued(sc, 'cfx_ringp_')).toBe(1);                    // and is answered by its ring
    expect(queued(sc, 'cfx_streak_')).toBe(0);                   // with no streaks of its own
    expect(heldBy(sc, 'cfx_streak_0')).toBe(0);                  // the first hit's streaks gave way for that core
    expect(heldBy(sc, 'cfx_star_0') + heldBy(sc, 'cfx_ringp_0')).toBe(2);   // its star and ring did not
    expect(committedParticles(sc)).toBeLessThanOrEqual(5);
    done();
  });

  it('a staged pair and a staged three of every kind never hold more than 5, on any step, and every blow flashes its star', () => {
    const { sc, fx, done } = dojo();
    const gaps = [0, 1, 3, 6, 10, 16];
    for (const a of HIT_KINDS) for (const b of HIT_KINDS) for (const g of gaps) {
      const r = stage(sc, fx, [[a, 0], [b, g]]);
      expect(r.worst, `${a}+${b} @${g}`).toBeLessThanOrEqual(5);
      expect(r.stars, `${a}+${b} @${g} stars`).toBe(2);
    }
    for (const a of HIT_KINDS) for (const b of HIT_KINDS) for (const c of HIT_KINDS) for (const [g1, g2] of [[0, 0], [0, 4], [3, 6], [5, 12]]) {
      const r = stage(sc, fx, [[a, 0], [b, g1], [c, g2]]);
      expect(r.worst, `${a}+${b}+${c} @${g1},${g2}`).toBeLessThanOrEqual(5);
      expect(r.stars, `${a}+${b}+${c} stars`).toBe(3);
    }
    const four = stage(sc, fx, [['parry', 0], ['break', 0], ['heavy', 0], ['special', 0]]);   // a fourth blow in one frame: the oldest core gives way
    expect(four.worst).toBeLessThanOrEqual(5); expect(four.stars).toBe(4);
    done();
  });

  it('the earlier hits give way oldest first: streaks before any core, then the oldest hit\'s ring', () => {
    const { sc, fx, done } = dojo();
    fx.hit(AT, FROM, 'parry');                                   // star_0, streak_0 (2), ringp_0: the room is full
    fx.hit(AT, FROM, 'break');                                   // streak_0 gives way; star_1 + ringp_1
    expect(heldBy(sc, 'cfx_streak_0')).toBe(0);
    expect([heldBy(sc, 'cfx_star_1'), heldBy(sc, 'cfx_ringp_1')]).toEqual([1, 1]);
    fx.hit(AT, FROM, 'heavy');                                   // no streaks left: the OLDEST hit's ring gives way for star_2; no room for its ring
    expect(heldBy(sc, 'cfx_ringp_0')).toBe(0);
    expect([heldBy(sc, 'cfx_star_0'), heldBy(sc, 'cfx_star_1'), heldBy(sc, 'cfx_ringp_1'), heldBy(sc, 'cfx_star_2')]).toEqual([1, 1, 1, 1]);
    expect(heldBy(sc, 'cfx_ringp_2')).toBe(0);
    expect(committedParticles(sc)).toBe(5);
    done();
  });

  it('a lone phone hit is what it was (kvs-skin): its star, its ring, and the streaks the room leaves; and the rule waits for the burst to die', () => {
    for (const kind of HIT_KINDS) {
      const { sc, fx, done } = dojo();
      fx.hit(AT, FROM, kind);
      const ring = planHit(kind, 'mobile').ring ? 1 : 0;
      expect([queued(sc, 'cfx_star_'), queued(sc, 'cfx_ringp_'), queued(sc, 'cfx_streak_')], kind).toEqual([1, ring, 5 - 1 - 1 - ring]);
      step(sc, 60);                                              // the burst dies: the next blow is a lone hit again, streaks and all
      fx.hit(AT, FROM, kind);
      expect(queued(sc, 'cfx_streak_'), `${kind} again`).toBe(5 - 1 - 1 - ring);
      done();
    }
  });

  it('a hit landing while the petal is between lives leaves the petal its room (it was 6 against 5 when the petal came back)', () => {
    const { sc, fx, done } = dojo();
    const petal = sc.particleSystems.find((p) => p.name === 'amb_petals')!;
    let gap = false;
    for (let i = 0; i < 4000 && !gap; i++) { step(sc); gap = petal.getActiveCount() === 0; }
    expect(gap, 'found a moment between petals').toBe(true);
    fx.hit(AT, FROM, 'light');
    expect(queued(sc, 'cfx_streak_')).toBe(3);                   // what it gets with the petal up: 5 - petal - star
    let worst = 0, back = false;
    for (let i = 0; i < 60; i++) { step(sc); worst = Math.max(worst, live(sc)); back ||= petal.getActiveCount() === 1 && queued(sc, 'cfx_') + sc.particleSystems.filter((p) => p.name.startsWith('cfx_streak_')).reduce((n, p) => n + p.getActiveCount(), 0) > 0; }
    expect(back, 'the petal came back while the streaks were still up').toBe(true);
    expect(worst).toBeLessThanOrEqual(5);
    done();
  });

  it('CONTROL: desktop and high keep every streak of an overlapping hit, and nothing gives way', () => {
    for (const tier of ['desktop', 'high'] as const) {
      const { sc, fx, done } = dojo({ felTier: tier, felModeId: 'karate-vs' });
      fx.hit(AT, FROM, 'heavy'); step(sc, 3);
      const first = live(sc);
      fx.hit(AT, FROM, 'heavy');
      expect(queued(sc, 'cfx_streak_'), tier).toBe(planHit('heavy', tier).streaks);
      expect(queued(sc, 'cfx_ringp_'), tier).toBe(1);
      expect(live(sc), `${tier} first hit untouched`).toBe(first);
      done();
    }
  });

  it('CONTROL: karate (endless, ceiling 12) and a phone mode without a ceiling get exactly what they did before', () => {
    // karate: the first heavy queues its star and ring and asks 9 streaks into the 10 left under 12 (all 9); the second, beside it, finds no room and is
    // trimmed to the PHONE_BURST_FLOOR of 2, as before this lane: it keeps its streaks, and the first keeps all of its (these numbers pass on daa55fb4's code).
    const k = mk({ felTier: 'mobile', felModeId: 'karate' }), fk = mountCombatFx(k);
    fk.hit(AT, FROM, 'heavy');
    expect([queued(k, 'cfx_star_'), queued(k, 'cfx_ringp_'), queued(k, 'cfx_streak_')]).toEqual([1, 1, 9]);
    fk.hit(AT, FROM, 'heavy');
    expect([queued(k, 'cfx_star_'), queued(k, 'cfx_ringp_'), queued(k, 'cfx_streak_')]).toEqual([2, 2, 11]);
    expect(heldBy(k, 'cfx_streak_0')).toBe(9);
    fk.dispose(); k.dispose();
    const o = mk({ felTier: 'mobile', felModeId: 'onevone' }), fo = mountCombatFx(o);
    fo.hit(AT, FROM, 'heavy'); fo.hit(AT, FROM, 'heavy');
    expect(queued(o, 'cfx_streak_')).toBe(2 * planHit('heavy', 'mobile').streaks);
    fo.dispose(); o.dispose();
  });
});
