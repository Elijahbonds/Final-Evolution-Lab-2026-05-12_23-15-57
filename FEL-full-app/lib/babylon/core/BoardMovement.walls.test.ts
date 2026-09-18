// WALLS + SPEED (2026-09-15): a wall turns the board instead of pinning it, a stalled board on a hill slides down it,
// and the three boards are ~35% quicker.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { BoardMovement, BOARD_PACE, SKATE_TUNING, SNOW_TUNING } from './BoardMovement';

describe('BoardMovement.wall', () => {
  it('a board held into a wall never pins: it keeps moving along or away from it', () => {
    const m = new BoardMovement(SKATE_TUNING);
    // skating +x toward a fence at x = 10, 20° off head-on
    m.yaw = Math.PI / 2 - 0.35; m.vel.set(Math.sin(m.yaw) * 6, 0, Math.cos(m.yaw) * 6);
    const pos = new Vector3(9.9, 0, 0);
    let travelled = 0;
    for (let i = 0; i < 90; i++) {                       // 1.5 s holding forward
      const before = pos.clone();
      const v = m.update(1 / 60, 0, 0, undefined, undefined, undefined, 1);
      pos.addInPlace(v.scale(1 / 60));
      if (pos.x > 10) { pos.x = 10; m.wall(-1, 0); }
      travelled += Vector3.Distance(before, pos);
    }
    expect(travelled).toBeGreaterThan(3);             // the old zero-the-speed clamp moved 0.03 m here
    expect(Math.sin(m.yaw)).toBeLessThan(0.95);       // not still aimed straight at the fence
  });

  it('glancing keeps most speed along the wall; head-on bounces back off it', () => {
    const g = new BoardMovement(SKATE_TUNING);
    g.yaw = Math.PI / 2 - 1.1; g.vel.set(Math.sin(g.yaw) * 8, 0, Math.cos(g.yaw) * 8);
    expect(g.wall(-1, 0)).toBe('glance');
    expect(Math.sin(g.yaw)).toBeLessThanOrEqual(0);     // no longer heading into +x
    expect(g.speed).toBeGreaterThan(5);
    const h = new BoardMovement(SKATE_TUNING);
    h.yaw = Math.PI / 2; h.vel.set(8, 0, 0);
    expect(h.wall(-1, 0)).toBe('bounce');
    expect(Math.sin(h.yaw)).toBeLessThan(-0.9);
    expect(h.speed).toBeGreaterThan(1.4);
    expect(h.speed).toBeLessThan(4);
  });

  it('a board already leaving the wall is left alone', () => {
    const m = new BoardMovement(SKATE_TUNING);
    m.yaw = -Math.PI / 2; m.vel.set(-5, 0, 0);
    expect(m.wall(-1, 0)).toBeNull();
    expect(m.speed).toBeCloseTo(5);
  });
});

describe('the hill takes a stalled board', () => {
  it('a snowboard stopped across the fall line swings downhill and gets going', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    // a 15° piste falling toward +z
    const piste = MeshBuilder.CreateGround('piste', { width: 200, height: 200 }, scene);
    piste.rotation.x = 15 * Math.PI / 180;
    piste.computeWorldMatrix(true);
    const m = new BoardMovement(SNOW_TUNING);
    m.yaw = Math.PI / 2;                                  // broadside, stopped
    const pos = new Vector3(0, 0, 0);
    for (let i = 0; i < 120; i++) {
      pos.y = -Math.tan(15 * Math.PI / 180) * pos.z;     // stay on the plane
      const v = m.update(1 / 60, 0, 0, scene, pos, [piste]);
      pos.addInPlace(v.scale(1 / 60));
    }
    const fallYaw = Math.atan2(0, 1);
    const off = Math.abs(Math.atan2(Math.sin(m.yaw - fallYaw), Math.cos(m.yaw - fallYaw)));
    expect(m.speed).toBeGreaterThan(2);
    expect(off).toBeLessThan(1.2);
    scene.dispose(); engine.dispose();
  });
});

describe('board pace', () => {
  it('skate and snow cruise ~35% faster than the 2026-09-12 tune', () => {
    expect(BOARD_PACE).toBeCloseTo(1.35);
    expect(SKATE_TUNING.cruiseSpeed).toBeCloseTo(5.6 * 1.35);
    expect(SNOW_TUNING.maxSpeed).toBeCloseTo(17 * 1.35);
  });
});

describe('a carve costs speed, it does not stop the board', () => {
  it('snow holding a light 0.35 carve for a second keeps most of its speed', () => {
    const m = new BoardMovement(SNOW_TUNING);
    m.yaw = 0; m.vel.set(0, 0, 12);
    for (let i = 0; i < 60; i++) m.update(1 / 60, 0.35, 0);
    expect(m.speed).toBeGreaterThan(8);           // per-frame scrub left 12 × 0.886^60 ≈ 0.01
  });
});
