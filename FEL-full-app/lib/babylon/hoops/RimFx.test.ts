// vis-hoops-dunk — the rim's light, on a NullEngine: it mounts, answers a make, burns on a streak, ages on the mode's clock and
// leaves nothing behind.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { installOffscreenShim } from '../../../tests/helpers/canvasShim';
import { mountRimFx, FLAME_CAP } from './RimFx';
import { flameRate } from './hoopsLook';

beforeAll(() => installOffscreenShim());
const RIM = new Vector3(0, 3.05, -0.6);
const rig = () => { const scene = new Scene(new NullEngine()); new FreeCamera('cam', new Vector3(0, 3, -8), scene); return scene; };
const names = (s: Scene): string[] => s.meshes.map((m) => m.name);
const sock = (s: Scene) => s.getMeshByName('hoops_netglow')!;
const flame = (s: Scene) => s.particleSystems.find((p) => p.name === 'hoops_flame')!;

describe('RimFx', () => {
  it('mounts the ring pool, the net sock (dark) and a flame system that is not yet emitting', () => {
    const s = rig(); const h = mountRimFx(s, RIM, 'desktop');
    expect(names(s).filter((n) => n.startsWith('fr_shock_')).length).toBe(3);
    expect(sock(s).isEnabled()).toBe(false);
    expect(flame(s).emitRate).toBe(0);
    expect(flame(s).getCapacity()).toBe(FLAME_CAP);
    expect(h.fire).toBe(0);
    h.dispose();
  });
  it('a big make fires a ring at the iron\'s height and lights the net, which dies away again', () => {
    const s = rig(); const h = mountRimFx(s, RIM, 'desktop');
    h.make('big');
    h.update(1 / 60);
    const live = s.meshes.filter((m) => m.name.startsWith('fr_shock_') && m.isEnabled());
    expect(live.length).toBe(1);
    expect(live[0].position.y).toBeCloseTo(RIM.y, 5);   // flat at the rim, not on the floor
    expect(sock(s).isEnabled()).toBe(true);
    for (let i = 0; i < 180; i++) h.update(1 / 60);
    expect(sock(s).isEnabled()).toBe(false);
    expect(s.meshes.filter((m) => m.name.startsWith('fr_shock_') && m.isEnabled()).length).toBe(0);
    h.dispose();
  });
  it('a big make has an echo ring a beat behind; a soft one does not', () => {
    const s = rig(); const h = mountRimFx(s, RIM, 'desktop');
    h.make('soft'); for (let i = 0; i < 20; i++) h.update(1 / 60);
    const soft = s.meshes.filter((m) => m.name.startsWith('fr_shock_') && m.isEnabled()).length;
    h.make('big'); for (let i = 0; i < 12; i++) h.update(1 / 60);
    const big = s.meshes.filter((m) => m.name.startsWith('fr_shock_') && m.isEnabled()).length;
    expect(soft).toBeLessThanOrEqual(1);
    expect(big).toBeGreaterThanOrEqual(2);
    h.dispose();
  });
  it('the streak lights the fire: embers one short, flames at the streak, out when it breaks; the sock holds while it burns', () => {
    const s = rig(); const h = mountRimFx(s, RIM, 'desktop');
    h.streak(2, 3); expect(h.fire).toBe(1); expect(flame(s).emitRate).toBe(flameRate(1, 'desktop'));
    h.streak(3, 3); expect(h.fire).toBe(2); expect(flame(s).emitRate).toBe(flameRate(2, 'desktop'));
    for (let i = 0; i < 90; i++) h.update(1 / 60);
    expect(sock(s).isEnabled()).toBe(true);   // no make in sight, and the net still glows
    h.streak(0, 3); expect(h.fire).toBe(0); expect(flame(s).emitRate).toBe(0);
    for (let i = 0; i < 120; i++) h.update(1 / 60);
    expect(sock(s).isEnabled()).toBe(false);
    h.dispose();
  });
  it('a phone burns half as hard', () => {
    const s = rig(); const h = mountRimFx(s, RIM, 'mobile');
    h.streak(3, 3);
    expect(flame(s).emitRate).toBe(flameRate(2, 'desktop') / 2);
    h.dispose();
  });
  it('ages on the clock it is given: no update, no movement', () => {
    const s = rig(); const h = mountRimFx(s, RIM, 'desktop');
    h.make('money');
    const r = s.meshes.find((m) => m.name.startsWith('fr_shock_') && m.isEnabled())!;
    const x0 = r.scaling.x;
    for (let i = 0; i < 30; i++) s.render();   // the scene renders; the mode's clock has not ticked (a hit-stop)
    expect(r.scaling.x).toBe(x0);
    h.update(0.1); expect(r.scaling.x).not.toBe(x0);
    h.dispose();
  });
  it('dispose takes every mesh, material and particle system it made, and is safe twice', () => {
    const s = rig();
    const before = { meshes: s.meshes.length, ps: s.particleSystems.length };
    const h = mountRimFx(s, RIM, 'desktop');
    h.make('money'); h.streak(3, 3); h.update(0.05);
    h.dispose(); h.dispose();
    expect(s.meshes.length).toBe(before.meshes);
    expect(s.particleSystems.filter((p) => p.name === 'hoops_flame').length).toBe(0);
    expect(s.materials.some((m) => m.name === 'hoops_netglow_m')).toBe(false);
    h.make('big'); h.update(0.1); h.streak(3, 3);   // a late call into a disposed handle is a no-op, not a throw
  });
});
