// vis-foundation-2 A9.14 (routed from vis-combat) — the shared ground-decal pool.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CARVE_TINT, DECAL_KINDS, DECAL_SIZE, decalAlpha, decalCap, decalLife, mountGroundDecals, mountSceneDecals, nextSlot } from './GroundDecals';
import { HELD_PROBE_MODE, holdProbeMode } from '../../../tests/helpers/heldMode';

function rig(modeId = 'karate') {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 3, -6), scene);
  (scene.metadata ??= {}).felModeId = modeId;
  return { scene, frame: (n: number) => { for (let i = 0; i < n; i++) scene.render(); } };
}

describe('decal life', () => {
  it('fully there for most of its life, then fading to nothing', () => {
    expect(decalAlpha(0, 10)).toBe(1);
    expect(decalAlpha(5.9, 10)).toBe(1);
    expect(decalAlpha(8, 10)).toBeCloseTo(0.5, 6);
    expect(decalAlpha(10, 10)).toBe(0);
    expect(decalAlpha(-1, 10)).toBe(0);
  });
  it('the ring buffer wraps; phones hold fewer marks for less time', () => {
    expect(nextSlot(-1, 4)).toBe(0); expect(nextSlot(3, 4)).toBe(0);
    expect(decalCap('mobile')).toBeLessThan(decalCap('desktop'));
    expect(decalLife('mobile')).toBeLessThan(decalLife('high'));
  });
});

describe('the pool', () => {
  it('one mesh per kind however many marks; full pools reuse the oldest; marks fade out', () => {
    const { scene, frame } = rig();
    const d = mountGroundDecals(scene, 'mobile');
    for (let i = 0; i < decalCap('mobile') + 10; i++) d.stamp('foot', i * 0.3, 0, 0.2);
    d.stamp('scuff', 0, 1, 1);
    const meshes = scene.meshes.filter((m) => m.name.startsWith('fel_decal_'));
    expect(meshes.map((m) => m.name).sort()).toEqual(['fel_decal_foot', 'fel_decal_scuff']);
    expect(d.live('foot')).toBe(decalCap('mobile'));
    expect(meshes.every((m) => !m.isPickable)).toBe(true);
    frame(Math.ceil(decalLife('mobile') * 60) + 5);
    expect(d.live('foot')).toBe(0);
    d.dispose();
    expect(scene.meshes.some((m) => m.name.startsWith('fel_decal_'))).toBe(false);
  });
  it('a carve mark takes a tint and lies on a slope: the instance colour and the pitch reach the buffers', () => {
    const { scene } = rig();
    const d = mountGroundDecals(scene, 'desktop');
    d.stamp('carve', 2, 3, 0.4, { y: 1, pitch: 0.2, tint: CARVE_TINT.snow });
    expect(d.peek('carve')!.rgb.map((v) => +v.toFixed(2))).toEqual([...CARVE_TINT.snow].map((v) => +v.toFixed(2)));
    d.stamp('carve', 4, 3, 0.4);
    expect(d.live('carve')).toBe(2);
    const first = d.peek('carve')!;   // (the second stamp is the newest: untinted, level)
    expect(first.rgb).toEqual([1, 1, 1]);
    expect(first.normalY).toBeCloseTo(1, 5);
    d.stamp('carve', 6, 3, 0, { pitch: 0.3, tint: CARVE_TINT.concrete });
    const t = d.peek('carve')!;
    expect(t.rgb.map((v) => +v.toFixed(2))).toEqual([...CARVE_TINT.concrete].map((v) => +v.toFixed(2)));
    expect(t.normalY).toBeCloseTo(Math.cos(0.3), 4);                                   // tipped onto the slope
    expect(d.peek('foot')).toBeNull();
    d.dispose();
  });
  it('vis-race: a tyre mark is its own kind, the width of a kart\'s rear track, and rides the same pool', () => {
    const { scene } = rig('velocitykart');
    expect(DECAL_KINDS).toContain('tyre');
    expect(DECAL_SIZE.tyre[0]).toBeGreaterThan(1.32);   // wide enough that the pair sits at the rear tyres (1.32 m apart)
    expect(DECAL_SIZE.tyre[1]).toBeGreaterThan(DECAL_SIZE.tyre[0]);
    const d = mountGroundDecals(scene, 'desktop');
    for (let i = 0; i < 5; i++) d.stamp('tyre', 0, i * 1.6, 0);
    expect(d.live('tyre')).toBe(5);
    expect(scene.meshes.filter((m) => m.name === 'fel_decal_tyre')).toHaveLength(1);   // one mesh (thin instances), however many marks
    d.dispose();
  });
  it('the rig puts it on the scene for the modes; never on a held hoops mode', () => {
    const a = rig('karate');
    const h = mountSceneDecals(a.scene, 'desktop')!;
    expect(a.scene.metadata.felDecals).toBeTruthy();
    h.dispose();
    expect(a.scene.metadata.felDecals).toBeUndefined();
    const release = holdProbeMode();
    try { expect(mountSceneDecals(rig(HELD_PROBE_MODE).scene, 'desktop')).toBeNull(); } finally { release(); }
    const c = mountSceneDecals(rig('onevone').scene, 'desktop');   // vis-hoops-court lifted its hold: the court keeps its scuffs
    expect(c).not.toBeNull(); c?.dispose();
    const d = mountSceneDecals(rig('dunk').scene, 'desktop');   // vis-hoops-dunk lifted its hold: dunk, dunkduel and threepoint stamp now
    expect(d).not.toBeNull(); d?.dispose();
  });
});
