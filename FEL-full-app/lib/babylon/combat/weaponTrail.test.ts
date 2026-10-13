// The weapon streak (lane/vis-combat, 2026-10-13): when it is drawn, how it fades, and the mount on a NullEngine scene.
import { describe, expect, it } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { TRAIL_LEAD_SEC, TRAIL_LOOK, mountWeaponTrail, trailStep, trailWanted } from './weaponTrail';
import { ARSENAL } from './arsenal';

describe('when a swing leaves a streak', () => {
  it('only while it is fast: the end of the wind-up, the active window — never the guard, the recovery or no swing', () => {
    expect(trailWanted('active')).toBe(true);
    expect(trailWanted('startup', 0.05)).toBe(true);
    expect(trailWanted('startup', TRAIL_LEAD_SEC)).toBe(true);
    expect(trailWanted('startup', TRAIL_LEAD_SEC + 0.01)).toBe(false);
    expect(trailWanted('startup')).toBe(false);   // a startup that does not say how long is left draws nothing
    for (const p of ['recovery', 'done', null] as const) expect(trailWanted(p), String(p)).toBe(false);
  });
  it('rises in a few frames and falls over about a tenth of a second, never overshooting', () => {
    let k = 0; const ks: number[] = [];
    for (let i = 0; i < 12; i++) { k = trailStep(k, true, 1 / 60); ks.push(k); }
    expect(ks[2]).toBeGreaterThan(0.6); expect(Math.max(...ks)).toBeLessThanOrEqual(1);
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThanOrEqual(ks[i - 1]);
    let f = 1, frames = 0;
    while (f > 0 && frames < 120) { f = trailStep(f, false, 1 / 60); frames++; }
    expect(frames).toBeGreaterThan(5); expect(frames).toBeLessThan(40);
    expect(trailStep(0.005, false, 1 / 60)).toBe(0);   // a dying trail snaps off rather than hovering at invisible
  });
  it('a fat frame cannot throw the strength past 0..1', () => {
    expect(trailStep(0.2, true, 5)).toBeLessThanOrEqual(1);
    expect(trailStep(0.9, false, 5)).toBeGreaterThanOrEqual(0);
  });
});

describe('what leaves a streak', () => {
  it('the blade and the staff do; the fist and the gauntlet do not', () => {
    expect(TRAIL_LOOK.blade).toBeTruthy(); expect(TRAIL_LOOK.staff).toBeTruthy();
    expect(TRAIL_LOOK.fists).toBeNull(); expect(TRAIL_LOOK.gauntlet).toBeNull();
  });
  it('the tip sits at the end of the real prop: half its length along the prop\'s own axis', () => {
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
    for (const id of ['blade', 'staff'] as const) {
      const prop = ARSENAL.find((w) => w.id === id)!.buildProp!(scene);
      prop.computeWorldMatrix(true);
      const half = prop.getBoundingInfo().boundingBox.extendSize.y;   // the prop's own half-length (its fittings are children: not counted)
      expect(TRAIL_LOOK[id]!.tipY, id).toBeCloseTo(half, 1);
    }
  });
});

describe('the mount', () => {
  const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  it('builds for a blade, is hidden until driven, shows while a swing is active and dims after', () => {
    const prop = MeshBuilder.CreateBox('prop', { height: 0.95 }, scene);
    const t = mountWeaponTrail(scene, prop, 'blade', '#5ad1ff')!;
    expect(t).toBeTruthy();
    const trail = scene.meshes.find((m) => m.name === 'prop_trail')!;
    expect(trail.isVisible).toBe(false);
    for (let i = 0; i < 6; i++) t.drive(1 / 60, 'active');
    expect(trail.isVisible).toBe(true);
    for (let i = 0; i < 60; i++) t.drive(1 / 60, null);
    expect(trail.isVisible).toBe(false);
    t.dispose();
    expect(scene.meshes.some((m) => m.name.startsWith('prop_trail'))).toBe(false);
    expect(scene.transformNodes.some((n) => n.name === 'prop_tip')).toBe(false);
  });
  it('a fist builds nothing', () => {
    const prop = MeshBuilder.CreateBox('fistprop', {}, scene);
    expect(mountWeaponTrail(scene, prop, 'fists', '#fff')).toBeNull();
    expect(mountWeaponTrail(scene, prop, 'gauntlet', '#fff')).toBeNull();
  });
  it('driveSwinging is the same trail for a mode that only knows "is swinging"', () => {
    const prop = MeshBuilder.CreateBox('prop2', { height: 1.9 }, scene);
    const t = mountWeaponTrail(scene, prop, 'staff', '#ff6b7a', 0.95)!;
    for (let i = 0; i < 5; i++) t.driveSwinging(1 / 60, true);
    expect(scene.meshes.find((m) => m.name === 'prop2_trail')!.isVisible).toBe(true);
    t.dispose(); t.dispose();   // a second dispose is harmless
  });
});
