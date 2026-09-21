// WALLS + SPEED (2026-09-15): a wall turns the board instead of pinning it, a stalled board on a hill slides down it,
// and the three boards are ~35% quicker.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { BoardMovement, BOARD_PACE, SKATE_TUNING, SNOW_TUNING, SURF_TUNING, WALL_BOUNCE_MIN, WALL_SLAM_SPEED } from './BoardMovement';

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

// WALL-UNSTUCK (2026-09-21): the repro the owner felt — the stick HELD toward the wall. Before: every frame was a fresh
// glance with its own speed tax (17–31 contacts in 5 s, the board dragged to 1.2 m/s against the fence).
/** Ride a 10 m box for `sec`, fence on +x (and +z when `corner`), stick held. Returns the run's numbers. */
function scrape(tune: typeof SKATE_TUNING, steer: number, yaw0: number, corner: boolean, sec = 5) {
  const m = new BoardMovement(tune);
  m.yaw = yaw0; m.vel.set(Math.sin(yaw0) * 6, 0, Math.cos(yaw0) * 6);
  const pos = new Vector3(9.5, 0, corner ? 9.5 : 0);
  let taxed = 0, touches = 0, lastTouch = -99, minSpeed = Infinity, still = 0, longestStill = 0, travelled = 0;
  for (let i = 0; i < sec * 60; i++) {
    const before = pos.clone();
    const v = m.update(1 / 60, steer, 0, undefined, undefined, undefined, 1);
    pos.addInPlace(v.scale(1 / 60));
    const hx = pos.x > 10, hz = corner && pos.z > 10;
    if (hx) pos.x = 10; if (hz) pos.z = 10;
    if (hx || hz) { if (i - lastTouch > 15) touches++; lastTouch = i; const s0 = m.speed; if (m.wall(hx ? -1 : 0, hz ? -1 : 0) && m.speed < s0 - 1e-6) taxed++; }
    const d = Vector3.Distance(before, pos); travelled += d;
    still = d < 0.01 ? still + 1 : 0; longestStill = Math.max(longestStill, still);
    if (i > 20) minSpeed = Math.min(minSpeed, m.speed);
  }
  return { taxed, touches, minSpeed, longestStill, travelled };
}

describe('WALL-UNSTUCK: the stick held into a wall', () => {
  const headings = [Math.PI / 2, Math.PI / 2 - 0.35, Math.PI / 2 - 1.1, 0.47];
  it('never soft-locks: no heading, steer or corner leaves the board still for even a quarter second', () => {
    for (const corner of [false, true]) for (const steer of [-1, -0.5, 0, 0.5, 1]) for (const yaw of headings) {
      const r = scrape(SKATE_TUNING, steer, corner ? Math.PI / 4 : yaw, corner);
      expect(r.longestStill, `steer ${steer} yaw ${yaw.toFixed(2)} corner ${corner}`).toBeLessThan(15);
      expect(r.travelled, `steer ${steer} yaw ${yaw.toFixed(2)} corner ${corner}`).toBeGreaterThan(20);   // 5 s of riding, not scraping
    }
  });
  it('a scrape is one contact: the speed tax is paid once per touch, not once per frame', () => {
    for (const steer of [0.5, 1]) for (const yaw of headings) {
      const r = scrape(SKATE_TUNING, steer, yaw, false);
      expect(r.taxed, `steer ${steer} yaw ${yaw.toFixed(2)}`).toBeLessThanOrEqual(r.touches);   // one tax per separate touch (circling back is a new one); was 17–31 taxes
      expect(r.minSpeed, `steer ${steer} yaw ${yaw.toFixed(2)}`).toBeGreaterThan(2);          // was 1.2 — and that floor is the head-on bounce, not the scrape
    }
  });
  it('while on the wall the steer cannot re-aim the nose into it; steering away still works', () => {
    const m = new BoardMovement(SKATE_TUNING);
    m.yaw = Math.PI / 2 - 1.1; m.vel.set(Math.sin(m.yaw) * 6, 0, Math.cos(m.yaw) * 6);
    expect(m.wall(-1, 0)).toBe('glance');
    expect(m.onWall).toBe(true);
    for (let i = 0; i < 10; i++) { m.update(1 / 60, 1, 0); expect(Math.sin(m.yaw)).toBeLessThanOrEqual(0); }   // +steer turns toward +x here
    const away = new BoardMovement(SKATE_TUNING);
    away.yaw = Math.PI / 2 - 1.1; away.vel.set(Math.sin(away.yaw) * 6, 0, Math.cos(away.yaw) * 6);
    away.wall(-1, 0); const y0 = away.yaw;
    for (let i = 0; i < 10; i++) away.update(1 / 60, -1, 0);
    expect(away.yaw).toBeLessThan(y0 - 0.2);           // the stick away from the wall turns the board off it, unhindered
  });
  it('a stalled board nosed into a wall is knocked clear of it', () => {
    const m = new BoardMovement(SKATE_TUNING);
    m.yaw = Math.PI / 2; m.vel.set(0.2, 0, 0);
    expect(m.wall(-1, 0)).toBe('bounce');
    expect(m.speed).toBeGreaterThanOrEqual(WALL_BOUNCE_MIN);
    expect(Math.sin(m.yaw)).toBeLessThan(-0.9);
  });
  it('BAIL HONESTY: riding into a wall at cruise is a slam the mode can read, and it faces the rider back out', () => {
    const m = new BoardMovement(SKATE_TUNING);
    const fast = SKATE_TUNING.cruiseSpeed;                       // 8.96 — the pace a rider actually holds
    expect(fast).toBeGreaterThan(WALL_SLAM_SPEED);
    m.yaw = Math.PI / 2; m.vel.set(fast, 0, 0);                  // straight at the +x wall
    expect(m.wall(-1, 0)).toBe('bounce');
    expect(m.slammedWall).toBe(true);
    expect(Math.sin(m.yaw)).toBeLessThan(-0.9);                  // and he gets up pointing away from what he hit
  });
  it('a bump is not a slam: a slow nose-in, a glance at speed and a scrape all leave the body alone', () => {
    const slow = new BoardMovement(SKATE_TUNING);
    slow.yaw = Math.PI / 2; slow.vel.set(WALL_SLAM_SPEED - 2, 0, 0);
    expect(slow.wall(-1, 0)).toBe('bounce');
    expect(slow.slammedWall).toBe(false);                        // rolled into it, did not ride into it

    const glancing = new BoardMovement(SKATE_TUNING);
    glancing.yaw = Math.PI / 2 - 1.1; glancing.vel.set(Math.sin(glancing.yaw) * 12, 0, Math.cos(glancing.yaw) * 12);
    expect(glancing.wall(-1, 0)).toBe('glance');
    expect(glancing.slammedWall).toBe(false);                    // scraping along a wall is not falling off one

    const held = new BoardMovement(SKATE_TUNING);                // still on the wall: the second contact is the same crash
    held.yaw = Math.PI / 2; held.vel.set(12, 0, 0);
    held.wall(-1, 0); expect(held.slammedWall).toBe(true);
    held.yaw = Math.PI / 2; held.vel.set(12, 0, 0);
    held.wall(-1, 0); expect(held.slammedWall).toBe(false);
  });
  it('a corner bounces out from an angle a single wall would only glance at', () => {
    const m = new BoardMovement(SKATE_TUNING);
    m.yaw = 0.2; m.vel.set(Math.sin(0.2) * 6, 0, Math.cos(0.2) * 6);   // mostly +z, a little +x, into the +x/+z corner
    expect(m.wall(-1, -1)).toBe('bounce');
    expect(Math.sin(m.yaw) + Math.cos(m.yaw)).toBeLessThan(0);         // heading back out of the corner
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
  it('all three boards cruise ~19% faster than the 2026-09-15 tune (1.35 -> 1.6 on the 2026-09-12 base)', () => {
    expect(BOARD_PACE).toBeCloseTo(1.6);
    expect(BOARD_PACE / 1.35).toBeGreaterThan(1.15);
    expect(SKATE_TUNING.cruiseSpeed).toBeCloseTo(5.6 * 1.6);
    expect(SNOW_TUNING.maxSpeed).toBeCloseTo(17 * 1.6);
    expect(SURF_TUNING.cruiseSpeed).toBeCloseTo(6.2 * 1.6);
  });
  it('the pace the stick HOLDS is faster and still a ramp: 4 s forward is > 30 m (was 24.9), no frame steps the speed', () => {
    const m = new BoardMovement(SKATE_TUNING);
    let dist = 0, prev = 0, maxStep = 0, held = 0, peak = 0;
    for (let i = 0; i < 600; i++) {
      const sp = m.update(1 / 60, 0, 0, undefined, undefined, undefined, 1).length();
      if (i < 240) dist += sp / 60;
      if (i >= 300) { held += sp / 300; peak = Math.max(peak, sp); }
      maxStep = Math.max(maxStep, sp - prev); prev = sp;
    }
    expect(dist).toBeGreaterThan(30);
    expect(held).toBeGreaterThan(8.4);                 // the mean of the held pace over 5 s — was 7.1
    expect(peak).toBeLessThanOrEqual(SKATE_TUNING.cruiseSpeed * 1.15);   // the stroke in flight crests a little over cruise, never near the 16.8 ceiling
    expect(maxStep).toBeLessThan(0.25);                // m/s per frame — a push is a ramp, never a teleport
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
