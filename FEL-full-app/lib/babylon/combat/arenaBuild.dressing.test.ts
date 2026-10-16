// The arena dressing (lane/vis-combat, 2026-10-13): the plan as data, then the build on a NullEngine scene.
import { beforeAll, describe, expect, it } from 'vitest';
import type { AbstractMesh } from '@babylonjs/core';
import { FreeCamera, MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { COMBAT_ARENAS } from './arenas';
import {
  LANTERN_EVERY_M, LANTERN_HEX, RIG_CANS, buildArena, fireSpots, gateMaterial, lanternSpots, mergeWallSet, poolSpots, wantsLanterns, wantsOverheadRig,
} from './arenaBuild';
import { floorStyleOf, wallStyleOf } from './arenaPaint';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';

installOffscreenShim();
const arena = (id: string) => COMBAT_ARENAS.find((a) => a.id === id)!;

describe('the dressing plan', () => {
  it('lanterns stand on plaster and stone walls only: the dojo and the gauntlet', () => {
    for (const a of COMBAT_ARENAS) expect(wantsLanterns(a), a.id).toBe(['dojo', 'gauntlet'].includes(a.id));
  });
  it('a lantern every ~3 m of wall, never fewer than one a wall, always ON a wall, facing in', () => {
    for (const id of ['dojo', 'gauntlet']) {
      const a = arena(id), spots = lanternSpots(a);
      const wallLen = a.walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z), 0);
      expect(spots.length, id).toBeGreaterThanOrEqual(Math.floor(wallLen / LANTERN_EVERY_M) - 1);
      expect(spots.length, id).toBeLessThanOrEqual(Math.ceil(wallLen / LANTERN_EVERY_M) + 1);
      if (id === 'dojo') expect(spots.length).toBeGreaterThanOrEqual(a.walls.length);
      for (const s of spots) {
        const d = Math.min(...a.walls.map((w) => {
          const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, t = Math.max(0, Math.min(1, ((s.x - w.a.x) * dx + (s.z - w.a.z) * dz) / (dx * dx + dz * dz)));
          return Math.hypot(s.x - (w.a.x + dx * t), s.z - (w.a.z + dz * t));
        }));
        expect(d, `${id} lantern off its wall`).toBeLessThan(1e-6);
      }
    }
  });
  it('a phone takes every other lantern', () => {
    const a = arena('dojo');
    expect(lanternSpots(a, true).length).toBe(Math.ceil(lanternSpots(a).length / 2));
  });
  it('each lantern throws a pool INSIDE the arena, and each fire pit a bigger orange one', () => {
    for (const id of ['dojo', 'gauntlet']) {
      const a = arena(id), L = lanternSpots(a), P = poolSpots(a);
      expect(P.length).toBe(L.length);
      L.forEach((l, i) => expect(Math.hypot(P[i].x, P[i].z), `${id} pool ${i} is not inside its lantern`).toBeLessThan(Math.hypot(l.x, l.z)));
      expect(P.every((p) => p.hex === LANTERN_HEX)).toBe(true);
    }
    const f = arena('foundry'), pools = poolSpots(f);
    expect(pools.length).toBe(f.hazards.length);
    for (let i = 0; i < pools.length; i++) { expect(pools[i].r).toBeGreaterThan(f.hazards[i].r * 3); expect(pools[i].hex).toBe('#ff7a2a'); }
  });
  it('fire spots are the hazards, one for one', () => {
    expect(fireSpots(arena('foundry'))).toEqual(arena('foundry').hazards.map((h) => ({ x: h.x, z: h.z, r: h.r, kind: h.kind })));
    expect(fireSpots(arena('dojo'))).toEqual([]);
  });
  it('the overhead rig is for the raised, wall-less octagon only: the Pit', () => {
    for (const a of COMBAT_ARENAS) expect(wantsOverheadRig(a), a.id).toBe(a.id === 'pit');
    expect(RIG_CANS).toBeGreaterThanOrEqual(6);
  });
  it('every arena has a floor overlay except one the venue already paints in full', () => {
    for (const a of COMBAT_ARENAS) expect(floorStyleOf(a), a.id).toBeTruthy();
  });
});

// lane/owner-1016 (2026-10-16): a phone draws the walls as one mesh and the cap line as one (karate: 12 of 89 active meshes).
describe('a phone merges the walls and caps into one mesh each', () => {
  const build = (id: string, tier: string) => {
    const scene = new Scene(new NullEngine());
    (scene.metadata ??= {}).felTier = tier;
    new FreeCamera('c', new Vector3(0, 2, -6), scene);
    const a = arena(id), h = buildArena(scene, a);
    const walls = scene.meshes.filter((m) => /^wall_arena_[a-z]+(_\d+)?$/.test(m.name) && !m.name.includes('_pillar_'));
    const caps = scene.meshes.filter((m) => /^arena_[a-z]+_cap(_\d+)?$/.test(m.name));
    return { scene, a, h, walls, caps };
  };
  const verts = (ms: { getTotalVertices(): number }[]) => ms.reduce((n, m) => n + m.getTotalVertices(), 0);
  const union = (ms: AbstractMesh[]) => {
    const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of ms) { m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; lo.minimizeInPlace(b.minimumWorld); hi.maximizeInPlace(b.maximumWorld); }
    return [lo.x, lo.y, lo.z, hi.x, hi.y, hi.z].map((n) => +n.toFixed(4));
  };

  it('CONTROL: desktop and high keep a panel and a cap per wall', () => {
    for (const tier of ['desktop', 'high']) {
      const { a, walls, caps, h } = build('gauntlet', tier);
      expect(walls.length, tier).toBe(a.walls.length);
      expect(caps.length, tier).toBe(a.walls.length);
      h.dispose();
    }
  });

  it('mobile: one wall mesh and one cap mesh, the same geometry and bounds as the separate panels', () => {
    const d = build('gauntlet', 'desktop'), m = build('gauntlet', 'mobile');
    expect(m.walls.length).toBe(1);
    expect(m.caps.length).toBe(1);
    expect(m.walls[0].name).toBe('wall_arena_gauntlet');            // the camera's venue-shell test keys on `wall_`
    expect(verts(m.walls)).toBe(verts(d.walls));
    expect(verts(m.caps)).toBe(verts(d.caps));
    expect(union(m.walls)).toEqual(union(d.walls));                 // CameraDirector's bounds read this union
    expect(union(m.caps)).toEqual(union(d.caps));
    expect(m.walls[0].material).toBeTruthy();
    expect(m.walls[0].receiveShadows).toBe(true);
    expect(m.walls[0].isPickable).toBe(false);
    expect(m.walls[0].parent?.name).toBe('arena_gauntlet');
    m.h.dispose(); d.h.dispose();
    expect(m.scene.meshes.length, 'the merged meshes outlived the arena').toBe(0);
  });

  it('the cage keeps its rope panels on a phone (translucent rails, not a painted slab)', () => {
    const { a, scene, h } = build('cage', 'mobile');
    expect(scene.meshes.filter((x) => x.name.startsWith('wall_arena_cage_') && !x.name.includes('pillar')).length).toBe(a.walls.length);
    h.dispose();
  });

  it('mergeWallSet refuses a root that is not at the origin (the bake would apply its transform twice)', () => {
    const scene = new Scene(new NullEngine());
    const root = new TransformNode('r', scene); root.position.set(5, 0, 0);
    const a = MeshBuilder.CreateBox('a', { size: 1 }, scene), b = MeshBuilder.CreateBox('b', { size: 1 }, scene);
    a.parent = root; b.parent = root;
    expect(mergeWallSet([a, b], 'm', root)).toBeNull();
    expect(scene.meshes.length).toBe(2);
  });
});

describe('buildArena on a null engine', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 2, -6), scene); });

  for (const a of COMBAT_ARENAS) {
    it(`${a.id}: builds, ticks, and disposes to nothing`, () => {
      const before = scene.meshes.length, beforeSys = scene.particleSystems.length;
      const h = buildArena(scene, a, { lift: 0 });
      expect(scene.meshes.length).toBeGreaterThan(before);
      expect(scene.meshes.filter((m) => m.name.startsWith('wall_arena_')).length).toBeGreaterThanOrEqual(a.walls.length);
      expect(scene.meshes.some((m) => m.name === `arena_${a.id}_floor_overlay`)).toBe(true);
      for (let i = 0; i < 30; i++) h.tick(1 / 60);
      h.dispose();
      expect(scene.meshes.length, 'a mesh outlived the arena').toBe(before);
      expect(scene.particleSystems.length, 'a particle system outlived the arena').toBe(beforeSys);
    });
  }

  it('the dojo\'s lanterns are ONE thin-instanced mesh named for the glow include list', () => {
    const a = arena('dojo'), h = buildArena(scene, a);
    const lan = scene.meshes.find((m) => m.name === `lantern_arena_${a.id}`)!;
    expect(lan).toBeTruthy();
    expect(lan.thinInstanceCount).toBe(lanternSpots(a).length);
    h.dispose();
  });

  it('the foundry burns: flame and ember systems for each pit, and its steel wall paints', () => {
    const a = arena('foundry'), n0 = scene.particleSystems.length, h = buildArena(scene, a);
    expect(scene.particleSystems.length - n0).toBe(a.hazards.length * 2);
    expect(scene.materials.some((m) => m.name === 'arena_foundry_wall_m')).toBe(true);
    h.dispose();
  });

  it('the foundry\'s pillars wear the same riveted plate as its walls (three plates round, the hazard band at the foot)', () => {
    const a = arena('foundry'), h = buildArena(scene, a);
    const wall = scene.materials.find((m) => m.name === 'arena_foundry_wall_m') as { albedoTexture?: unknown };
    const pillar = scene.materials.find((m) => m.name === 'arena_foundry_pillar_m') as { albedoTexture?: unknown };
    expect(wall.albedoTexture).toBeTruthy();
    expect(pillar.albedoTexture).toBe(wall.albedoTexture);
    h.dispose();
    const d = buildArena(scene, arena('dojo'));   // an arena without pillars builds none, and its walls stay its own
    expect(scene.meshes.filter((m) => m.name.includes('_pillar_')).length).toBe(0);
    d.dispose();
  });

  it('the cage is ropes: a neon rail material, padded corner posts, no painted slab', () => {
    const a = arena('cage'), h = buildArena(scene, a);
    expect(scene.materials.some((m) => m.name === 'neon_arena_cage_rail_m')).toBe(true);
    expect(scene.meshes.filter((m) => m.name.startsWith('arena_cage_postpad_')).length).toBe(a.walls.length);
    expect(wallStyleOf(a)).toBe('ropes');
    h.dispose();
  });

  it('the pit hangs eight cans and their beams, as two thin-instanced meshes', () => {
    const a = arena('pit'), h = buildArena(scene, a, { lift: 0 });
    const cans = scene.meshes.find((m) => m.name === `flood_arena_${a.id}_cans`)!, beams = scene.meshes.find((m) => m.name === `arena_${a.id}_beams`)!;
    expect(cans.thinInstanceCount).toBe(RIG_CANS); expect(beams.thinInstanceCount).toBe(RIG_CANS);
    h.dispose();
  });

  it('a phone build is lighter: fewer lanterns, fewer flame particles', () => {
    const phone = new Scene(new NullEngine()); phone.metadata = { felTier: 'mobile' };
    const a = arena('dojo'), hp = buildArena(phone, a), hd = buildArena(scene, a);
    expect(phone.meshes.find((m) => m.name === `lantern_arena_${a.id}`)!.thinInstanceCount).toBeLessThan(scene.meshes.find((m) => m.name === `lantern_arena_${a.id}`)!.thinInstanceCount);
    hp.dispose(); hd.dispose();
    const f = arena('foundry'), fp = buildArena(phone, f), fd = buildArena(scene, f);
    const cap = (s: Scene) => s.particleSystems.find((p) => p.name.includes('flames'))!.getCapacity();
    expect(cap(phone)).toBeLessThan(cap(scene));
    fp.dispose(); fd.dispose();
  });

  it('the Showdown gate is a lit timber door in the arena\'s accent that owns its texture', () => {
    const a = arena('dojo'), m = gateMaterial(scene, a);
    expect(m.albedoTexture).toBeTruthy();
    expect(m.name).toBe('arena_dojo_gate_m');
    const tex = m.albedoTexture!;
    m.dispose(false, true);
    expect(tex.isDisposed?.() ?? true).toBe(true);
  });

  it('the duel stands its arena on a lift: the overlay and the lanterns lift with it', () => {
    const a = arena('pit'), h = buildArena(scene, a, { lift: 0.4 });
    expect(scene.meshes.find((m) => m.name === `arena_${a.id}_floor_overlay`)!.position.y).toBeCloseTo(0.414, 3);
    h.dispose();
  });
});
