// vis-board (wave 2) — the Warehouse's light: where the lamps hang, what a phone gets, and that the shared rig finds them.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { LAMP_Y, lampSpots, mountWarehouseDressing, warehouseBudget } from './warehouseDressing';
import { fixtureRole } from '../scene/FixtureLights';
import { glowCandidate } from '../scene/EmissiveGlow';

describe('where the lamps hang', () => {
  it('two rows a third of the way in, inside the room, evenly along x', () => {
    const s = lampSpots(48, 4);
    expect(s).toHaveLength(8);
    expect(new Set(s.map((p) => p.z)).size).toBe(2);
    for (const p of s) { expect(Math.abs(p.x)).toBeLessThan(48 * 0.7); expect(Math.abs(p.z)).toBeLessThan(48 * 0.5); }
    expect(lampSpots(48, 1)).toHaveLength(2);
  });
  it('a phone gets half the lamps and under half the motes', () => {
    expect(warehouseBudget('mobile').perRow).toBeLessThan(warehouseBudget('desktop').perRow);
    expect(warehouseBudget('mobile').motes).toBeLessThan(warehouseBudget('high').motes / 2);
  });
});

describe('mounted', () => {
  const scene = () => {
    const engine = new NullEngine();
    const sc = new Scene(engine);
    new FreeCamera('cam', new Vector3(0, 3, -6), sc);
    return sc;
  };
  it('every lamp head is a fixture the shared rig lights and glows; the room is gone when disposed', () => {
    const sc = scene();
    const h = mountWarehouseDressing(sc, 48, 'desktop');
    const heads = sc.meshes.filter((m) => m.name.startsWith('lhead_'));
    expect(heads).toHaveLength(h.lamps);
    for (const m of heads) {
      expect(fixtureRole(m.name, m.material?.name)).toBe('lamp');
      expect(glowCandidate(m.name, m.material?.name, 1, false)).toBe(true);
      expect(m.position.y).toBe(LAMP_Y);
    }
    // the shafts and the beams are NOT fixtures: no second light, no halo on a cone of haze
    for (const m of sc.meshes.filter((x) => /^wh_(shaft|gantry|shade|cable)/.test(x.name))) {
      expect(fixtureRole(m.name, m.material?.name), m.name).toBeNull();
      expect(glowCandidate(m.name, m.material?.name, 1, false), m.name).toBe(false);
      expect(m.isPickable).toBe(false);
    }
    h.dispose();
    expect(sc.meshes.filter((m) => /^(wh_|lhead_wh)/.test(m.name))).toHaveLength(0);
    expect(sc.particleSystems.filter((p) => p.name === 'wh_dust')).toHaveLength(0);
  });
});

// ── City Plaza's skyline and traffic (plazaCity.ts) ──
import { carAt, mountPlazaCity, skylineSpots } from './plazaCity';
describe('the city behind the plaza', () => {
  it('towers on a ring past the fence: every one clear of the plaza, 14–50 m tall, in order round the compass', () => {
    const t = skylineSpots(62, 30);
    expect(t).toHaveLength(30);
    for (const b of t) { expect(Math.max(Math.abs(b.x), Math.abs(b.z))).toBeGreaterThan(62 + 20); expect(b.h).toBeGreaterThanOrEqual(14); expect(b.h).toBeLessThanOrEqual(50); }
    expect(skylineSpots(62, 30)).toEqual(t);                                           // the same city every build
    expect(skylineSpots(62, 15)).toHaveLength(15);
  });
  it('a car drives its lane and wraps: always on the road, x constant, z advances with the lane\'s direction', () => {
    const len = 270;
    for (let i = 0; i < 12; i++) {
      const a = carAt(i, 0, 62, len), b = carAt(i, 1, 62, len);
      expect(Math.abs(a.x)).toBeGreaterThan(62 + 10); expect(b.x).toBe(a.x);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(len / 2); expect(Math.abs(b.z)).toBeLessThanOrEqual(len / 2);
      const dz = ((b.z - a.z + len * 1.5) % len) - len / 2;                         // the shortest signed step
      expect(Math.sign(dz)).toBe(a.yaw === 0 ? 1 : -1);
      expect(a.speed).toBeGreaterThanOrEqual(7); expect(a.speed).toBeLessThanOrEqual(12);
    }
    const wrapped = carAt(0, 1000, 62, len); expect(Math.abs(wrapped.z)).toBeLessThanOrEqual(len / 2);
  });
  it('mounts as a few draws (four towers\' tints, two road strips, one car mesh) and is gone when disposed', () => {
    const engine = new NullEngine(); const sc = new Scene(engine); new FreeCamera('cam', new Vector3(0, 3, -6), sc);
    const c = mountPlazaCity(sc, 62, 'desktop');
    expect(c.cars).toBe(12);
    const mine = sc.meshes.filter((m) => /^plaza_(city|road|car)/.test(m.name));
    expect(mine.length).toBeLessThanOrEqual(7);
    expect(sc.getMeshByName('plaza_car')!.thinInstanceCount).toBe(12);
    c.update(0.5);
    c.dispose();
    expect(sc.meshes.filter((m) => /^plaza_(city|road|car)/.test(m.name))).toHaveLength(0);
  });
});
